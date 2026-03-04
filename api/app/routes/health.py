from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/v1")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
