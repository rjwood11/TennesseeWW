# TNWW v3

Portable Tennessee Water Watch v3 delivered as:
- FastAPI backend (`/v1/health`, `/v1/sites`, `/v1/forecast`, `/v1/timeseries`)
- Embeddable widget (`tnww-widget.js` + `tnww-widget.css`) for any partner site

## Repo Layout
- `config/`: sites, gauges, models, env template
- `api/`: backend service, ingestion, validator, tests
- `widget/`: embeddable React + Leaflet UI
- `docs/`: embed/modeling/operations docs

## Super Easy Local Start (Recommended)
Open two PowerShell windows.

### Terminal 1: Start API
```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3
.\run-local-api.ps1
```

API checks:
- `http://localhost:8000/v1/health`
- `http://localhost:8000/v1/forecast`

### Terminal 2: Start Widget
```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3\widget
npm install
npm run dev
```

Open:
- `http://localhost:5173`

## Docker Start (Optional)
From repo root:
```bash
docker compose up --build
```

## Build Embeddable Widget Artifact
```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3\widget
npm run build
```

Build outputs:
- `widget/dist/tnww-widget.js`
- `widget/dist/tnww-widget.css`

## GitHub-Only Static Hosting
Use scheduled GitHub Actions + GitHub Pages:
- Workflow: `.github/workflows/pages-static.yml`
- Guide: `docs/GITHUB_PAGES.md`

## Model Overlay Toggle (UI)
The model overlay feature remains implemented, but the button can be hidden/shown with one flag:

- File: `widget/src/components/TimeseriesChart.tsx`
- Constant: `SHOW_MODEL_OVERLAY_TOGGLE`
  - `false` = hide button from users
  - `true` = show "Show/Hide Model Overlay" button

This only controls button visibility. The underlying overlay logic remains in the code.

## Update Models (Step-by-Step, No Code Changes)
Only edit:
- `config/models.yaml`

Follow these steps exactly:

1. Open `config/models.yaml`.
2. Edit coefficients, required predictors, or expression for any site model.
3. Save the file.
4. Validate model config:
```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3\api
python scripts/validate_models.py
```
5. If validation passes, ingest new forecasts:
```powershell
python scripts/ingest_once.py
```
6. Refresh widget/API page to confirm updated predictions.

If validation fails, fix the reported model key/expression errors and run validation again.

## Model Expression Rules
Allowed variables:
- `flow`, `gage`, `rain_1d`, `rain_2d`, `rain_3d`, `rain_5d`, `rain_7d`, `sindoy`

Allowed functions:
- `ln`, `log10`, `exp`, `sqrt`, `abs`, `min`, `max`

Allowed operators:
- `+`, `-`, `*`, `/`, `^`, parentheses
