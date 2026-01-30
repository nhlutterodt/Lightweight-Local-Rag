# debug-systemutils.ps1 - Debug SystemUtils loading

Write-Host "Loading ScriptLoader..." -ForegroundColor Yellow
. "$PSScriptRoot\ScriptLoader.ps1"

Write-Host "Creating loader..." -ForegroundColor Yellow
$loader = [ScriptLoader]::new($PSScriptRoot)

Write-Host "Loading standard utilities..." -ForegroundColor Yellow
$result = $loader.LoadStandardUtilities()

Write-Host "SystemUtils.ps1 status: $($result['SystemUtils.ps1'].status)" -ForegroundColor Green

Write-Host "Testing function availability:" -ForegroundColor Cyan
try {
    Get-Command Add-SystemInfoToLog -ErrorAction Stop
    Write-Host "✓ Add-SystemInfoToLog is available" -ForegroundColor Green
} catch {
    Write-Host "✗ Add-SystemInfoToLog not found: $($_.Exception.Message)" -ForegroundColor Red
    
    Write-Host "Available commands with 'System':" -ForegroundColor Yellow
    Get-Command *System* | Select-Object -First 10 | Format-Table Name, Source -AutoSize
}