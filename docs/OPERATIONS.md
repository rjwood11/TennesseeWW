# TNWW Operations

## Runtime
- FastAPI serves `v1` routes.
- APScheduler runs ingestion hourly.
- SQLite persists latest and historical forecasts.

## Environment Variables
Copy from `config/settings.example.env`.

- `TNWW_TIMEZONE` local timezone for day-of-year and rain windows
- `TNWW_SQLITE_PATH` sqlite file path
- `TNWW_OPENMETEO_LAT` archive precipitation latitude
- `TNWW_OPENMETEO_LON` archive precipitation longitude
- `TNWW_DROPBOX_SAMPLING_XLSX` Dropbox direct XLSX URL
- `TNWW_CONFIG_DIR` optional override for config directory

## Docker
```bash
docker-compose up --build
```

## Ingest Once (cron-compatible)
```bash
cd api
python scripts/ingest_once.py
```

## Health Check
```bash
curl http://localhost:8000/v1/health
```

## Data Tables
- `forecast_latest(site_id PRIMARY KEY, computed_at, observed_at_usgs, drivers_json, pred_ecoli, status, sample_date, sample_value)`
- `forecast_history(id INTEGER PK, site_id, computed_at, pred_ecoli, status, drivers_json)`
