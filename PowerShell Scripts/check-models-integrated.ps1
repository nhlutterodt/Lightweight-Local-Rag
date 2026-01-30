# Enhanced script to check for Ollama and available models with INTEGRATED utility abstractions
# This demonstrates the new integrated approach using our 5 utility abstractions

# =============================================================================
# INTEGRATED UTILITY LOADING - Replace 9 manual imports with ScriptLoader
# =============================================================================

. "$PSScriptRoot\ScriptLoader.ps1"

# Initialize ScriptLoader and load all standard utilities at once
$scriptLoader = [ScriptLoader]::new($PSScriptRoot)
$loadResult = $scriptLoader.LoadStandardUtilities()

# Also load our utility abstractions
$abstractionLoadResult = $scriptLoader.LoadProfile("abstractions")

# Import the abstraction classes directly to ensure they're available
. "$PSScriptRoot\ExecutionContext.ps1"
. "$PSScriptRoot\OutputManager.ps1"
. "$PSScriptRoot\ErrorManager.ps1"
. "$PSScriptRoot\DataProcessor.ps1"

# Also dot-source SystemUtils to ensure functions are in global scope
. "$PSScriptRoot\SystemUtils.ps1"
. "$PSScriptRoot\ModelUtils.ps1"

# Display loading results with built-in success/failure reporting
Write-Host "`nUtility Loading Results:" -ForegroundColor Yellow
foreach ($utility in $loadResult.LoadedUtilities) {
    Write-Host "  ✓ $utility" -ForegroundColor Green
}
foreach ($utility in $abstractionLoadResult.LoadedUtilities) {
    Write-Host "  ✓ $utility (abstraction)" -ForegroundColor Cyan
}
if ($loadResult.FailedUtilities.Count -gt 0 -or $abstractionLoadResult.FailedUtilities.Count -gt 0) {
    Write-Host "Failed to load:" -ForegroundColor Red
    foreach ($failed in $loadResult.FailedUtilities + $abstractionLoadResult.FailedUtilities) {
        Write-Host "  ✗ $failed" -ForegroundColor Red  
    }
}

# =============================================================================
# INTEGRATED EXECUTION CONTEXT - Replace manual timing and logging setup
# =============================================================================

$context = [ExecutionContext]::new("Enhanced-Ollama-Check", "ollama-models")
$context.AddMetadata("scriptVersion", "4.0-integrated")
$context.AddMetadata("checkType", "integrated-utilities")

# =============================================================================
# MAIN EXECUTION WITH INTEGRATED ABSTRACTIONS
# =============================================================================

try {
    $context.StartPhase("SystemInformation")
    
    Write-Header "INTEGRATED OLLAMA MODEL CHECK"
    $context.LogInfo("Starting integrated Ollama model check with utility abstractions")
    
    # Add comprehensive system information to log using integrated approach
    Write-Section "System Information Collection"
    Add-SystemInfoToLog -Logger $context.Logger -Category "SYSTEM" -Level "extended"
    Show-SystemInfo -Level "basic"
    
    $context.CompletePhase("SystemInformation")
    
    # =======================================================================
    # OLLAMA DETECTION AND MODEL ENUMERATION
    # =======================================================================
    
    $context.StartPhase("OllamaDetection")
    
    Write-Section "Ollama Installation Detection"
    $ollamaManager = [OllamaManager]::new()
    $ollamaAvailable = $ollamaManager.IsAvailable
    
    if ($ollamaAvailable) {
        $context.LogSuccess("Ollama installation detected and accessible")
        Write-SuccessMessage "Ollama is installed and accessible"
        
        $context.StartPhase("ModelEnumeration")
        $context.RecordCheckpoint("Starting model enumeration")
        
        Write-Section "Available Models Enumeration"
        
        try {
            $models = Get-OllamaModels
            $context.AddMetadata("totalModels", $models.Count)
            
            if ($models.Count -gt 0) {
                $context.LogSuccess("Found $($models.Count) Ollama models", @{
                    "modelCount" = $models.Count
                    "models" = ($models | Select-Object name, size -First 5)
                })
                
                Write-SuccessMessage "Found $($models.Count) available models:"
                
                # Use DataProcessor for enhanced model data handling
                $dataProcessor = [DataProcessor]::new()
                
                # Transform model data using ProcessData method
                $transformedData = $models | ForEach-Object {
                    $sizeText = $_.size -replace '[^0-9.]', ''
                    $sizeValue = 0
                    if ([double]::TryParse($sizeText, [ref]$sizeValue)) {
                        $sizeGB = [math]::Round($sizeValue / 1073741824, 2)  # Convert bytes to GB
                    } else {
                        $sizeGB = 0
                    }
                    
                    @{
                        "name" = $_.name
                        "size" = $_.size
                        "sizeGB" = $sizeGB
                        "category" = if ($_.name -match "llama") { "LLaMA" } 
                                    elseif ($_.name -match "codellama") { "Code" }
                                    elseif ($_.name -match "vicuna") { "Vicuna" }
                                    else { "Other" }
                    }
                }
                
                # Process the data through DataProcessor for validation and formatting
                $processedModels = $dataProcessor.ProcessData($transformedData, "filter", @{})
                
                # Display processed model information
                $outputManager = [OutputManager]::new()
                $outputManager.VerboseOutput = $true
                
                # Ensure TestResults directory exists
                if (-not (Test-Path ".\TestResults")) {
                    New-Item -Path ".\TestResults" -ItemType Directory -Force | Out-Null
                }
                
                # Export to multiple formats using OutputManager's dedicated method
                $exportResults = $outputManager.ExportToMultipleFormats($processedModels, @("json", "xml", "csv"), ".\TestResults\ollama-models")
                
                # Report export results
                $context.LogInfo("Model data exported to multiple formats", $exportResults)
                
                foreach ($format in $exportResults.Keys) {
                    $result = $exportResults[$format]
                    if ($result.status -eq "success") {
                        Write-SuccessMessage "✓ Exported to $format`: $($result.path)"
                    } else {
                        Write-ErrorMessage "✗ Failed to export to $format`: $($result.error)"
                    }
                }
                
                $context.CompletePhase("ModelEnumeration")
                
            } else {
                $context.LogWarning("No models found in Ollama installation")
                Write-WarningMessage "No models found. You may need to pull some models first."
                Write-InfoMessage "Try: ollama pull llama2"
                $context.CompletePhase("ModelEnumeration")
            }
            
        } catch {
            $context.LogError("Model enumeration failed", @{
                "error" = $_.Exception.Message
                "stackTrace" = $_.Exception.StackTrace
            })
            Write-ErrorMessage "Failed to get Ollama models: $($_.Exception.Message)"
            $context.CompletePhaseWithError("ModelEnumeration", "Model enumeration failed: $($_.Exception.Message)")
        }
        
        $context.CompletePhase("OllamaDetection")
        
    } else {
        $context.LogWarning("Ollama not detected on this system")
        Write-WarningMessage "Ollama is not installed or not accessible"
        Write-InfoMessage "Install Ollama from: https://ollama.ai"
        Write-InfoMessage "After installation, try: ollama pull llama2"
        
        $context.CompletePhaseWithError("OllamaDetection", "Ollama not available on system")
    }
    
    # =======================================================================
    # COMPLETION AND REPORTING
    # =======================================================================
    
    $context.StartPhase("ReportGeneration")
    
    # Generate comprehensive summary using integrated utilities
    $summary = $context.GetExecutionSummary()
    $context.LogInfo("Execution summary generated", $summary)
    
    # Use OutputManager to export execution summary
    $summaryExport = $outputManager.ExportData($summary, "json", ".\TestResults\ollama-check-summary.json")
    if ($summaryExport.success) {
        Write-SuccessMessage "Execution summary exported: $($summaryExport.path)"
    }
    
    $context.CompletePhase("ReportGeneration")
    
    # Successful completion
    $context.Finalize()
    
} catch {
    # Integrated error handling
    $context.LogError("Critical error in Ollama check: $($_.Exception.Message)", @{
        "error" = $_.Exception.Message
        "stackTrace" = $_.Exception.StackTrace
        "phase" = "UnknownPhase"
    })
    
    Write-ErrorMessage "Critical error occurred: $($_.Exception.Message)"
    
    $context.FinalizeWithError("Critical error: $($_.Exception.Message)")
    
    throw
}

Write-Host "`n" -NoNewline
Write-SuccessMessage "Enhanced Ollama check completed using integrated utility abstractions!"
Write-InfoMessage "Check the TestResults folder for exported data and logs."