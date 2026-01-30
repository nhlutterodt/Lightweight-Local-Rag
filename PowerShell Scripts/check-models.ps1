# Enhanced script to check for Ollama and available models with utilities integration

# Import LocalRagUtils module
Import-Module "$PSScriptRoot\LocalRagUtils\LocalRagUtils.psd1" -Force

# Initialize performance timer
$timer = New-PerformanceTimer -OperationName "Enhanced Ollama Check"

# Initialize logger with enhanced contextual naming using centralized path
$sessionName = "Ollama-Enhanced-Check-$(Get-FilenameTimestamp)"
$logger = [XMLLogger]::NewWithContextualPath("check", "ollama", "models", $sessionName)

Write-Header "ENHANCED OLLAMA MODEL CHECK"
$logger.LogInfo("SYSTEM", "Starting enhanced Ollama model check", @{
        "scriptVersion" = "3.0"
        "checkType"     = "enhanced-with-utilities"
        "startTime"     = Get-XmlTimestamp
    })

# Add checkpoint for initialization
$timer.AddCheckpoint("Logger initialized")

# Add comprehensive system information to log
Write-Section "System Information Collection"
Add-SystemInfoToLog -Logger $logger -Category "SYSTEM" -Level "extended"

# Display system info using new utilities
Show-SystemInfo -Level "basic"

$timer.AddCheckpoint("System information collected")

# Create Ollama manager instance
Write-Section "Ollama Service Check"
$ollamaManager = [OllamaManager]::new()

# Perform comprehensive system check with detailed logging
$ollamaManager.LogSystemCheck($logger)

$timer.AddCheckpoint("Ollama check completed")

# Save log with performance data
Write-Section "Finalizing Results"

# Add performance summary to log
$performanceData = @{
    "totalElapsed"   = Format-ElapsedTime $timer.GetElapsed()
    "checkpoints"    = $timer.Checkpoints
    "completionTime" = Get-XmlTimestamp
}

$logger.LogInfo("PERFORMANCE", "Script execution completed", $performanceData)

try {
    $logger.SaveLog()
    $logPath = $logger.LogFile
    Write-SuccessMessage "Enhanced Ollama check completed successfully"
    Write-KeyValuePair "Log File" $logPath
    Write-KeyValuePair "Execution Time" (Format-ElapsedTime $timer.GetElapsed())
    
    # Display performance summary
    Write-Section "Performance Summary"
    Write-DetailMessage $timer.GetSummary()
    
}
catch {
    Write-ErrorMessage "Failed to save log: $($_.Exception.Message)"
    $logger.LogError("SYSTEM", "Log save failed", @{ "error" = $_.Exception.Message })
}

Write-Separator
Write-InfoMessage "Enhanced check complete with integrated utilities"
Write-MutedMessage "Log saved with comprehensive system and performance data"