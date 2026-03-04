from app.domain.advisory import compute_status


def test_advisory_thresholds():
    assert compute_status(None) == "NoData"
    assert compute_status(100) == "Safe"
    assert compute_status(234) == "Safe"
    assert compute_status(235) == "Advisory"
    assert compute_status(349) == "Advisory"
    assert compute_status(350) == "Caution"
    assert compute_status(749) == "Caution"
    assert compute_status(750) == "Warning"
