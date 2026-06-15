from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _retryable_status(status_code: int) -> bool:
    return status_code in {408, 425, 429} or status_code >= 500


async def get_with_retries(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: Mapping[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float = 30,
    attempts: int = 3,
    label: str = "HTTP request",
) -> httpx.Response:
    for attempt in range(1, attempts + 1):
        try:
            response = await client.get(url, params=params, headers=headers, timeout=timeout, follow_redirects=True)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if attempt == attempts or not _retryable_status(exc.response.status_code):
                raise
            logger.warning("%s failed with HTTP %s; retrying", label, exc.response.status_code)
        except httpx.TransportError as exc:
            if attempt == attempts:
                raise
            logger.warning("%s failed with %s; retrying", label, type(exc).__name__)
        await asyncio.sleep(float(attempt))

    raise RuntimeError(f"{label} failed without an HTTP response")
