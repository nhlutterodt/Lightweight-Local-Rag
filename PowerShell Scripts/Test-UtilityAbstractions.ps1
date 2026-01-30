# Test-UtilityAbstractions.ps1 - Comprehensive demonstration of utility abstractions
# Shows how ScriptLoader, ExecutionContext, OutputManager, and ErrorManager work together

param(
    [switch]$ShowDetailedOutput,
    [switch]$TestErrorScenarios,
    [string]$OutputDirectory = ".\TestResults"
)

# Ensure output directory exists
if (-not (Test-Path $OutputDirectory)) {
    New-Item -Path $OutputDirectory -ItemType Directory -Force | Out-Null
}

Write-Host "=== UTILITY ABSTRACTIONS DEMONSTRATION ===" -ForegroundColor Magenta
Write-Host "Testing the new abstraction layers..." -ForegroundColor Cyan
Write-Host ""

#region Phase 1: Script Loading Demonstration
Write-Host "PHASE 1: Script Loading with ScriptLoader" -ForegroundColor Yellow
Write-Host "-" * 45 -ForegroundColor Yellow

# Load ScriptLoader first
. "$PSScriptRoot\ScriptLoader.ps1"

# Create and use ScriptLoader
$loader = New-ScriptLoader -ScriptRoot $PSScriptRoot -Verbose:$ShowDetailedOutput

Write-Host "Loading standard utilities..." -ForegroundColor Cyan
$loadResults = $loader.LoadStandardUtilities()

# Display loading results
Write-Host "`nLoading Results:" -ForegroundColor Green
foreach ($utility in $loadResults.Keys) {
    $result = $loadResults[$utility]
    $statusSymbol = if ($result.status -eq "success") { "✓" } else { "✗" }
    $statusColor = if ($result.status -eq "success") { "Green" } else { "Red" }
    
    Write-Host "  $statusSymbol $utility" -ForegroundColor $statusColor
    if ($ShowDetailedOutput -and $result.loadTime) {
        Write-Host "    Load time: $($result.loadTime.TotalMilliseconds.ToString('F0'))ms" -ForegroundColor Gray
    }
}

$stats = $loader.GetLoadingStats()
Write-Host "`nLoading Statistics:" -ForegroundColor Cyan
Write-Host "  Total utilities: $($stats.totalUtilities)" -ForegroundColor Gray
Write-Host "  Successfully loaded: $($stats.successful)" -ForegroundColor Green
Write-Host "  Failed/Missing: $($stats.failed + $stats.notFound)" -ForegroundColor $(if ($stats.failed + $stats.notFound -gt 0) { "Red" } else { "Green" })
Write-Host "  Total load time: $($stats.totalLoadTime.TotalMilliseconds.ToString('F0'))ms" -ForegroundColor Gray

# Test profile loading
Write-Host "`nTesting profile loading..." -ForegroundColor Cyan
if ($ShowDetailedOutput) {
    Import-UtilityProfile -Profile "logging" -ScriptRoot $PSScriptRoot -Verbose | Out-Null
} else {
    Import-UtilityProfile -Profile "logging" -ScriptRoot $PSScriptRoot | Out-Null
}

Write-Host "✓ Profile loading completed" -ForegroundColor Green
#endregion

#region Phase 2: ExecutionContext Demonstration
Write-Host "`n`nPHASE 2: Execution Context Management" -ForegroundColor Yellow
Write-Host "-" * 45 -ForegroundColor Yellow

# Load ExecutionContext
. "$PSScriptRoot\ExecutionContext.ps1"

# Create execution context with logging
$context = New-ExecutionContext -OperationName "Utility Abstraction Demo" -LogContext "demo"

# Demonstrate phases
$context.StartPhase("Data Generation")
Start-Sleep -Milliseconds 500  # Simulate work

# Generate sample data
$sampleData = @()
for ($i = 1; $i -le 50; $i++) {
    $sampleData += [PSCustomObject]@{
        Id = $i
        Name = "Item$i"
        Category = @("A", "B", "C")[$i % 3]
        Value = Get-Random -Minimum 1 -Maximum 1000
        Timestamp = (Get-Date).AddMinutes(-$i).ToString("o")
        IsActive = ($i % 4 -ne 0)
    }
}

$context.CompletePhase("Data Generation")
$context.LogSuccess("Generated $($sampleData.Count) sample items")

$context.StartPhase("Data Processing")
Start-Sleep -Milliseconds 300  # Simulate processing

# Process data (example: filter and sort)
$processedData = $sampleData | Where-Object { $_.IsActive } | Sort-Object Value -Descending

$context.CompletePhase("Data Processing")
$context.LogInfo("Processed data: $($processedData.Count) active items")

$context.RecordCheckpoint("Data ready for export")
#endregion

#region Phase 3: OutputManager Demonstration
Write-Host "`n`nPHASE 3: Output Format Management" -ForegroundColor Yellow
Write-Host "-" * 45 -ForegroundColor Yellow

# Load OutputManager
. "$PSScriptRoot\OutputManager.ps1"

$context.StartPhase("Output Generation")

# Create output manager
$outputManager = New-OutputManager -Verbose:$ShowDetailedOutput

# Test single format export
$jsonPath = Join-Path $OutputDirectory "demo-data.json"
$outputManager.ExportData($processedData, "json", $jsonPath)
Write-Host "✓ Exported to JSON: $jsonPath" -ForegroundColor Green

# Test multiple format export
$basePath = Join-Path $OutputDirectory "demo-data"
$formats = @("json", "csv", "xml")
$multiResults = $outputManager.ExportToMultipleFormats($processedData, $formats, $basePath)

Write-Host "`nMultiple Format Export Results:" -ForegroundColor Cyan
$outputManager.DisplayExportSummary($multiResults)

# Test custom format options
Write-Host "`nTesting custom format options..." -ForegroundColor Cyan
$customJsonPath = Join-Path $OutputDirectory "demo-data-compressed.json"
$outputManager.ExportData($processedData, "json", $customJsonPath, @{ "compress" = $true; "depth" = 3 })
Write-Host "✓ Exported compressed JSON with custom depth" -ForegroundColor Green

$context.CompletePhase("Output Generation")
#endregion

#region Phase 4: ErrorManager Demonstration  
Write-Host "`n`nPHASE 4: Error Management" -ForegroundColor Yellow
Write-Host "-" * 45 -ForegroundColor Yellow

# Load ErrorManager
. "$PSScriptRoot\ErrorManager.ps1"

$context.StartPhase("Error Handling Demo")

# Create error manager
$errorManager = New-ErrorManager -VerboseLogging:$ShowDetailedOutput

# Simulate some errors and warnings
Write-Host "Simulating various error scenarios..." -ForegroundColor Cyan

# File system errors
$errorManager.AddError("FileSystemFailures", "C:\NonExistentFile.txt", "File not found", "ReadFile", @{ "size" = 0 })
$errorManager.AddError("FileSystemFailures", "\\InvalidPath\file.txt", "Invalid path format", "ValidatePath")

# Validation errors  
$errorManager.AddWarning("ValidationFailures", "Item42", "Value exceeds recommended range", "ValidateItem", @{ "value" = 1500; "maxRecommended" = 1000 })
$errorManager.AddError("ValidationFailures", "ItemX", "Required field missing", "ValidateSchema", @{ "field" = "name" })

# Network errors (if testing error scenarios)
if ($TestErrorScenarios) {
    $errorManager.AddError("NetworkFailures", "http://invalid-url.com", "Connection timeout", "HttpRequest", @{ "timeout" = 30 })
    $errorManager.AddWarning("NetworkFailures", "https://slow-server.com", "Slow response time", "HttpRequest", @{ "responseTime" = 5000 })
}

# Hash failures (simulating file processing errors)
$errorManager.AddError("HashFailures", "locked-file.dat", "File is locked by another process", "ComputeHash")
$errorManager.AddWarning("HashFailures", "large-file.bin", "Hash computation took longer than expected", "ComputeHash", @{ "duration" = 45.5 })

Write-Host "`nError Collection Summary:" -ForegroundColor Cyan
$errorManager.PrintSummary()

if ($ShowDetailedOutput) {
    Write-Host "`nDetailed Error Report:" -ForegroundColor Cyan
    $errorManager.PrintDetailedReport(3)
}

# Export error report
$errorReportPath = Join-Path $OutputDirectory "error-report.json"
$errorManager.ExportToFile($errorReportPath, "json")

# Test error filtering
$recentErrors = $errorManager.GetRecentErrors(60)  # Last 60 minutes
Write-Host "`nRecent errors (last hour): $($recentErrors.Count)" -ForegroundColor Gray

$fileSystemErrors = $errorManager.GetErrorsByCategory("FileSystemFailures") 
Write-Host "File system errors: $($fileSystemErrors.Count)" -ForegroundColor Gray

$context.CompletePhase("Error Handling Demo")
#endregion

#region Phase 5: Integration Demonstration
Write-Host "`n`nPHASE 5: Integrated Workflow" -ForegroundColor Yellow
Write-Host "-" * 45 -ForegroundColor Yellow

$context.StartPhase("Integrated Processing")

Write-Host "Demonstrating integrated workflow..." -ForegroundColor Cyan

# Create a realistic scenario: process files with error handling and multiple outputs
$mockFiles = @()
for ($i = 1; $i -le 20; $i++) {
    $mockFiles += [PSCustomObject]@{
        Name = "file$i.txt"
        Path = "C:\TestData\file$i.txt" 
        Size = Get-Random -Minimum 100 -Maximum 10000
        LastModified = (Get-Date).AddDays(-$i)
        ProcessingResult = if ($i % 7 -eq 0) { "error" } elseif ($i % 5 -eq 0) { "warning" } else { "success" }
        ErrorMessage = if ($i % 7 -eq 0) { "Access denied" } elseif ($i % 5 -eq 0) { "File size unusual" } else { $null }
    }
}

$context.RecordCheckpoint("Mock file data created")

# Process files with error tracking
$successfulFiles = @()
foreach ($file in $mockFiles) {
    switch ($file.ProcessingResult) {
        "error" { 
            $errorManager.AddError("ProcessingFailures", $file.Path, $file.ErrorMessage, "ProcessFile", @{ "size" = $file.Size })
        }
        "warning" { 
            $errorManager.AddWarning("ProcessingFailures", $file.Path, $file.ErrorMessage, "ProcessFile", @{ "size" = $file.Size })
            $successfulFiles += $file
        }
        "success" { 
            $successfulFiles += $file
        }
    }
}

$context.LogInfo("Processed $($mockFiles.Count) files: $($successfulFiles.Count) successful")

# Export successful files in multiple formats
if ($successfulFiles.Count -gt 0) {
    $filesBasePath = Join-Path $OutputDirectory "processed-files"
    $fileResults = $outputManager.ExportToMultipleFormats($successfulFiles, @("json", "csv"), $filesBasePath)
    
    Write-Host "`nFile Processing Export Results:" -ForegroundColor Cyan
    $outputManager.DisplayExportSummary($fileResults)
}

$context.CompletePhase("Integrated Processing")
#endregion

#region Phase 6: Summary and Cleanup
$context.StartPhase("Summary Generation")

# Generate comprehensive summary
$summary = @{
    "executionSummary" = $context.GetExecutionSummary()
    "loadingResults" = $loadResults
    "outputResults" = $multiResults
    "errorReport" = $errorManager.GetErrorReport()
    "testConfiguration" = @{
        "showDetailedOutput" = $ShowDetailedOutput.IsPresent
        "testErrorScenarios" = $TestErrorScenarios.IsPresent
        "outputDirectory" = $OutputDirectory
        "testTimestamp" = (Get-Date).ToString("o")
    }
}

# Export comprehensive summary
$summaryPath = Join-Path $OutputDirectory "comprehensive-summary.json"
$summary | ConvertTo-Json -Depth 8 | Out-File -FilePath $summaryPath -Encoding UTF8

$context.CompletePhase("Summary Generation")

# Final results
Write-Host "`n`nFINAL RESULTS" -ForegroundColor Magenta
Write-Host "=" * 45 -ForegroundColor Magenta

Write-Host "✓ Script Loading: $($stats.successful)/$($stats.totalUtilities) utilities loaded" -ForegroundColor Green
Write-Host "✓ Output Management: $($multiResults.Values | Where-Object { $_.status -eq 'success' }).Count/$($multiResults.Count) formats successful" -ForegroundColor Green  
Write-Host "✓ Error Management: $($errorManager.TotalErrors) errors, $($errorManager.TotalWarnings) warnings tracked" -ForegroundColor $(if ($errorManager.TotalErrors -gt 0) { "Yellow" } else { "Green" })

Write-Host "`nGenerated Files:" -ForegroundColor Cyan
Get-ChildItem $OutputDirectory -File | ForEach-Object {
    $size = if ($_.Length -lt 1KB) { "$($_.Length) B" } else { "$([math]::Round($_.Length/1KB, 1)) KB" }
    Write-Host "  $($_.Name) ($size)" -ForegroundColor Gray
}

Write-Host "`nAbstraction Benefits Demonstrated:" -ForegroundColor Cyan
Write-Host "  • Centralized dependency loading" -ForegroundColor Gray
Write-Host "  • Standardized execution tracking" -ForegroundColor Gray  
Write-Host "  • Unified output format handling" -ForegroundColor Gray
Write-Host "  • Comprehensive error management" -ForegroundColor Gray
Write-Host "  • Consistent console formatting" -ForegroundColor Gray

$context.AddMetadata("outputDirectory", $OutputDirectory)
$context.AddMetadata("filesGenerated", (Get-ChildItem $OutputDirectory -File).Count)
$context.AddMetadata("totalDataItems", $sampleData.Count)
$context.Finalize()

Write-Host "`nTest complete! Check the output directory for generated files." -ForegroundColor Green
Write-Host "Summary report: $summaryPath" -ForegroundColor Cyan
#endregion