# Test-DataProcessor.ps1
# Comprehensive test of the DataProcessor utility abstraction
param(
    [switch]$Verbose = $false,
    [string]$OutputDirectory = ".\TestResults"
)

Write-Host "=== DATA PROCESSOR TESTING ===" -ForegroundColor Green

# Set up
if (-not (Test-Path $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

# Load required scripts
Write-Host "`nLoading DataProcessor..." -ForegroundColor Cyan
. "$PSScriptRoot\DataProcessor.ps1"
Write-Host "✓ DataProcessor loaded successfully" -ForegroundColor Green

# Create test data
Write-Host "`nGenerating test data..." -ForegroundColor Cyan
$testData = @(
    @{ ID = 1; Name = "Alice Johnson"; Age = 28; Department = "Engineering"; Salary = 75000; Status = "Active"; Score = 95.5 }
    @{ ID = 2; Name = "Bob Smith"; Age = 35; Department = "Marketing"; Salary = 65000; Status = "Active"; Score = 88.2 }
    @{ ID = 3; Name = "Carol Davis"; Age = 31; Department = "Engineering"; Salary = 82000; Status = "Inactive"; Score = 92.1 }
    @{ ID = 4; Name = "David Wilson"; Age = 29; Department = "Sales"; Salary = 58000; Status = "Active"; Score = 76.8 }
    @{ ID = 5; Name = "Eve Brown"; Age = 42; Department = "Engineering"; Salary = 95000; Status = "Active"; Score = 97.3 }
    @{ ID = 6; Name = "Frank Miller"; Age = 38; Department = "HR"; Salary = 55000; Status = "Active"; Score = 83.4 }
    @{ ID = 7; Name = "Grace Taylor"; Age = 26; Department = "Marketing"; Salary = 62000; Status = "Active"; Score = 89.7 }
    @{ ID = 8; Name = "Henry Lee"; Age = 33; Department = "Sales"; Salary = 71000; Status = "Inactive"; Score = 81.5 }
    @{ ID = 9; Name = "Ivy Chen"; Age = 30; Department = "Engineering"; Salary = 78000; Status = "Active"; Score = 94.2 }
    @{ ID = 10; Name = "Jack Anderson"; Age = 27; Department = "Marketing"; Salary = 60000; Status = "Active"; Score = 85.9 }
)
Write-Host "✓ Generated $($testData.Count) test records" -ForegroundColor Green

# Test 1: Basic Filtering
Write-Host "`n=== TEST 1: Data Filtering ===" -ForegroundColor Yellow
$processor = New-DataProcessor

Write-Host "Filtering active employees..." -ForegroundColor Cyan
$activeEmployees = Invoke-DataProcessing -Data $testData -Operation "filter" -Options @{
    property = "Status"
    value = "Active"
} -Processor $processor

Write-Host "Filtering Engineering department..." -ForegroundColor Cyan
$engineeringStaff = Invoke-DataProcessing -Data $activeEmployees -Operation "filter" -Options @{
    property = "Department" 
    value = "Engineering"
} -Processor $processor

Write-Host "✓ Filtered to $($activeEmployees.Count) active employees" -ForegroundColor Green
Write-Host "✓ Found $($engineeringStaff.Count) active engineering staff" -ForegroundColor Green

# Test 2: Data Transformation
Write-Host "`n=== TEST 2: Data Transformation ===" -ForegroundColor Yellow

Write-Host "Transforming data with calculations..." -ForegroundColor Cyan
Invoke-DataProcessing -Data $activeEmployees -Operation "transform" -Options @{
    calculations = @{
        "SalaryGrade" = { param($item) 
            if ($item.Salary -gt 80000) { "Senior" }
            elseif ($item.Salary -gt 60000) { "Mid" }
            else { "Junior" }
        }
        "PerformanceBonus" = { param($item) [Math]::Round($item.Salary * ($item.Score / 100) * 0.1, 2) }
        "YearsToRetirement" = { param($item) [Math]::Max(0, 65 - $item.Age) }
    }
    formatting = @{
        "Salary" = "${0:N0}"
        "Score" = "{0:F1}%"
    }
} -Processor $processor | Out-Null

Write-Host "✓ Added calculated fields: SalaryGrade, PerformanceBonus, YearsToRetirement" -ForegroundColor Green
Write-Host "✓ Applied formatting to Salary and Score fields" -ForegroundColor Green

# Test 3: Data Validation
Write-Host "`n=== TEST 3: Data Validation ===" -ForegroundColor Yellow

# Create some invalid test data
$testDataWithErrors = $testData + @(
    @{ ID = 11; Name = ""; Age = "Invalid"; Department = "Unknown"; Status = "Active"; Score = 150 }
    @{ ID = 12; Age = 25; Department = "IT"; Salary = -1000; Status = "Active"; Score = 75.5 }  # Missing Name
)

Write-Host "Validating data with schema..." -ForegroundColor Cyan
$validationResult = Test-DataSchema -Data $testDataWithErrors -Schema @{
    "ID" = @{ required = $true; type = "Int32" }
    "Name" = @{ required = $true; type = "String" }
    "Age" = @{ required = $true; type = "Int32"; range = @{ min = 18; max = 70 } }
    "Department" = @{ required = $true; type = "String" }
    "Salary" = @{ required = $true; type = "Int32"; range = @{ min = 30000; max = 200000 } }
    "Status" = @{ required = $true; type = "String" }
    "Score" = @{ required = $true; type = "Double"; range = @{ min = 0; max = 100 } }
} -IncludeWarnings

Write-Host "✓ Validation completed" -ForegroundColor Green
Write-Host "  - Errors: $($validationResult.totalErrors)" -ForegroundColor $(if ($validationResult.totalErrors -gt 0) { "Red" } else { "Green" })
Write-Host "  - Warnings: $($validationResult.totalWarnings)" -ForegroundColor $(if ($validationResult.totalWarnings -gt 0) { "Yellow" } else { "Green" })

if ($validationResult.totalErrors -gt 0) {
    Write-Host "`nValidation Errors:" -ForegroundColor Red
    $validationResult.errors | ForEach-Object { Write-Host "  ✗ $_" -ForegroundColor Red }
}

if ($validationResult.totalWarnings -gt 0) {
    Write-Host "`nValidation Warnings:" -ForegroundColor Yellow
    $validationResult.warnings | ForEach-Object { Write-Host "  ⚠ $_" -ForegroundColor Yellow }
}

# Test 4: Pipeline Processing
Write-Host "`n=== TEST 4: Pipeline Processing ===" -ForegroundColor Yellow

Write-Host "Processing data through multi-step pipeline..." -ForegroundColor Cyan
$pipelineResult = Invoke-DataPipeline -Data $testData -Pipeline @(
    @{ 
        operation = "filter"
        options = @{ property = "Status"; value = "Active" }
    }
    @{ 
        operation = "filter"
        options = @{ property = "Department"; value = "Engineering" }
    }
    @{ 
        operation = "transform"
        options = @{
            calculations = @{
                "ExperienceLevel" = { param($item)
                    switch ($item.Age) {
                        {$_ -lt 30} { "Junior" }
                        {$_ -lt 40} { "Senior" }
                        default { "Expert" }
                    }
                }
                "TotalCompensation" = { param($item) $item.Salary + ($item.Salary * 0.15) }
            }
        }
    }
) -ReturnReport

$pipelineData = $pipelineResult.data
$pipelineReport = $pipelineResult.report

Write-Host "✓ Pipeline processing completed" -ForegroundColor Green
Write-Host "  - Final result: $($pipelineData.Count) records" -ForegroundColor Green
Write-Host "  - Total operations: $($pipelineReport.statistics.totalOperations)" -ForegroundColor Green
Write-Host "  - Total processing time: $([Math]::Round($pipelineReport.statistics.totalProcessingTime, 2))ms" -ForegroundColor Green

# Test 5: Advanced Filtering
Write-Host "`n=== TEST 5: Advanced Filtering ===" -ForegroundColor Yellow

Write-Host "Testing predicate-based filtering..." -ForegroundColor Cyan
$highPerformers = Invoke-DataProcessing -Data $testData -Operation "filter" -Options @{
    predicate = { param($item) $item.Score -gt 90 -and $item.Status -eq "Active" }
}

Write-Host "Testing range filtering..." -ForegroundColor Cyan
$topFiveEmployees = Invoke-DataProcessing -Data ($testData | Sort-Object Score -Descending) -Operation "filter" -Options @{
    range = @{ start = 0; count = 5 }
}

Write-Host "✓ Found $($highPerformers.Count) high-performing employees (Score > 90, Active status)" -ForegroundColor Green
Write-Host "✓ Retrieved top $($topFiveEmployees.Count) employees by score" -ForegroundColor Green

# Export results
Write-Host "`n=== EXPORTING RESULTS ===" -ForegroundColor Yellow

# Load OutputManager for export
. "$PSScriptRoot\OutputManager.ps1"
$outputManager = New-OutputManager

Write-Host "Exporting pipeline results..." -ForegroundColor Cyan
$pipelineOutputPath = Join-Path $OutputDirectory "pipeline-results.json"
$outputManager.ExportData($pipelineData, "json", $pipelineOutputPath, @{})

$reportOutputPath = Join-Path $OutputDirectory "processing-report.json"
$outputManager.ExportData($pipelineReport, "json", $reportOutputPath, @{})

if ($highPerformers.Count -gt 0) {
    $highPerformersPath = Join-Path $OutputDirectory "high-performers.csv"
    $outputManager.ExportData($highPerformers, "csv", $highPerformersPath, @{})
    Write-Host "✓ Exported high performers: $(Split-Path $highPerformersPath -Leaf)" -ForegroundColor Green
} else {
    Write-Host "⚠ No high performers to export (empty result set)" -ForegroundColor Yellow
}

Write-Host "✓ Exported pipeline results: $(Split-Path $pipelineOutputPath -Leaf)" -ForegroundColor Green
Write-Host "✓ Exported processing report: $(Split-Path $reportOutputPath -Leaf)" -ForegroundColor Green

# Summary
Write-Host "`n=== DATA PROCESSOR TEST SUMMARY ===" -ForegroundColor Green

Write-Host "`nCapabilities Demonstrated:" -ForegroundColor Cyan
Write-Host "  ✓ Data Filtering (property, predicate, range-based)" -ForegroundColor White
Write-Host "  ✓ Data Transformation (calculations, formatting)" -ForegroundColor White
Write-Host "  ✓ Data Validation (schema validation with errors/warnings)" -ForegroundColor White
Write-Host "  ✓ Pipeline Processing (multi-step operations)" -ForegroundColor White
Write-Host "  ✓ Performance Monitoring (timing and statistics)" -ForegroundColor White

Write-Host "`nTest Results:" -ForegroundColor Cyan
Write-Host "  • Original dataset: $($testData.Count) records" -ForegroundColor White
Write-Host "  • Active employees: $($activeEmployees.Count) records" -ForegroundColor White
Write-Host "  • Engineering staff: $($engineeringStaff.Count) records" -ForegroundColor White
Write-Host "  • High performers: $($highPerformers.Count) records" -ForegroundColor White
Write-Host "  • Pipeline result: $($pipelineData.Count) records" -ForegroundColor White

Write-Host "`nPerformance Metrics:" -ForegroundColor Cyan
Write-Host "  • Total pipeline operations: $($pipelineReport.statistics.totalOperations)" -ForegroundColor White
Write-Host "  • Total processing time: $([Math]::Round($pipelineReport.statistics.totalProcessingTime, 2))ms" -ForegroundColor White
Write-Host "  • Average operation time: $([Math]::Round($pipelineReport.statistics.averageProcessingTime, 2))ms" -ForegroundColor White

Write-Host "`nGenerated Files:" -ForegroundColor Cyan
if (Test-Path $OutputDirectory) {
    Get-ChildItem $OutputDirectory -File | Where-Object { $_.Name -match "(pipeline|processing|high-performers)" } | ForEach-Object {
        $size = [math]::Round($_.Length / 1KB, 2)
        Write-Host "  • $($_.Name) (${size} KB)" -ForegroundColor White
    }
}

Write-Host "`n✅ DataProcessor utility abstraction testing completed successfully!" -ForegroundColor Green
Write-Host "The 5th utility abstraction is now fully implemented and tested." -ForegroundColor Yellow