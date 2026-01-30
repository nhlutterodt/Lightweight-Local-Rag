# Simple test of utility abstractions
param(
    [switch]$Verbose = $false
)

Write-Host "=== SIMPLE UTILITY ABSTRACTIONS TEST ===" -ForegroundColor Green

# Set up
$ScriptRoot = $PSScriptRoot
$OutputDir = Join-Path $ScriptRoot "TestResults"
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "`nStep 1: Loading ScriptLoader..." -ForegroundColor Cyan
. "$ScriptRoot\ScriptLoader.ps1"
Write-Host "✓ ScriptLoader loaded" -ForegroundColor Green

Write-Host "`nStep 2: Using ScriptLoader to load utilities..." -ForegroundColor Cyan
$loader = New-ScriptLoader -ScriptRoot $ScriptRoot -Verbose:$Verbose
$loader.LoadStandardUtilities() | Out-Null
$loader.DisplayLoadSummary("Standard Utilities")

Write-Host "`nStep 3: Loading ExecutionContext..." -ForegroundColor Cyan
. "$ScriptRoot\ExecutionContext.ps1"
Write-Host "✓ ExecutionContext loaded" -ForegroundColor Green

Write-Host "`nStep 4: Testing ExecutionContext..." -ForegroundColor Cyan
try {
    $context = New-ExecutionContext -OperationName "Simple Test" -LogContext "simple-test"
    Write-Host "✓ ExecutionContext created successfully" -ForegroundColor Green
    
    $context.StartPhase("Demo Phase")
    Start-Sleep -Milliseconds 100
    $context.CompletePhase("Demo Phase")
    $context.LogSuccess("Demo completed successfully", @{})
    Write-Host "✓ ExecutionContext operations completed" -ForegroundColor Green
} catch {
    Write-Host "✗ ExecutionContext failed: $_" -ForegroundColor Red
}

Write-Host "`nStep 5: Loading OutputManager..." -ForegroundColor Cyan
. "$ScriptRoot\OutputManager.ps1"
Write-Host "✓ OutputManager loaded" -ForegroundColor Green

Write-Host "`nStep 6: Testing OutputManager..." -ForegroundColor Cyan
try {
    $testData = @(
        @{ Name = "Test1"; Value = 100; Status = "Active" }
        @{ Name = "Test2"; Value = 200; Status = "Inactive" }
    )
    
    $manager = New-OutputManager
    $jsonPath = Join-Path $OutputDir "simple-test.json"
    $manager.ExportData($testData, "json", $jsonPath, @{})
    Write-Host "✓ JSON export successful: $(Split-Path $jsonPath -Leaf)" -ForegroundColor Green
    
    $csvPath = Join-Path $OutputDir "simple-test.csv"
    $manager.ExportData($testData, "csv", $csvPath, @{})
    Write-Host "✓ CSV export successful: $(Split-Path $csvPath -Leaf)" -ForegroundColor Green
} catch {
    Write-Host "✗ OutputManager failed: $_" -ForegroundColor Red
}

Write-Host "`nStep 7: Loading ErrorManager..." -ForegroundColor Cyan
. "$ScriptRoot\ErrorManager.ps1"
Write-Host "✓ ErrorManager loaded" -ForegroundColor Green

Write-Host "`nStep 8: Testing ErrorManager..." -ForegroundColor Cyan
try {
    $errorManager = New-ErrorManager -Source "SimpleTest"
    $errorManager.AddError("TestCategory", "test-file.txt", "Test error message", "TestFunction", @{})
    $errorManager.AddWarning("TestCategory", "test-file.txt", "Test warning message", "TestFunction", @{})
    
    $report = $errorManager.GetErrorReport()
    $summary = $report.summary
    Write-Host "✓ ErrorManager: $($summary.totalErrors) errors, $($summary.totalWarnings) warnings" -ForegroundColor Green
    
    $reportPath = Join-Path $OutputDir "simple-error-report.json"
    $errorManager.ExportToFile($reportPath, "json")
    Write-Host "✓ Error report exported: $(Split-Path $reportPath -Leaf)" -ForegroundColor Green
} catch {
    Write-Host "✗ ErrorManager failed: $_" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETED ===" -ForegroundColor Green
Write-Host "Check the TestResults directory for generated files." -ForegroundColor Yellow

# List generated files
if (Test-Path $OutputDir) {
    $files = Get-ChildItem $OutputDir -File
    if ($files) {
        Write-Host "`nGenerated files:" -ForegroundColor Cyan
        $files | ForEach-Object {
            $size = [math]::Round($_.Length / 1KB, 2)
            Write-Host "  $($_.Name) (${size} KB)" -ForegroundColor White
        }
    }
}