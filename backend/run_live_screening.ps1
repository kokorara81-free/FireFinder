param(
    [string[]]$Symbols = @("AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOGL", "LLY", "NOW", "CMG", "SMCI")
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONPATH = "."
$env:DATA_PROVIDER = "yahoo"

python .\run_live_screening.py @Symbols
