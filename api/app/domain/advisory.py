from __future__ import annotations


def compute_status(pred_ecoli: int | None, safe: float = 235, advisory: float = 350, caution: float = 750) -> str:
    if pred_ecoli is None:
        return "NoData"
    if pred_ecoli < safe:
        return "Safe"
    if pred_ecoli < advisory:
        return "Advisory"
    if pred_ecoli < caution:
        return "Caution"
    return "Warning"
