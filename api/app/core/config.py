from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel

from app.domain.schemas import Gauge, ModelsConfig, Site


class Settings(BaseModel):
    timezone: str = "America/Chicago"
    sqlite_path: str = "/data/tnww.sqlite"
    openmeteo_lat: float = 36.0598
    openmeteo_lon: float = -86.8291
    dropbox_sampling_xlsx: str = (
        "https://www.dropbox.com/scl/fi/8h7xqelfia41krdzqwq5k/HR-UpToDate.xlsx"
        "?rlkey=kb0287ib5qw3bv4qdzn3ue2v9&st=cur5pnc3&dl=1"
    )
    config_dir: Path = Path(__file__).resolve().parents[3] / "config"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        timezone=os.getenv("TNWW_TIMEZONE", "America/Chicago"),
        sqlite_path=os.getenv("TNWW_SQLITE_PATH", "/data/tnww.sqlite"),
        openmeteo_lat=float(os.getenv("TNWW_OPENMETEO_LAT", "36.0598")),
        openmeteo_lon=float(os.getenv("TNWW_OPENMETEO_LON", "-86.8291")),
        dropbox_sampling_xlsx=os.getenv(
            "TNWW_DROPBOX_SAMPLING_XLSX",
            (
                "https://www.dropbox.com/scl/fi/8h7xqelfia41krdzqwq5k/HR-UpToDate.xlsx"
                "?rlkey=kb0287ib5qw3bv4qdzn3ue2v9&st=cur5pnc3&dl=1"
            ),
        ),
        config_dir=Path(os.getenv("TNWW_CONFIG_DIR", str(Path(__file__).resolve().parents[3] / "config"))),
    )


def _read_json(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_sites() -> list[Site]:
    settings = get_settings()
    return [Site(**raw) for raw in _read_json(settings.config_dir / "sites.json")]


@lru_cache(maxsize=1)
def load_gauges() -> list[Gauge]:
    settings = get_settings()
    return [Gauge(**raw) for raw in _read_json(settings.config_dir / "gauges.json")]


@lru_cache(maxsize=1)
def load_models() -> ModelsConfig:
    settings = get_settings()
    with (settings.config_dir / "models.yaml").open("r", encoding="utf-8") as f:
        payload = yaml.safe_load(f)
    return ModelsConfig(**payload)
