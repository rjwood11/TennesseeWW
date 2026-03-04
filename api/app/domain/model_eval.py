from __future__ import annotations

import ast
import math
from dataclasses import dataclass
from typing import Any

ALLOWED_VARIABLES = {
    "flow",
    "gage",
    "rain_1d",
    "rain_2d",
    "rain_3d",
    "rain_5d",
    "rain_7d",
    "sindoy",
    "relative_humidity_24h_mean",
    "relative_humidity_24h_min",
    "relative_humidity_24h_max",
    "wind_speed_24h_mean",
    "wind_speed_24h_min",
    "wind_speed_24h_max",
    "wind_gust_24h_mean",
    "wind_gust_24h_min",
    "wind_gust_24h_max",
    "temp_24h_mean",
    "temp_24h_min",
    "temp_24h_max",
    "apparent_temp_24h_mean",
    "apparent_temp_24h_min",
    "apparent_temp_24h_max",
    "dew_point_24h_mean",
    "dew_point_24h_min",
    "dew_point_24h_max",
    "pressure_msl_24h_mean",
    "pressure_msl_24h_min",
    "pressure_msl_24h_max",
    "surface_pressure_24h_mean",
    "surface_pressure_24h_min",
    "surface_pressure_24h_max",
    "cloud_cover_24h_mean",
    "cloud_cover_24h_min",
    "cloud_cover_24h_max",
}

ALLOWED_FUNCTIONS = {
    "ln": math.log,
    "log10": math.log10,
    "exp": math.exp,
    "sqrt": math.sqrt,
    "abs": abs,
    "min": min,
    "max": max,
}

ALLOWED_BINOPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)
ALLOWED_UNARYOPS = (ast.UAdd, ast.USub)


class ModelExpressionError(ValueError):
    pass


@dataclass
class CompiledExpression:
    source: str
    tree: ast.Expression


def normalize_expression(expr: str) -> str:
    return expr.replace("^", "**")


def _validate_node(node: ast.AST) -> None:
    if isinstance(node, ast.Expression):
        _validate_node(node.body)
        return

    if isinstance(node, ast.Constant):
        if not isinstance(node.value, (int, float)):
            raise ModelExpressionError("Only numeric constants are allowed")
        return

    if isinstance(node, ast.Name):
        if node.id not in ALLOWED_VARIABLES and node.id not in ALLOWED_FUNCTIONS:
            raise ModelExpressionError(f"Unknown name: {node.id}")
        return

    if isinstance(node, ast.BinOp):
        if not isinstance(node.op, ALLOWED_BINOPS):
            raise ModelExpressionError("Unsupported operator")
        _validate_node(node.left)
        _validate_node(node.right)
        return

    if isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, ALLOWED_UNARYOPS):
            raise ModelExpressionError("Unsupported unary operator")
        _validate_node(node.operand)
        return

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ModelExpressionError("Only simple function calls are allowed")
        if node.func.id not in ALLOWED_FUNCTIONS:
            raise ModelExpressionError(f"Function not allowed: {node.func.id}")
        if len(node.keywords) > 0:
            raise ModelExpressionError("Keyword arguments are not allowed")
        for arg in node.args:
            _validate_node(arg)
        return

    raise ModelExpressionError(f"Unsupported syntax node: {type(node).__name__}")


def compile_expression(expression: str) -> CompiledExpression:
    source = normalize_expression(expression)
    try:
        parsed = ast.parse(source, mode="eval")
    except SyntaxError as exc:
        raise ModelExpressionError(f"Invalid expression syntax: {exc}") from exc
    _validate_node(parsed)
    return CompiledExpression(source=source, tree=parsed)


def validate_expression(expression: str) -> None:
    compile_expression(expression)


def evaluate_expression(expression: str, variables: dict[str, float]) -> float:
    compiled = compile_expression(expression)
    safe_globals: dict[str, Any] = {"__builtins__": {}}
    safe_locals = {**ALLOWED_FUNCTIONS, **variables}
    try:
        result = eval(compile(compiled.tree, "<model-expression>", "eval"), safe_globals, safe_locals)
    except Exception as exc:  # noqa: BLE001
        raise ModelExpressionError(f"Failed to evaluate expression: {exc}") from exc
    if not isinstance(result, (int, float)):
        raise ModelExpressionError("Expression did not evaluate to numeric value")
    if math.isnan(float(result)) or math.isinf(float(result)):
        raise ModelExpressionError("Expression produced invalid numeric value")
    return float(result)
