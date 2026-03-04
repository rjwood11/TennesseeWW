from __future__ import annotations

import math
from datetime import datetime
from zoneinfo import ZoneInfo


SINDOY_COEFF = 0.01721420632
SINDOY_OFFSET = 81.75
MM_TO_IN = 0.03937007874


def compute_day_features(now_utc: datetime, timezone_name: str) -> dict[str, float | int]:
    local_now = now_utc.astimezone(ZoneInfo(timezone_name))
    day_of_year = local_now.timetuple().tm_yday
    sindoy = math.sin(SINDOY_COEFF * day_of_year - SINDOY_OFFSET)
    return {"day_of_year": day_of_year, "sindoy": sindoy}
