from __future__ import annotations

from datetime import datetime
from statistics import mean
from typing import Any

import httpx


USGS_IV_URL = "https://waterservices.usgs.gov/nwis/iv/"


def _parse_param_average(values: list[dict[str, Any]]) -> tuple[float | None, datetime | None]:
    parsed: list[tuple[datetime, float]] = []
    for v in values:
        raw_value = v.get("value")
        if raw_value in (None, "", "NaN"):
            continue
        try:
            num = float(raw_value)
        except (TypeError, ValueError):
            continue
        try:
            ts = datetime.fromisoformat(v.get("dateTime", "").replace("Z", "+00:00"))
        except Exception:  # noqa: BLE001
            continue
        parsed.append((ts, num))
    if not parsed:
        return None, None
    parsed.sort(key=lambda x: x[0], reverse=True)
    top = parsed[:5]
    return mean([x[1] for x in top]), top[0][0]


async def fetch_usgs_latest(site_no: str, client: httpx.AsyncClient) -> dict[str, Any]:
    params = {"format": "json", "sites": site_no, "parameterCd": "00060,00065", "period": "P1D"}
    response = await client.get(USGS_IV_URL, params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()
    series = payload.get("value", {}).get("timeSeries", [])

    by_param: dict[str, list[dict[str, Any]]] = {"00060": [], "00065": []}
    for item in series:
        variable = item.get("variable", {})
        codes = variable.get("variableCode", [])
        param_cd = codes[0].get("value") if codes else None
        vals = item.get("values", [{}])[0].get("value", [])
        if param_cd in by_param:
            by_param[param_cd] = vals

    flow, flow_ts = _parse_param_average(by_param["00060"])
    gage, gage_ts = _parse_param_average(by_param["00065"])
    observed = max([t for t in [flow_ts, gage_ts] if t is not None], default=None)
    return {"flow": flow, "gage": gage, "observed_at_usgs": observed}
