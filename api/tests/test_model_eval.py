import pytest

from app.domain.model_eval import ModelExpressionError, evaluate_expression, validate_expression


def test_evaluate_formula_with_ln_and_power():
    result = evaluate_expression("17.2 + 164.2*ln(flow) + rain_2d^2", {"flow": 10.0, "rain_2d": 1.5})
    assert result > 0


def test_blocks_unsafe_expression():
    with pytest.raises(ModelExpressionError):
        validate_expression("__import__('os').system('echo bad')")


def test_requires_allowed_names():
    with pytest.raises(ModelExpressionError):
        validate_expression("foo + 1")
