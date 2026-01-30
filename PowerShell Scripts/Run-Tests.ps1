# Simple test runner
Set-Location $PSScriptRoot
$result = Invoke-Pester -Path ./Tests -Output None -ExcludeTag Integration -PassThru

Write-Host "========================="
Write-Host "Pester Test Results"
Write-Host "========================="
Write-Host "Passed: $($result.PassedCount)"
Write-Host "Failed: $($result.FailedCount)"  
Write-Host "Skipped: $($result.SkippedCount)"
Write-Host "Total: $($result.TotalCount)"
Write-Host "========================="

if ($result.FailedCount -gt 0) {
    Write-Host "`nFailed Tests:" -ForegroundColor Red
    foreach ($test in $result.Failed) {
        Write-Host "  - $($test.Name)" -ForegroundColor Red
        Write-Host "    Error: $($test.ErrorRecord.Exception.Message)" -ForegroundColor DarkRed
        Write-Host "    File: $($test.ScriptBlock.File):$($test.ScriptBlock.StartPosition.StartLine)" -ForegroundColor DarkGray
    }
}

exit $result.FailedCount
