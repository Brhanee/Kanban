$processes = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processes) {
    taskkill /PID $processId /T /F | Out-Null
}
