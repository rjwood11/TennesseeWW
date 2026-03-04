from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Gauge(BaseModel):
    id: str
    label: str
    usgs_site_no: str


class Site(BaseModel):
    id: str
    name: str
    river: str
    tdec_site_id: str | None = None
    hydrocode: str | None = None
    river_mile: str | None = None
    tdec_river_segment_id: str | None = None
    lat: float
    lon: float
    base_gauge_id: str


class ModelDefinition(BaseModel):
    enabled: bool = True
    model_type: str = "formula"
    required: list[str] = Field(default_factory=list)
    expression: str | None = None


class ModelDefaults(BaseModel):
    thresholds: dict[str, float]
    units: dict[str, str]


class ModelsConfig(BaseModel):
    version: int
    defaults: ModelDefaults
    models: dict[str, ModelDefinition]


class ForecastRow(BaseModel):
    site_id: str
    computed_at: datetime
    observed_at_usgs: datetime | None = None
    drivers_json: dict[str, Any]
    pred_ecoli: int | None = None
    status: str
    sample_date: str | None = None
    sample_value: float | None = None


class ForecastResponseItem(BaseModel):
    site: Site
    gauge: Gauge
    computed_at: datetime
    observed_at_usgs: datetime | None
    pred_ecoli: int | None
    status: str
    drivers: dict[str, Any]
    sample_date: str | None = None
    sample_value: float | None = None


class ForecastResponse(BaseModel):
    generated_at: datetime
    items: list[ForecastResponseItem]
