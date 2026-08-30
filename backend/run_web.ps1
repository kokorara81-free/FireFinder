$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONPATH = "."
$env:DATA_PROVIDER = "yahoo"

python -m uvicorn app.main:app --reload
