from __future__ import annotations

import asyncio
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.cache import SqliteCache
from app.core.config import get_settings
from app.services.ingest_service import IngestService


async def main() -> None:
    settings = get_settings()
    cache = SqliteCache(settings.sqlite_path)
    service = IngestService(cache)
    rows = await service.ingest()
    print(f"Ingested {len(rows)} site forecasts")


if __name__ == "__main__":
    asyncio.run(main())
