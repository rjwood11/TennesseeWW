from __future__ import annotations

import argparse
import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys

import httpx

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.cache import SqliteCache
from app.core.config import get_settings, load_gauges, load_models, load_sites
from app.domain.advisory import compute_status
from app.domain.model_eval import ModelExpressionError, evaluate_expression
from app.providers.dropbox_sampling import _load_sampling_df, _read_sampling_content
from app.providers.openmeteo_history import compute_sindoy_for_date, fetch_weather_daily_features
from app.providers.usgs_nwis_dv import fetch_usgs_daily_values
from app.services.forecast_service import ForecastService
from app.services.ingest_service import IngestService


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Generate static JSON endpoints for GitHub Pages hosting.")
    parser.add_argument(
        "--output-dir",
        default="widget/public/static-api",
        help="Output directory for static API files (default: widget/public/static-api)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=0,
        help="Measured-history window for static site-chart files. Use 0 for all available data (default: 0).",
    )
    parser.add_argument(
        "--timeseries-days",
        type=int,
        default=30,
        help="Days to include in static /v1/timeseries files (default: 30)",
    )
    parser.add_argument(
        "--skip-predictions",
        action="store_true",
        help="Skip model-predicted chart points in static site-chart files.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    output_dir = (repo_root / args.output_dir).resolve() if not Path(args.output_dir).is_absolute() else Path(args.output_dir).resolve()

    settings = get_settings()
    cache = SqliteCache(settings.sqlite_path)
    ingest = IngestService(cache)
    service = ForecastService(cache)

    await ingest.ingest()

    latest = service.get_latest().model_dump(mode="json")
    _write_json(output_dir / "v1" / "forecast.json", latest)

    measured_by_site = await _load_measured_by_site(args.days)
    thresholds = _resolve_thresholds()
    predicted_by_site = {site.id: [] for site in load_sites()}
    if not args.skip_predictions:
        predicted_by_site = await _build_predicted_by_site(measured_by_site, thresholds)

    for site in load_sites():
        timeseries = {
            "site_id": site.id,
            "days": args.timeseries_days,
            "items": service.get_timeseries(site_id=site.id, days=args.timeseries_days),
        }
        _write_json(output_dir / "v1" / "timeseries" / f"{site.id}.json", timeseries)

        chart = {
            "site_id": site.id,
            "days": args.days,
            "measured": measured_by_site.get(site.id, []),
            "predicted": predicted_by_site.get(site.id, []),
            "thresholds": thresholds,
        }
        _write_json(output_dir / "v1" / "site-chart" / f"{site.id}.json", chart)

    print(f"Wrote static API payloads to {output_dir}")


async def _load_measured_by_site(days: int) -> dict[str, list[dict]]:
    settings = get_settings()
    sites = load_sites()
    start_date = datetime.now(timezone.utc).date() - timedelta(days=max(1, days)) if days > 0 else None
    end_date = datetime.now(timezone.utc).date()
    by_site: dict[str, list[dict]] = {site.id: [] for site in sites}

    async with httpx.AsyncClient() as client:
        content = await _read_sampling_content(settings.dropbox_sampling_xlsx, client)
    if content is None:
        return by_site

    df = _load_sampling_df(content)
    if df is None:
        return by_site

    filtered = df.copy()
    if start_date is not None:
        filtered = filtered[(filtered["sample_date"].dt.date >= start_date) & (filtered["sample_date"].dt.date <= end_date)].copy()
    if filtered.empty:
        return by_site

    for site in sites:
        target = "".join(ch.lower() for ch in site.name if ch.isalnum())
        matches = filtered[(filtered["loc_norm"] == target) | (filtered["loc_norm"].str.contains(target, na=False))]
        if matches.empty:
            matches = filtered[filtered["loc_norm"].map(lambda x: target in x if isinstance(x, str) else False)]
        if matches.empty:
            continue
        matches = matches.sort_values("sample_date", ascending=True)
        rows: list[dict] = []
        for _, row in matches.iterrows():
            value = row["sample_value"]
            parsed = int(round(value)) if isinstance(value, (int, float)) and value == value else None
            rows.append(
                {
                    "sample_date": row["sample_date"].date().isoformat(),
                    "sample_value": float(value) if isinstance(value, (int, float)) and value == value else None,
                    "status": compute_status(parsed, safe=235, advisory=350, caution=750),
                }
            )
        by_site[site.id] = rows
    return by_site


def _resolve_thresholds() -> dict[str, float]:
    defaults = load_models().defaults.thresholds
    return {
        "safe": float(defaults.get("safe", 235)),
        "advisory": float(defaults.get("advisory", 350)),
        "caution": float(defaults.get("caution", 750)),
    }


async def _build_predicted_by_site(
    measured_by_site: dict[str, list[dict]],
    thresholds: dict[str, float],
) -> dict[str, list[dict]]:
    settings = get_settings()
    sites = load_sites()
    gauges_by_id = {g.id: g for g in load_gauges()}
    models = load_models().models
    predicted_by_site: dict[str, list[dict]] = {site.id: [] for site in sites}

    all_dates: list[date] = []
    for rows in measured_by_site.values():
        for row in rows:
            try:
                all_dates.append(date.fromisoformat(row["sample_date"]))
            except (KeyError, ValueError, TypeError):
                continue
    if not all_dates:
        return predicted_by_site

    start_date = min(all_dates)
    end_date = max(all_dates)

    async with httpx.AsyncClient() as client:
        weather_task = fetch_weather_daily_features(
            settings.openmeteo_lat,
            settings.openmeteo_lon,
            settings.timezone,
            start_date=start_date,
            end_date=end_date,
            client=client,
        )
        gauge_tasks = {
            gauge_id: fetch_usgs_daily_values(gauge.usgs_site_no, start_date=start_date, end_date=end_date, client=client)
            for gauge_id, gauge in gauges_by_id.items()
        }

        weather_result, *gauge_results = await asyncio.gather(
            weather_task,
            *gauge_tasks.values(),
            return_exceptions=True,
        )

    weather_by_day = weather_result if not isinstance(weather_result, Exception) else {}
    usgs_by_gauge: dict[str, dict[str, dict[str, float | None]]] = {}
    for gauge_id, result in zip(gauge_tasks.keys(), gauge_results, strict=True):
        usgs_by_gauge[gauge_id] = result if not isinstance(result, Exception) else {}

    for site in sites:
        model = models.get(site.id)
        gauge_id = site.base_gauge_id
        usgs_by_day = usgs_by_gauge.get(gauge_id, {})
        rows = measured_by_site.get(site.id, [])
        for row in rows:
            sample_date = row["sample_date"]
            try:
                day = date.fromisoformat(sample_date)
            except ValueError:
                continue
            weather_day = weather_by_day.get(sample_date, {})
            usgs_day = usgs_by_day.get(sample_date, {})
            drivers = {
                "flow": usgs_day.get("flow"),
                "gage": usgs_day.get("gage"),
                "sindoy": compute_sindoy_for_date(day, settings.timezone),
                **weather_day,
            }
            pred_ecoli: int | None = None
            if model and model.enabled and model.expression and model.expression != "null":
                required_values = {k: drivers.get(k) for k in model.required}
                if all(v is not None for v in required_values.values()):
                    try:
                        pred_ecoli = int(round(evaluate_expression(model.expression, required_values)))
                    except ModelExpressionError:
                        pred_ecoli = None
            predicted_by_site[site.id].append(
                {
                    "sample_date": sample_date,
                    "pred_ecoli": pred_ecoli,
                    "status": compute_status(
                        pred_ecoli,
                        safe=thresholds.get("safe", 235),
                        advisory=thresholds.get("advisory", 350),
                        caution=thresholds.get("caution", 750),
                    ),
                }
            )
    return predicted_by_site


if __name__ == "__main__":
    asyncio.run(main())
