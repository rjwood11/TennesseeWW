from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

import httpx

from app.core.cache import SqliteCache
from app.core.config import get_settings, load_gauges, load_models, load_sites
from app.domain.advisory import compute_status
from app.domain.model_eval import ModelExpressionError, evaluate_expression
from app.domain.schemas import ForecastResponse, ForecastResponseItem
from app.providers.dropbox_sampling import fetch_sampling_history_for_site
from app.providers.openmeteo_history import compute_sindoy_for_date, fetch_weather_daily_features
from app.providers.usgs_nwis_dv import fetch_usgs_daily_values


class ForecastService:
    def __init__(self, cache: SqliteCache):
        self.cache = cache

    def get_latest(self) -> ForecastResponse:
        sites = {s.id: s for s in load_sites()}
        gauges = {g.id: g for g in load_gauges()}
        rows = self.cache.get_latest()
        items: list[ForecastResponseItem] = []
        for row in rows:
            site = sites.get(row["site_id"])
            if not site:
                continue
            gauge = gauges.get(site.base_gauge_id)
            if not gauge:
                continue
            items.append(
                ForecastResponseItem(
                    site=site,
                    gauge=gauge,
                    computed_at=datetime.fromisoformat(row["computed_at"]),
                    observed_at_usgs=datetime.fromisoformat(row["observed_at_usgs"]) if row["observed_at_usgs"] else None,
                    pred_ecoli=row["pred_ecoli"],
                    status=row["status"],
                    drivers=json.loads(row["drivers_json"]),
                    sample_date=row["sample_date"],
                    sample_value=row["sample_value"],
                )
            )
        generated_at = self.cache.get_last_computed_at() or datetime.now(timezone.utc)
        return ForecastResponse(generated_at=generated_at, items=items)

    def get_timeseries(self, site_id: str, days: int = 7) -> list[dict]:
        rows = self.cache.get_history(site_id=site_id, days=days)
        return [
            {
                "id": row["id"],
                "site_id": row["site_id"],
                "computed_at": row["computed_at"],
                "pred_ecoli": row["pred_ecoli"],
                "status": row["status"],
                "drivers": json.loads(row["drivers_json"]),
            }
            for row in rows
        ]

    async def get_site_chart(
        self,
        site_id: str,
        days: int = 5000,
        include_predictions: bool = False,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict:
        settings = get_settings()
        sites = {s.id: s for s in load_sites()}
        gauges = {g.id: g for g in load_gauges()}
        models = load_models()
        thresholds = models.defaults.thresholds

        site = sites.get(site_id)
        if not site:
            return {"site_id": site_id, "days": days, "measured": [], "predicted": [], "thresholds": thresholds}
        gauge = gauges.get(site.base_gauge_id)
        if not gauge:
            return {"site_id": site_id, "days": days, "measured": [], "predicted": [], "thresholds": thresholds}

        resolved_end = end_date or datetime.now(timezone.utc).astimezone().date()
        resolved_start = start_date or (resolved_end - timedelta(days=max(1, int(days))))
        if resolved_start > resolved_end:
            return {"site_id": site_id, "days": days, "measured": [], "predicted": [], "thresholds": thresholds}

        async with httpx.AsyncClient() as client:
            measured = await fetch_sampling_history_for_site(
                settings.dropbox_sampling_xlsx,
                site,
                client,
                start_date=resolved_start,
                end_date=resolved_end,
            )
            if not measured:
                return {"site_id": site_id, "days": days, "measured": [], "predicted": [], "thresholds": thresholds}

            if include_predictions:
                weather = await fetch_weather_daily_features(
                    settings.openmeteo_lat,
                    settings.openmeteo_lon,
                    settings.timezone,
                    start_date=resolved_start,
                    end_date=resolved_end,
                    client=client,
                )
                usgs = await fetch_usgs_daily_values(
                    gauge.usgs_site_no,
                    start_date=resolved_start,
                    end_date=resolved_end,
                    client=client,
                )
            else:
                weather = {}
                usgs = {}

        measured_with_status = [_measurement_with_status(row, thresholds) for row in measured]

        predicted: list[dict] = []
        if include_predictions:
            model = models.models.get(site.id)
            for row in measured:
                day = row["sample_date"]
                sample_day = date.fromisoformat(day)
                weather_day = weather.get(day, {})
                usgs_day = usgs.get(day, {})
                drivers = {
                    "flow": usgs_day.get("flow"),
                    "gage": usgs_day.get("gage"),
                    "sindoy": compute_sindoy_for_date(sample_day, settings.timezone),
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

                predicted.append(
                    {
                        "sample_date": day,
                        "pred_ecoli": pred_ecoli,
                        "status": compute_status(
                            pred_ecoli,
                            safe=thresholds.get("safe", 235),
                            advisory=thresholds.get("advisory", 350),
                            caution=thresholds.get("caution", 750),
                        ),
                    }
                )

        return {
            "site_id": site_id,
            "days": days,
            "measured": measured_with_status,
            "predicted": predicted,
            "thresholds": thresholds,
        }


def _measurement_with_status(row: dict, thresholds: dict[str, float]) -> dict:
    value = row.get("sample_value")
    parsed = int(round(value)) if isinstance(value, (int, float)) else None
    return {
        "sample_date": row["sample_date"],
        "sample_value": value,
        "status": compute_status(
            parsed,
            safe=thresholds.get("safe", 235),
            advisory=thresholds.get("advisory", 350),
            caution=thresholds.get("caution", 750),
        ),
    }
