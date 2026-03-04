from __future__ import annotations

from datetime import datetime
from io import StringIO

import httpx
import pandas as pd


USGS_STAT_URL = "https://waterservices.usgs.gov/nwis/stat/"


async def fetch_usgs_flow_daily_stats(site_no: str, client: httpx.AsyncClient, now_local: datetime) -> dict[str, float] | None:
    params = {
        "sites": site_no,
        "parameterCd": "00060",
        "statReportType": "daily",
        "statTypeCd": "MIN,P25,MEDIAN,MEAN,P75,MAX",
    }
    response = await client.get(USGS_STAT_URL, params=params, timeout=30)
    response.raise_for_status()
    text = response.text
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    if len(lines) < 3:
        return None

    table_text = "\n".join(lines)
    df = pd.read_csv(StringIO(table_text), sep="\t", dtype=str)
    if len(df) < 2:
        return None
    # First non-comment line is header, second is RDB type hints.
    df = df.iloc[1:].copy()
    for col in ["month_nu", "day_nu", "min_va", "p25_va", "p50_va", "mean_va", "p75_va", "max_va"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    row = df[(df["month_nu"] == now_local.month) & (df["day_nu"] == now_local.day)]
    if row.empty:
        return None
    rec = row.iloc[0]
    return {
        "low": float(rec["min_va"]) if pd.notna(rec["min_va"]) else None,
        "p25": float(rec["p25_va"]) if pd.notna(rec["p25_va"]) else None,
        "median": float(rec["p50_va"]) if pd.notna(rec["p50_va"]) else None,
        "mean": float(rec["mean_va"]) if pd.notna(rec["mean_va"]) else None,
        "p75": float(rec["p75_va"]) if pd.notna(rec["p75_va"]) else None,
        "high": float(rec["max_va"]) if pd.notna(rec["max_va"]) else None,
    }
