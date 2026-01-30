<#
.SYNOPSIS
    Health Check for the Hardened Browser Infrastructure.
.DESCRIPTION
    Checks if global environment variables and browser binaries are visible.
#>

$TargetVar = "PLAYWRIGHT_BROWSERS_PATH"
$GlobalPath = "C:\ProgramData\playwright"

Write-Host "--- Browser Infrastructure Health Check ---" -ForegroundColor Cyan

# Check Environment Variables
$MachinePath = [Environment]::GetEnvironmentVariable($TargetVar, "Machine")
$SessionPath = $env:PLAYWRIGHT_BROWSERS_PATH
$HomeVar = $env:HOME

Write-Host "1. Environment Variables:"
$mStatus = if ($MachinePath) { $MachinePath } else { 'MISSING' }
$sStatus = if ($SessionPath) { $SessionPath } else { 'MISSING' }
$hStatus = if ($HomeVar) { $HomeVar } else { 'MISSING' }

Write-Host "   - Machine $TargetVar : $mStatus"
Write-Host "   - Session $TargetVar : $sStatus"
Write-Host "   - HOME Variable          : $hStatus"

# Check Physical Path
Write-Host "`n2. Physical Binary Path:"
if (Test-Path $GlobalPath) {
    $size = (Get-ChildItem $GlobalPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "   - Path Exists: YES ($GlobalPath)" -ForegroundColor Green
    Write-Host "   - Total Size:  $([Math]::Round($size, 2)) MB"
}
else {
    Write-Host "   - Path Exists: NO ($GlobalPath)" -ForegroundColor Red
}

# Check Binary Discovery
Write-Host "`n3. Binary Discovery:"
try {
    $chromiumPath = playwright install --show-path chromium 2>$null
    Write-Host "   - Chromium Found: YES ($chromiumPath)" -ForegroundColor Green
}
catch {
    Write-Host "   - Chromium Found: NO" -ForegroundColor Red
}

Write-Host "`nRecommendation:" -ForegroundColor White
if ($MachinePath -eq $GlobalPath -and (Test-Path $GlobalPath)) {
    Write-Host "   Infrastructure is HEALTHY. Any runner inheriting Machine variables will succeed." -ForegroundColor Green
}
else {
    Write-Host "   Run 'scripts\Migrate-PlaywrightBinaries.ps1' to resolve issues." -ForegroundColor Yellow
}
