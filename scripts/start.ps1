Set-Location $PSScriptRoot
Set-Location ..
$envFile = Join-Path (Get-Location) ".env"
Set-Location backend

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    python -m pip install --user uv
}

$envArgs = @()
if (Test-Path $envFile) {
    $envArgs = @("--env-file", $envFile)
}

uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload @envArgs
