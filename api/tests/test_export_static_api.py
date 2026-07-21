import pytest

from scripts.export_static_api import _validate_latest_predictions


def test_validate_latest_predictions_allows_any_current_prediction():
    _validate_latest_predictions({"items": [{"pred_ecoli": None}, {"pred_ecoli": 123}]})


def test_validate_latest_predictions_rejects_all_empty_payload():
    with pytest.raises(RuntimeError, match="zero current E. coli predictions"):
        _validate_latest_predictions(
            {
                "items": [
                    {"pred_ecoli": None, "drivers": {"flow": None, "gage": None}},
                    {"pred_ecoli": None, "drivers": {"flow": None, "gage": None}},
                ]
            }
        )


def test_validate_latest_predictions_can_be_overridden():
    _validate_latest_predictions(
        {"items": [{"pred_ecoli": None, "drivers": {"flow": None, "gage": None}}]},
        allow_empty_predictions=True,
    )
