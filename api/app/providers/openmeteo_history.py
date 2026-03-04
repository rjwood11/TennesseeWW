from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pandas as pd

from app.domain.features import MM_TO_IN
from app.providers.openmeteo import OPENMETEO_ARCHIVE_URL, OPENMETEO_24H_FEATURES, OPENMETEO_HOURLY_VARS


async def fetch_weather_daily_features(
    lat: float,
    lon: float,
    timezone_name: str,
    start_date: date,
    end_date: date,
    client: httpx.AsyncClient,
) -> dict[str, dict[str, float]]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": (start_date - timedelta(days=7)).isoformat(),
        "end_date": end_date.isoformat(),
        "hourly": ",".join(OPENMETEO_HOURLY_VARS),
        "timezone": timezone_name,
    }
    response = await client.get(OPENMETEO_ARCHIVE_URL, params=params, timeout=45)
    response.raise_for_status()
    payload = response.json()
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    values = hourly.get("precipitation", [])
    if not values:
        values = hourly.get("rain", [])
    if not times or not values:
        return {}

    mm = pd.Series(pd.to_numeric(values, errors="coerce")).fillna(0.0)
    df = pd.DataFrame({"time": pd.to_datetime(times, errors="coerce"), "mm": mm})
    df = df.dropna(subset=["time"]).copy()
    df["date"] = df["time"].dt.date
    df["rain_in"] = df["mm"] * MM_TO_IN

    rain_by_day = df.groupby("date", as_index=True)["rain_in"].sum().to_dict()

    out: dict[str, dict[str, float]] = {}
    day = start_date
    while day <= end_date:
        rains = [float(rain_by_day.get(day - timedelta(days=i), 0.0)) for i in range(0, 7)]
        rec: dict[str, float] = {
            "rain_1d": rains[0],
            "rain_2d": rains[0] + rains[1],
            "rain_3d": rains[0] + rains[1] + rains[2],
            "rain_5d": rains[0] + rains[1] + rains[2] + rains[3] + rains[4],
            "rain_7d": sum(rains),
        }
        day_slice = df[df["date"] == day]
        for source_name, target_prefix in OPENMETEO_24H_FEATURES.items():
            if source_name not in hourly:
                continue
            series = pd.to_numeric(hourly[source_name], errors="coerce")
            if len(series) != len(df):
                continue
            values_for_day = pd.Series(series, index=df.index).loc[day_slice.index].dropna()
            if values_for_day.empty:
                continue
            rec[f"{target_prefix}_24h_mean"] = float(values_for_day.mean())
            rec[f"{target_prefix}_24h_min"] = float(values_for_day.min())
            rec[f"{target_prefix}_24h_max"] = float(values_for_day.max())
        out[day.isoformat()] = rec
        day += timedelta(days=1)

    return out


def compute_sindoy_for_date(sample_date: date, timezone_name: str) -> float:
    local_dt = datetime(sample_date.year, sample_date.month, sample_date.day, 12, 0, 0, tzinfo=ZoneInfo(timezone_name))
    day_of_year = local_dt.timetuple().tm_yday
    return math.sin(0.01721420632 * day_of_year - 81.75)
