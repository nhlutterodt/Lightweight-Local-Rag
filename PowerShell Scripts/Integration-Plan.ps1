# Integration-Plan.ps1 - Systematic integration of utility abstractions into production scripts
# Analyzes existing scripts and creates integration roadmap

. "$PSScriptRoot\ScriptLoader.ps1"

function Analyze-ScriptForIntegration {
    param(
        [string]$ScriptPath,
        [string]$ScriptName
    )
    
    if (-not (Test-Path $ScriptPath)) {
        return $null
    }
    
    $content = Get-Content $ScriptPath -Raw
    $analysis = @{
        "ScriptName" = $ScriptName
        "ScriptPath" = $ScriptPath
        "CurrentDependencies" = @()
        "ManualDotSourcing" = @()
        "PotentialIntegrations" = @()
        "ExecutionTracking" = $false
        "ErrorHandling" = $false
        "OutputManagement" = $false
        "DataProcessing" = $false
        "IntegrationPriority" = "Low"
        "EstimatedEffort" = "Minimal"
    }
    
    # Analyze current dot-sourcing patterns
    $dotSourcePattern = '\.\s*["\$][^"]*\.ps1["\s]*'
    $dotSourceMatches = [regex]::Matches($content, $dotSourcePattern)
    foreach ($match in $dotSourceMatches) {
        $analysis.ManualDotSourcing += $match.Value.Trim()
        
        # Extract dependency names
        if ($match.Value -like "*XMLLogger*") { $analysis.CurrentDependencies += "XMLLogger" }
        if ($match.Value -like "*ConsoleUtils*") { $analysis.CurrentDependencies += "ConsoleUtils" }
        if ($match.Value -like "*PathUtils*") { $analysis.CurrentDependencies += "PathUtils" }
        if ($match.Value -like "*DateTimeUtils*") { $analysis.CurrentDependencies += "DateTimeUtils" }
        if ($match.Value -like "*ValidationUtils*") { $analysis.CurrentDependencies += "ValidationUtils" }
        if ($match.Value -like "*FileUtils*") { $analysis.CurrentDependencies += "FileUtils" }
    }
    
    # Analyze patterns that suggest utility abstraction benefits
    
    # ScriptLoader Integration
    if ($analysis.ManualDotSourcing.Count -gt 2) {
        $analysis.PotentialIntegrations += "ScriptLoader - Replace $($analysis.ManualDotSourcing.Count) manual imports"
        $analysis.IntegrationPriority = "High"
        $analysis.EstimatedEffort = "Medium"
    }
    
    # ExecutionContext Integration  
    $executionPatterns = @(
        'Write-Host.*started', 'Write-Host.*completed', 'Get-Date.*start', 'Get-Date.*end',
        'New-PerformanceTimer', '\$timer', 'Measure-Command', 'StartTime.*=', 'EndTime.*='
    )
    
    $executionMatches = 0
    foreach ($pattern in $executionPatterns) {
        if ($content -match $pattern) { $executionMatches++ }
    }
    
    if ($executionMatches -gt 2) {
        $analysis.ExecutionTracking = $true
        $analysis.PotentialIntegrations += "ExecutionContext - Replace $executionMatches execution tracking patterns"
        $analysis.IntegrationPriority = "High"
    }
    
    # OutputManager Integration
    $outputPatterns = @(
        'ConvertTo-Json', 'ConvertTo-Xml', 'Export-Csv', 'Out-File.*\.json', 'Out-File.*\.xml', 
        'Out-File.*\.csv', '\| ConvertTo', 'Export-Clixml'
    )
    
    $outputMatches = 0
    foreach ($pattern in $outputPatterns) {
        if ($content -match $pattern) { $outputMatches++ }
    }
    
    if ($outputMatches -gt 1) {
        $analysis.OutputManagement = $true
        $analysis.PotentialIntegrations += "OutputManager - Standardize $outputMatches output operations"
        if ($analysis.IntegrationPriority -eq "Low") { $analysis.IntegrationPriority = "Medium" }
    }
    
    # ErrorManager Integration
    $errorPatterns = @(
        'try\s*{', 'catch\s*{', 'Write-Error', 'Write-Warning', '\$Error\[', 
        'ErrorActionPreference', 'throw', '$_.Exception'
    )
    
    $errorMatches = 0
    foreach ($pattern in $errorPatterns) {
        if ($content -match $pattern) { $errorMatches++ }
    }
    
    if ($errorMatches -gt 2) {
        $analysis.ErrorHandling = $true  
        $analysis.PotentialIntegrations += "ErrorManager - Centralize $errorMatches error handling patterns"
        if ($analysis.IntegrationPriority -eq "Low") { $analysis.IntegrationPriority = "Medium" }
    }
    
    # DataProcessor Integration
    $dataPatterns = @(
        'ForEach-Object', 'Where-Object', '\| Where', '\| ForEach', 'Select-Object',
        'Group-Object', 'Sort-Object', '\| Select', '\| Group', '\| Sort'
    )
    
    $dataMatches = 0
    foreach ($pattern in $dataPatterns) {
        if ($content -match $pattern) { $dataMatches++ }
    }
    
    if ($dataMatches -gt 3) {
        $analysis.DataProcessing = $true
        $analysis.PotentialIntegrations += "DataProcessor - Pipeline processing for $dataMatches data operations"
        if ($analysis.IntegrationPriority -eq "Low") { $analysis.IntegrationPriority = "Medium" }
    }
    
    # Calculate effort
    if ($analysis.PotentialIntegrations.Count -gt 3) {
        $analysis.EstimatedEffort = "High"
    } elseif ($analysis.PotentialIntegrations.Count -gt 1) {
        $analysis.EstimatedEffort = "Medium"
    }
    
    return $analysis
}

function Generate-IntegrationReport {
    param([array]$ScriptAnalyses)
    
    Write-Host "`n=== UTILITY ABSTRACTION INTEGRATION REPORT ===" -ForegroundColor Magenta
    Write-Host "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
    
    # Summary statistics
    $totalScripts = $ScriptAnalyses.Count
    $highPriority = ($ScriptAnalyses | Where-Object { $_.IntegrationPriority -eq "High" }).Count
    $mediumPriority = ($ScriptAnalyses | Where-Object { $_.IntegrationPriority -eq "Medium" }).Count
    $lowPriority = ($ScriptAnalyses | Where-Object { $_.IntegrationPriority -eq "Low" }).Count
    
    Write-Host "`nINTEGRATION SUMMARY:" -ForegroundColor Yellow
    Write-Host "  Total Scripts Analyzed: $totalScripts" -ForegroundColor White
    Write-Host "  High Priority Integration: $highPriority scripts" -ForegroundColor Red
    Write-Host "  Medium Priority Integration: $mediumPriority scripts" -ForegroundColor Yellow
    Write-Host "  Low Priority Integration: $lowPriority scripts" -ForegroundColor Green
    
    # High priority scripts
    $highPriorityScripts = $ScriptAnalyses | Where-Object { $_.IntegrationPriority -eq "High" } | Sort-Object ScriptName
    if ($highPriorityScripts) {
        Write-Host "`nHIGH PRIORITY INTEGRATIONS:" -ForegroundColor Red
        foreach ($script in $highPriorityScripts) {
            Write-Host "`n📋 $($script.ScriptName)" -ForegroundColor Cyan
            Write-Host "   Effort: $($script.EstimatedEffort)" -ForegroundColor Gray
            Write-Host "   Current Dependencies: $($script.CurrentDependencies -join ', ')" -ForegroundColor Gray
            Write-Host "   Integration Opportunities:" -ForegroundColor White
            foreach ($integration in $script.PotentialIntegrations) {
                Write-Host "     • $integration" -ForegroundColor Yellow
            }
        }
    }
    
    # Medium priority scripts  
    $mediumPriorityScripts = $ScriptAnalyses | Where-Object { $_.IntegrationPriority -eq "Medium" } | Sort-Object ScriptName
    if ($mediumPriorityScripts) {
        Write-Host "`nMEDIUM PRIORITY INTEGRATIONS:" -ForegroundColor Yellow
        foreach ($script in $mediumPriorityScripts) {
            Write-Host "`n📋 $($script.ScriptName)" -ForegroundColor Cyan
            Write-Host "   Effort: $($script.EstimatedEffort)" -ForegroundColor Gray
            foreach ($integration in $script.PotentialIntegrations) {
                Write-Host "     • $integration" -ForegroundColor White
            }
        }
    }
    
    # Integration roadmap
    Write-Host "`nRECOMMENDED INTEGRATION SEQUENCE:" -ForegroundColor Green
    Write-Host "1. Start with HIGH priority scripts (maximum benefit)" -ForegroundColor White
    Write-Host "2. Focus on ScriptLoader integration first (easiest wins)" -ForegroundColor White  
    Write-Host "3. Add ExecutionContext for performance tracking" -ForegroundColor White
    Write-Host "4. Implement OutputManager for standardized exports" -ForegroundColor White
    Write-Host "5. Add ErrorManager for robust error handling" -ForegroundColor White
    Write-Host "6. Use DataProcessor for complex data operations" -ForegroundColor White
    
    return $ScriptAnalyses
}

function Main {
    Write-Host "=== INTEGRATION ANALYSIS STARTING ===" -ForegroundColor Cyan
    
    # Get all PowerShell scripts in the directory
    $scriptFiles = Get-ChildItem "$PSScriptRoot\*.ps1" | Where-Object { 
        $_.Name -notlike "Test-*" -and 
        $_.Name -notlike "*Test*" -and
        $_.Name -notin @("ScriptLoader.ps1", "ExecutionContext.ps1", "OutputManager.ps1", "ErrorManager.ps1", "DataProcessor.ps1", "Integration-Plan.ps1")
    }
    
    Write-Host "Analyzing $($scriptFiles.Count) production scripts..." -ForegroundColor Yellow
    
    $analyses = @()
    foreach ($scriptFile in $scriptFiles) {
        Write-Host "  Analyzing $($scriptFile.Name)..." -ForegroundColor Gray
        $analysis = Analyze-ScriptForIntegration -ScriptPath $scriptFile.FullName -ScriptName $scriptFile.BaseName
        if ($analysis) {
            $analyses += $analysis
        }
    }
    
    # Generate report
    $integrationData = Generate-IntegrationReport -ScriptAnalyses $analyses
    
    # Export detailed analysis
    $outputPath = "$PSScriptRoot\..\TestResults\integration-analysis.json"
    $integrationData | ConvertTo-Json -Depth 10 | Out-File $outputPath -Encoding UTF8
    Write-Host "`nDetailed analysis exported to: $outputPath" -ForegroundColor Green
    
    Write-Host "`n=== INTEGRATION ANALYSIS COMPLETE ===" -ForegroundColor Cyan
    return $integrationData
}

# Run the analysis
$integrationResults = Main