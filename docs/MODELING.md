# TNWW Modeling

TNWW v3 model logic is fully config-driven in `config/models.yaml`.

## Update Workflow
1. Edit formula coefficients/required predictors in `config/models.yaml`.
2. Run validator:
```bash
cd api
python scripts/validate_models.py
```
3. If validation passes, run ingest or restart API scheduler.

## Allowed Expression Syntax
- Variables: `flow`, `gage`, `rain_1d`, `rain_2d`, `rain_3d`, `rain_5d`, `rain_7d`, `sindoy`
- Functions: `ln`, `log10`, `exp`, `sqrt`, `abs`, `min`, `max`
- Operators: `+ - * / ^` and parentheses

Unsafe syntax (imports, attribute access, indexing, lambdas) is rejected.

## Example Change
Change Highway 70 coefficient in `models.yaml`:
```yaml
hwy70:
  enabled: true
  model_type: formula
  required: [flow, rain_2d]
  expression: "-79.38 + 0.95*(flow + rain_2d)"
```

No Python code changes are required.
