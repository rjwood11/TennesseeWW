from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pandas as pd

from app.domain.features import MM_TO_IN


OPENMETEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPENMETEO_HOURLY_VARS = [
    "precipitation",
    "rain",
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "apparent_temperature",
    "pressure_msl",
    "surface_pressure",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
]

OPENMETEO_24H_FEATURES = {
    "temperature_2m": "temp",
    "relative_humidity_2m": "relative_humidity",
    "dew_point_2m": "dew_point",
    "apparent_temperature": "apparent_temp",
    "pressure_msl": "pressure_msl",
    "surface_pressure": "surface_pressure",
    "cloud_cover": "cloud_cover",
    "wind_speed_10m": "wind_speed",
    "wind_gusts_10m": "wind_gust",
}


async def fetch_rain_windows(
    lat: float,
    lon: float,
    timezone_name: str,
    client: httpx.AsyncClient,
    now_utc: datetime,
) -> dict[str, float]:
    local_now = now_utc.astimezone(ZoneInfo(timezone_name))
    start_date = (local_now.date() - timedelta(days=7)).isoformat()
    end_date = local_now.date().isoformat()
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ",".join(OPENMETEO_HOURLY_VARS),
        "timezone": timezone_name,
    }
    response = await client.get(OPENMETEO_ARCHIVE_URL, params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    values = hourly.get("precipitation", [])
    if not values:
        values = hourly.get("rain", [])
    if not times or not values:
        return {"rain_1d": 0.0, "rain_2d": 0.0, "rain_3d": 0.0, "rain_5d": 0.0, "rain_7d": 0.0}

    mm = pd.Series(pd.to_numeric(values, errors="coerce")).fillna(0.0)
    df = pd.DataFrame({"time": pd.to_datetime(times), "mm": mm})
    df["time"] = df["time"].dt.tz_localize(ZoneInfo(timezone_name))
    df["in"] = df["mm"] * MM_TO_IN

    def sum_days(days: int) -> float:
        cutoff = local_now - timedelta(days=days)
        return float(df.loc[df["time"] >= cutoff, "in"].sum())

    result = {
        "rain_1d": sum_days(1),
        "rain_2d": sum_days(2),
        "rain_3d": sum_days(3),
        "rain_5d": sum_days(5),
        "rain_7d": sum_days(7),
    }
    cutoff_24h = local_now - timedelta(days=1)
    df24 = df.loc[df["time"] >= cutoff_24h].copy()

    for source_name, target_prefix in OPENMETEO_24H_FEATURES.items():
        if source_name not in hourly:
            continue
        series = pd.Series(pd.to_numeric(hourly[source_name], errors="coerce"))
        if len(series) != len(df):
            continue
        df24[source_name] = series.loc[df24.index]
        valid = df24[source_name].dropna()
        if valid.empty:
            continue
        result[f"{target_prefix}_24h_mean"] = float(valid.mean())
        result[f"{target_prefix}_24h_min"] = float(valid.min())
        result[f"{target_prefix}_24h_max"] = float(valid.max())

    return result
