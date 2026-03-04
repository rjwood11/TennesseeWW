from __future__ import annotations

from fastapi import APIRouter

from app.core.config import load_gauges, load_sites

router = APIRouter(prefix="/v1")


@router.get("/sites")
def get_sites() -> list[dict]:
    gauges = {g.id: g for g in load_gauges()}
    data = []
    for s in load_sites():
        gauge = gauges.get(s.base_gauge_id)
        payload = s.model_dump()
        payload["gauge"] = gauge.model_dump() if gauge else None
        data.append(payload)
    return data
