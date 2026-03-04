from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query, Request

from app.services.forecast_service import ForecastService

router = APIRouter(prefix="/v1")


@router.get("/timeseries")
def get_timeseries(
    request: Request,
    site_id: str = Query(...),
    days: int = Query(7, ge=1, le=30),
) -> dict:
    service: ForecastService = request.app.state.forecast_service
    return {"site_id": site_id, "days": days, "items": service.get_timeseries(site_id=site_id, days=days)}


@router.get("/site-chart")
async def get_site_chart(
    request: Request,
    site_id: str = Query(...),
    days: int = Query(5000, ge=30, le=20000),
    include_predictions: bool = Query(False),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
) -> dict:
    service: ForecastService = request.app.state.forecast_service
    parsed_start: date | None = None
    parsed_end: date | None = None
    try:
        parsed_start = date.fromisoformat(start_date) if start_date else None
        parsed_end = date.fromisoformat(end_date) if end_date else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid date format: {exc}") from exc
    if parsed_start and parsed_end and parsed_start > parsed_end:
        raise HTTPException(status_code=422, detail="start_date must be <= end_date")
    return await service.get_site_chart(
        site_id=site_id,
        days=days,
        include_predictions=include_predictions,
        start_date=parsed_start,
        end_date=parsed_end,
    )
