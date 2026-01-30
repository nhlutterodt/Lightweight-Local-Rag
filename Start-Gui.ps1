# Start-Gui.ps1
# Orchestration script to start both the bridge server and the Vite frontend.

$guiDir = Join-Path $PSScriptRoot "gui"
$clientDir = Join-Path $guiDir "client"
$serverDir = Join-Path $guiDir "server"

if (-not (Test-Path $clientDir) -or -not (Test-Path $serverDir)) {
    Write-Error "Scaffolding not found. Please ensure gui/client and gui/server exist."
    exit 1
}

Write-Host "--- Local RAG Web UI Launcher ---" -ForegroundColor Cyan
Write-Host "1. Starting API Bridge (Port 3001)..." -ForegroundColor Gray
Set-Location $serverDir
$bridgeJob = Start-Process cmd.exe -ArgumentList "/c npm start" -WindowStyle Hidden -PassThru -NoNewWindow:$false

Write-Host "2. Starting Vite Frontend..." -ForegroundColor Gray
Set-Location $clientDir
$viteJob = Start-Process cmd.exe -ArgumentList "/c npm run dev" -WindowStyle Hidden -PassThru -NoNewWindow:$false

Write-Host "3. Waiting for services to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 8

Write-Host "4. Launching Browser..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "`nReady! The dashboard should be open in your browser." -ForegroundColor Green
Write-Host "To stop the services, press Ctrl+C in this terminal." -ForegroundColor Yellow

# Keep the terminal open and kill processes on exit
try {
    while ($true) { 
        if ($bridgeJob.HasExited) { Write-Host "[!] Bridge server stopped." -ForegroundColor Red; break }
        if ($viteJob.HasExited) { Write-Host "[!] Vite server stopped." -ForegroundColor Red; break }
        Start-Sleep -Seconds 1 
    }
}
finally {
    Write-Host "`nStopping services..." -ForegroundColor Red
    if ($bridgeJob -and -not $bridgeJob.HasExited) { Stop-Process -Id $bridgeJob.Id -Force -ErrorAction SilentlyContinue }
    if ($viteJob -and -not $viteJob.HasExited) { Stop-Process -Id $viteJob.Id -Force -ErrorAction SilentlyContinue }
}
