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
from app.core.config import get_settings, load_sites
from app.domain.advisory import compute_status
from app.providers.dropbox_sampling import _load_sampling_df, _read_sampling_content
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
        "--include-predictions",
        action="store_true",
        help="Include model-predicted chart points in static site-chart files (slower).",
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

    thresholds = {"safe": 235, "advisory": 350, "caution": 750}
    measured_by_site = await _load_measured_by_site(args.days)

    for site in load_sites():
        timeseries = {
            "site_id": site.id,
            "days": args.timeseries_days,
            "items": service.get_timeseries(site_id=site.id, days=args.timeseries_days),
        }
        _write_json(output_dir / "v1" / "timeseries" / f"{site.id}.json", timeseries)

        if args.include_predictions:
            chart = await service.get_site_chart(
                site_id=site.id,
                days=args.days,
                include_predictions=True,
            )
        else:
            chart = {
                "site_id": site.id,
                "days": args.days,
                "measured": measured_by_site.get(site.id, []),
                "predicted": [],
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


if __name__ == "__main__":
    asyncio.run(main())
