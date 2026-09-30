Set-Location $PSScriptRoot
Set-Location ..
Set-Location backend

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    python -m pip install --user uv
}

uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
