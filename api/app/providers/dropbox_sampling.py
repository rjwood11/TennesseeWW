from __future__ import annotations

import logging
import re
from io import BytesIO
from datetime import date
from pathlib import Path

import httpx
import pandas as pd

from app.domain.schemas import Site
from app.providers.http_retry import get_with_retries

logger = logging.getLogger(__name__)

DROPBOX_HEADERS = {
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "User-Agent": "Mozilla/5.0 (compatible; TNWW static exporter)",
}


def _normalize_name(name: object) -> str:
    if name is None:
        return ""
    try:
        if pd.isna(name):
            return ""
    except (TypeError, ValueError):
        pass
    return re.sub(r"[^a-z0-9]+", "", str(name).lower())


def _parse_sample_value(raw: object) -> float | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.startswith(">"):
        text = text[1:]
    try:
        return float(text)
    except ValueError:
        return None


def _pick_column(columns: list[str], candidates: list[str]) -> str | None:
    lowered = {c.lower(): c for c in columns}
    for candidate in candidates:
        for key, original in lowered.items():
            if candidate in key:
                return original
    return None


async def fetch_sampling_latest(dropbox_url: str, sites: list[Site], client: httpx.AsyncClient) -> dict[str, dict]:
    if not dropbox_url:
        return {}
    content = await _read_sampling_content(dropbox_url, client)
    if content is None:
        return {}
    df = _load_sampling_df(content)
    if df is None:
        return {}

    by_site: dict[str, dict] = {}
    for site in sites:
        target = _normalize_name(site.name)
        matches = df[(df["loc_norm"] == target) | (df["loc_norm"].str.contains(target, na=False))]
        if matches.empty:
            matches = df[df["loc_norm"].map(lambda x: target in x if isinstance(x, str) else False)]
        if matches.empty:
            continue
        sample = _latest_reported_sample(matches)
        if sample is not None:
            by_site[site.id] = sample
    return by_site


def _is_reported_sample_value(value: object) -> bool:
    return isinstance(value, (int, float)) and pd.notna(value) and value != 0


def _latest_reported_sample(matches: pd.DataFrame) -> dict | None:
    reported = matches[matches["sample_value"].map(_is_reported_sample_value)]
    if reported.empty:
        return None
    row = reported.iloc[0]
    sample_date = row["sample_date"]
    return {
        "sample_date": sample_date.date().isoformat() if hasattr(sample_date, "date") else str(sample_date),
        "sample_value": row["sample_value"],
    }


def _load_sampling_df(content: bytes) -> pd.DataFrame | None:
    try:
        df = pd.read_excel(BytesIO(content))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not parse Dropbox sampling workbook: %s", exc)
        return None

    df.columns = [str(c).strip() for c in df.columns]

    date_col = _pick_column(df.columns.tolist(), ["date"])
    location_col = _pick_column(df.columns.tolist(), ["location", "site"])
    ecoli_col = _pick_column(df.columns.tolist(), ["e.coli", "ecoli", "mpn"])
    if not date_col or not location_col or not ecoli_col:
        return None

    data = df[[date_col, location_col, ecoli_col]].copy()
    data[date_col] = pd.to_datetime(data[date_col], errors="coerce")
    data["sample_value"] = data[ecoli_col].map(_parse_sample_value)
    data["loc_norm"] = data[location_col].map(_normalize_name)
    data = data.dropna(subset=[date_col]).sort_values(by=date_col, ascending=False)
    data = data.rename(columns={date_col: "sample_date"})
    return data[["sample_date", "sample_value", "loc_norm"]]


async def fetch_sampling_history_for_site(
    dropbox_url: str,
    site: Site,
    client: httpx.AsyncClient,
    start_date: date,
    end_date: date,
) -> list[dict]:
    if not dropbox_url:
        return []
    content = await _read_sampling_content(dropbox_url, client)
    if content is None:
        return []
    df = _load_sampling_df(content)
    if df is None:
        return []

    target = _normalize_name(site.name)
    matches = df[(df["loc_norm"] == target) | (df["loc_norm"].str.contains(target, na=False))]
    if matches.empty:
        matches = df[df["loc_norm"].map(lambda x: target in x if isinstance(x, str) else False)]
    if matches.empty:
        return []

    filtered = matches[
        (matches["sample_date"].dt.date >= start_date) & (matches["sample_date"].dt.date <= end_date)
    ].copy()
    if filtered.empty:
        return []
    filtered = filtered.sort_values("sample_date", ascending=True)
    out: list[dict] = []
    for _, row in filtered.iterrows():
        sample_date = row["sample_date"]
        out.append(
            {
                "sample_date": sample_date.date().isoformat() if hasattr(sample_date, "date") else str(sample_date),
                "sample_value": row["sample_value"] if pd.notna(row["sample_value"]) else None,
            }
        )
    return out


async def _read_sampling_content(source: str, client: httpx.AsyncClient) -> bytes | None:
    source = source.strip()
    if not source:
        return None
    if source.lower().startswith(("http://", "https://")):
        try:
            response = await get_with_retries(
                client,
                source,
                timeout=45,
                headers=DROPBOX_HEADERS,
                label="Dropbox sampling download",
            )
            return response.content
        except httpx.HTTPError as exc:
            logger.warning("Dropbox sampling download failed; continuing without sampling data: %s", exc)
            return None
    path = Path(source)
    if path.exists() and path.is_file():
        return path.read_bytes()
    return None
