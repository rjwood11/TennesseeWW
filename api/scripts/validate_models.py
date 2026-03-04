from __future__ import annotations

from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import load_models, load_sites
from app.domain.model_eval import ALLOWED_VARIABLES, ModelExpressionError, validate_expression


def validate() -> list[str]:
    errors: list[str] = []
    sites = load_sites()
    site_ids = {s.id for s in sites}
    models = load_models().models
    model_ids = set(models.keys())

    for model_id in sorted(model_ids - site_ids):
        errors.append(f"Model key '{model_id}' does not match any site id")

    for site_id in sorted(site_ids - model_ids):
        errors.append(f"Site '{site_id}' is missing from models.yaml")

    for model_id, model in models.items():
        if model.enabled and (model.expression is None or model.expression == "null"):
            errors.append(f"Enabled model '{model_id}' must define a non-null expression")
        if model.expression and model.expression != "null":
            try:
                validate_expression(model.expression)
            except ModelExpressionError as exc:
                errors.append(f"Invalid expression for '{model_id}': {exc}")
        for required in model.required:
            if required not in ALLOWED_VARIABLES:
                errors.append(f"Invalid required variable '{required}' for '{model_id}'")
    return errors


if __name__ == "__main__":
    errs = validate()
    if errs:
        print("Model validation failed:")
        for err in errs:
            print(f"- {err}")
        raise SystemExit(1)
    print("Model validation passed")
