from __future__ import annotations


def classify_flow_vs_stats(flow: float | None, stats: dict[str, float] | None) -> str | None:
    if flow is None or not stats:
        return None
    low = stats.get("low")
    p25 = stats.get("p25")
    p75 = stats.get("p75")
    high = stats.get("high")
    if low is None or p25 is None or p75 is None or high is None:
        return None

    if flow <= low:
        return "Extremely lower than average"
    if flow < p25:
        return "Lower than average"
    if flow <= p75:
        return "Average"
    if flow < high:
        return "Higher than average"
    return "Extremely higher than average"
