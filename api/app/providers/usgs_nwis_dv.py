from __future__ import annotations

import logging
from datetime import date
from typing import Any

import httpx

from app.providers.http_retry import get_with_retries

logger = logging.getLogger(__name__)


USGS_DV_URL = "https://waterservices.usgs.gov/nwis/dv/"


async def fetch_usgs_daily_values(
    site_no: str,
    start_date: date,
    end_date: date,
    client: httpx.AsyncClient,
) -> dict[str, dict[str, float | None]]:
    params = {
        "format": "json",
        "sites": site_no,
        "parameterCd": "00060,00065",
        "startDT": start_date.isoformat(),
        "endDT": end_date.isoformat(),
    }
    try:
        response = await get_with_retries(
            client,
            USGS_DV_URL,
            params=params,
            timeout=30,
            label=f"USGS daily values fetch for {site_no}",
        )
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("USGS daily values fetch failed for %s; continuing without daily values: %s", site_no, exc)
        return {}
    series = payload.get("value", {}).get("timeSeries", [])

    per_day: dict[str, dict[str, float | None]] = {}
    for item in series:
        variable = item.get("variable", {})
        codes = variable.get("variableCode", [])
        param_cd = codes[0].get("value") if codes else None
        key = "flow" if param_cd == "00060" else "gage" if param_cd == "00065" else None
        if not key:
            continue
        values = item.get("values", [{}])[0].get("value", [])
        for v in values:
            day = _extract_date(v.get("dateTime"))
            if not day:
                continue
            raw = v.get("value")
            val = _to_float(raw)
            if day not in per_day:
                per_day[day] = {"flow": None, "gage": None}
            per_day[day][key] = val
    return per_day


def _extract_date(raw: Any) -> str | None:
    if not isinstance(raw, str) or len(raw) < 10:
        return None
    return raw[:10]


def _to_float(raw: Any) -> float | None:
    if raw in (None, "", "NaN"):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None
