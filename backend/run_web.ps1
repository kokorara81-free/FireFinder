$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONPATH = "."
$env:DATA_PROVIDER = "yahoo"

$projectRoot = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $projectRoot "data"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$analysisDbPath = (Join-Path $dataDir "firefinder.db").Replace('\', '/')
$userDbPath = (Join-Path $dataDir "firefinder-user.db").Replace('\', '/')
$env:ANALYSIS_DATABASE_URL = "sqlite:///$analysisDbPath"
$env:USER_DATABASE_URL = "sqlite:///$userDbPath"

python -m uvicorn app.main:app --reload
