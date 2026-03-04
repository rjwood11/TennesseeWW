from __future__ import annotations

from fastapi import APIRouter, Request

from app.services.forecast_service import ForecastService

router = APIRouter(prefix="/v1")


@router.get("/forecast")
def get_forecast(request: Request) -> dict:
    service: ForecastService = request.app.state.forecast_service
    return service.get_latest().model_dump(mode="json")
