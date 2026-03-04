from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.cache import SqliteCache
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.routes.forecast import router as forecast_router
from app.routes.health import router as health_router
from app.routes.sites import router as sites_router
from app.routes.timeseries import router as timeseries_router
from app.services.forecast_service import ForecastService
from app.services.ingest_service import IngestService

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    cache = SqliteCache(settings.sqlite_path)
    ingest_service = IngestService(cache)
    forecast_service = ForecastService(cache)
    app.state.cache = cache
    app.state.ingest_service = ingest_service
    app.state.forecast_service = forecast_service

    scheduler = AsyncIOScheduler(timezone=settings.timezone)
    scheduler.add_job(ingest_service.ingest, "interval", hours=1, id="ingest_hourly", replace_existing=True)
    scheduler.start()
    app.state.scheduler = scheduler

    try:
        await ingest_service.ingest()
    except Exception:  # noqa: BLE001
        logger.exception("Initial ingest failed")

    yield

    scheduler.shutdown(wait=False)


app = FastAPI(title="TNWW v3 API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(sites_router)
app.include_router(forecast_router)
app.include_router(timeseries_router)
