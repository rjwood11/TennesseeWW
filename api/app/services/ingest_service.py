from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx

from app.core.cache import SqliteCache
from app.core.config import get_settings, load_gauges, load_models, load_sites
from app.domain.advisory import compute_status
from app.domain.features import compute_day_features
from app.domain.flow_rating import classify_flow_vs_stats
from app.domain.model_eval import ModelExpressionError, evaluate_expression
from app.domain.schemas import ForecastRow
from app.providers.dropbox_sampling import fetch_sampling_latest
from app.providers.openmeteo import fetch_rain_windows
from app.providers.usgs_nwis_iv import fetch_usgs_latest
from app.providers.usgs_nwis_stats import fetch_usgs_flow_daily_stats

logger = logging.getLogger(__name__)


class IngestService:
    def __init__(self, cache: SqliteCache):
        self.cache = cache

    async def ingest(self) -> list[ForecastRow]:
        settings = get_settings()
        sites = load_sites()
        gauges = load_gauges()
        models = load_models()
        thresholds = models.defaults.thresholds
        now_utc = datetime.now(timezone.utc)

        async with httpx.AsyncClient() as client:
            gauge_jobs = [fetch_usgs_latest(g.usgs_site_no, client) for g in gauges]
            gauge_data_list = await asyncio.gather(*gauge_jobs, return_exceptions=True)
            now_local = now_utc.astimezone(ZoneInfo(settings.timezone))
            gauge_stats_jobs = [fetch_usgs_flow_daily_stats(g.usgs_site_no, client, now_local) for g in gauges]
            gauge_stats_list = await asyncio.gather(*gauge_stats_jobs, return_exceptions=True)
            rain_windows = await fetch_rain_windows(
                settings.openmeteo_lat,
                settings.openmeteo_lon,
                settings.timezone,
                client,
                now_utc,
            )
            sampling_by_site = await fetch_sampling_latest(settings.dropbox_sampling_xlsx, sites, client)

        gauge_data: dict[str, dict] = {}
        gauge_flow_stats: dict[str, dict | None] = {}
        for gauge, result in zip(gauges, gauge_data_list, strict=True):
            if isinstance(result, Exception):
                logger.exception("USGS fetch failed for %s", gauge.id, exc_info=result)
                gauge_data[gauge.id] = {"flow": None, "gage": None, "observed_at_usgs": None}
            else:
                gauge_data[gauge.id] = result
        for gauge, result in zip(gauges, gauge_stats_list, strict=True):
            if isinstance(result, Exception):
                logger.exception("USGS stat fetch failed for %s", gauge.id, exc_info=result)
                gauge_flow_stats[gauge.id] = None
            else:
                gauge_flow_stats[gauge.id] = result

        day_features = compute_day_features(now_utc, settings.timezone)
        rows: list[ForecastRow] = []
        for site in sites:
            model = models.models.get(site.id)
            g = gauge_data.get(site.base_gauge_id, {})
            drivers = {
                "flow": g.get("flow"),
                "gage": g.get("gage"),
                **rain_windows,
                "sindoy": day_features["sindoy"],
            }
            flow_stats = gauge_flow_stats.get(site.base_gauge_id)
            flow_rating = classify_flow_vs_stats(g.get("flow"), flow_stats)
            drivers["flow_rating"] = flow_rating
            if flow_stats:
                drivers["flow_stats"] = flow_stats
            pred_ecoli: int | None = None
            if model and model.enabled and model.expression and model.expression != "null":
                required_values = {k: drivers.get(k) for k in model.required}
                if all(v is not None for v in required_values.values()):
                    try:
                        pred_ecoli = int(round(evaluate_expression(model.expression, required_values)))
                    except ModelExpressionError:
                        pred_ecoli = None

            status = compute_status(
                pred_ecoli,
                safe=thresholds.get("safe", 235),
                advisory=thresholds.get("advisory", 350),
                caution=thresholds.get("caution", 750),
            )
            sample_meta = sampling_by_site.get(site.id, {})
            row = ForecastRow(
                site_id=site.id,
                computed_at=now_utc,
                observed_at_usgs=g.get("observed_at_usgs"),
                drivers_json=drivers,
                pred_ecoli=pred_ecoli,
                status=status,
                sample_date=sample_meta.get("sample_date"),
                sample_value=sample_meta.get("sample_value"),
            )
            self.cache.upsert_latest(row)
            self.cache.append_history(row)
            rows.append(row)
        return rows
