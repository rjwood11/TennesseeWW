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

## Easy Model Update Workflow
If you make a small math change to an E. coli model and want it to go live on GitHub and GitHub Pages, use this process.

### Which command should I use?
Use:

```powershell
.\push-to-github.ps1
```

This is the main command.

Do not worry about `push-to-github.cmd` unless you want to double-click a file in Windows. It only runs the PowerShell script for you. The real update logic is in `push-to-github.ps1`.

### What file do I edit?
Edit:

- `config/models.yaml`

That is where the E. coli model math lives.

### Step-by-step for a small model change
1. Open `config/models.yaml`.
2. Change the model math you want to update.
3. Save the file.
4. Optional but recommended: validate the model file.
5. Run `.\push-to-github.ps1` from the repo root.

### Validation command
From the `api` folder:

```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3\api
python scripts/validate_models.py
```

If validation passes, go back to the repo root and push:

```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3
.\push-to-github.ps1
```

### What happens after I run the push command?
When you push a change to `main`:

1. The change is uploaded to GitHub.
2. GitHub Actions sees that `config/models.yaml` changed.
3. The GitHub Pages workflow runs automatically.
4. The workflow rebuilds the predictions, statuses, map data, and site files.
5. GitHub Pages publishes the updated version of the app.

This means model changes should take effect right after the workflow finishes. You do not need to wait for the next hourly update if you already pushed a model change.

### What does the hourly update still do?
Even if you do not change any code or models, GitHub still tries to refresh the site every hour so the latest data stays current.

### Short version
If you change model math:

```powershell
cd C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3
.\push-to-github.ps1
```

That is the command to use.

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
