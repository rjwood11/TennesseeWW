param(
  [string]$BindHost = "0.0.0.0",
  [int]$Port = 8000,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = $ScriptDir
$ApiDir = Join-Path $RepoRoot "api"
$ConfigDir = Join-Path $RepoRoot "config"
$SqlitePath = Join-Path $RepoRoot "tnww.sqlite"

Write-Host "TNWW v3 local API launcher"
Write-Host "Repo: $RepoRoot"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python is not on PATH. Install Python 3.11+ and retry."
}

Push-Location $ApiDir
try {
  if (-not $SkipInstall) {
    Write-Host "Installing API package dependencies (editable mode)..."
    python -m pip install -e .
  }

  $env:TNWW_CONFIG_DIR = $ConfigDir
  $env:TNWW_SQLITE_PATH = $SqlitePath
  $env:TNWW_TIMEZONE = "America/Chicago"
  $env:TNWW_OPENMETEO_LAT = "36.0598"
  $env:TNWW_OPENMETEO_LON = "-86.8291"
  $env:TNWW_DROPBOX_SAMPLING_XLSX = "https://www.dropbox.com/scl/fi/8h7xqelfia41krdzqwq5k/HR-UpToDate.xlsx?rlkey=kb0287ib5qw3bv4qdzn3ue2v9&st=cur5pnc3&dl=1"

  Write-Host "Starting API at http://localhost:$Port"
  Write-Host "Health: http://localhost:$Port/v1/health"
  uvicorn app.main:app --host $BindHost --port $Port
}
finally {
  Pop-Location
}
