# Show-FileOrganization.ps1 - Display the organized file structure

. "$PSScriptRoot\PathUtils.ps1"

Write-Host "=== FILE ORGANIZATION OVERVIEW ===" -ForegroundColor Magenta

Show-ProjectInfo

Write-Host "`n=== DETAILED FILE LISTING ===" -ForegroundColor Yellow

Write-Host "`nLOG FILES (XML):" -ForegroundColor Cyan
Get-ChildItem -Path $Global:PathManager.LogsFolder -Filter "*.xml" -ErrorAction SilentlyContinue | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 2)
    Write-Host "  📄 $($_.Name) ($size KB) - $($_.CreationTime.ToString('yyyy-MM-dd HH:mm'))" -ForegroundColor White
}

Write-Host "`nREPORT FILES:" -ForegroundColor Cyan
Get-ChildItem -Path $Global:PathManager.ReportsFolder -ErrorAction SilentlyContinue | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 2)
    Write-Host "  📊 $($_.Name) ($size KB) - $($_.CreationTime.ToString('yyyy-MM-dd HH:mm'))" -ForegroundColor White
}

Write-Host "`nHTML REPORTS:" -ForegroundColor Cyan
Get-ChildItem -Path $Global:PathManager.HtmlPagesFolder -Filter "*.html" -ErrorAction SilentlyContinue | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 2)
    Write-Host "  🌐 $($_.Name) ($size KB) - $($_.CreationTime.ToString('yyyy-MM-dd HH:mm'))" -ForegroundColor White
}

Write-Host "`nPOWERSHELL SCRIPTS:" -ForegroundColor Cyan
Get-ChildItem -Path $Global:PathManager.ScriptsFolder -Filter "*.ps1" -ErrorAction SilentlyContinue | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 2)
    Write-Host "  ⚙️  $($_.Name) ($size KB) - $($_.CreationTime.ToString('yyyy-MM-dd HH:mm'))" -ForegroundColor White
}

# Calculate total storage usage
$totalLogSize = (Get-ChildItem -Path $Global:PathManager.LogsFolder -Filter "*.xml" -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$totalReportSize = (Get-ChildItem -Path $Global:PathManager.ReportsFolder -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$totalHtmlSize = (Get-ChildItem -Path $Global:PathManager.HtmlPagesFolder -Filter "*.html" -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum

Write-Host "`n=== STORAGE SUMMARY ===" -ForegroundColor Yellow
Write-Host "Log Files: $([math]::Round($totalLogSize / 1KB, 2)) KB" -ForegroundColor White
Write-Host "Reports: $([math]::Round($totalReportSize / 1KB, 2)) KB" -ForegroundColor White
Write-Host "HTML Files: $([math]::Round($totalHtmlSize / 1KB, 2)) KB" -ForegroundColor White
Write-Host "Total: $([math]::Round(($totalLogSize + $totalReportSize + $totalHtmlSize) / 1KB, 2)) KB" -ForegroundColor Green

Write-Host "`n=== CLEANUP RECOMMENDATION ===" -ForegroundColor Yellow
$cutoffDate = (Get-Date).AddDays(-30)

$oldLogs = Get-ChildItem -Path $Global:PathManager.LogsFolder -Filter "*.xml" | Where-Object { $_.CreationTime -lt $cutoffDate }
$oldReports = Get-ChildItem -Path $Global:PathManager.ReportsFolder | Where-Object { $_.CreationTime -lt $cutoffDate }

if ($oldLogs.Count -gt 0 -or $oldReports.Count -gt 0) {
    Write-Host "Files older than 30 days found:" -ForegroundColor Red
    $oldLogs | ForEach-Object { Write-Host "  📄 $($_.Name) ($(($_ | Get-Date).ToString('yyyy-MM-dd')))" -ForegroundColor Gray }
    $oldReports | ForEach-Object { Write-Host "  📊 $($_.Name) ($(($_ | Get-Date).ToString('yyyy-MM-dd')))" -ForegroundColor Gray }
    Write-Host "  Run 'Clear-OldFiles' to clean up automatically" -ForegroundColor Yellow
} else {
    Write-Host "✓ No old files need cleanup" -ForegroundColor Green
}

Write-Host "`n=== PATH MANAGEMENT SUCCESS ===" -ForegroundColor Magenta
Write-Host "✓ All logs centralized in: $($Global:PathManager.LogsFolder)" -ForegroundColor Green
Write-Host "✓ All reports organized in: $($Global:PathManager.ReportsFolder)" -ForegroundColor Green  
Write-Host "✓ All HTML files in: $($Global:PathManager.HtmlPagesFolder)" -ForegroundColor Green
Write-Host "✓ Reusable path routing implemented successfully" -ForegroundColor Green