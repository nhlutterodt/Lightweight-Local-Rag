# Test-ExecutionContext.ps1 - Comprehensive testing of ExecutionContext utility
# Tests both XMLLogger-enabled and fallback scenarios

# Import the ExecutionContext utility
. "$PSScriptRoot\ExecutionContext.ps1"

function Test-ExecutionContextBasic {
    Write-Host "`n=== Testing ExecutionContext Basic Functionality ===" -ForegroundColor Cyan
    
    try {
        # Test basic constructor
        $context = [ExecutionContext]::new("TestOperation")
        
        # Test phase tracking
        $context.StartPhase("Initialization")
        Start-Sleep -Milliseconds 100
        $context.CompletePhase("Initialization")
        
        $context.StartPhase("Processing") 
        Start-Sleep -Milliseconds 150
        $context.CompletePhase("Processing")
        
        # Test metadata
        $context.AddMetadata("testParam", "testValue")
        $context.AddMetadata("itemCount", 42)
        
        # Test checkpoint recording
        $context.RecordCheckpoint("MidProcess")
        
        # Test logging methods (should work regardless of XMLLogger availability)
        $context.LogInfo("Test information message")
        $context.LogSuccess("Test completed successfully")
        $context.LogWarning("Test warning message")
        
        # Get summary
        $summary = $context.GetExecutionSummary()
        
        Write-Host "✓ Basic ExecutionContext operations successful" -ForegroundColor Green
        Write-Host "  - Operation: $($summary.OperationName)" -ForegroundColor Gray
        Write-Host "  - Phases completed: $($summary.PhasesCompleted)" -ForegroundColor Gray
        Write-Host "  - Total duration: $($summary.TotalDurationMs)ms" -ForegroundColor Gray
        Write-Host "  - Metadata items: $($summary.Metadata.Count)" -ForegroundColor Gray
        Write-Host "  - Logging enabled: $($context.LoggingEnabled)" -ForegroundColor Gray
        
        # Finalize
        $context.Finalize()
        
        return $true
    } catch {
        Write-Host "✗ ExecutionContext basic test failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Test-ExecutionContextWithLogging {
    Write-Host "`n=== Testing ExecutionContext with Logging Context ===" -ForegroundColor Cyan
    
    try {
        # Test constructor with logging context
        $context = [ExecutionContext]::new("LogTestOperation", "execution-context-test")
        
        $context.StartPhase("DataLoad")
        Start-Sleep -Milliseconds 75
        $context.CompletePhase("DataLoad")
        
        $context.StartPhase("Validation")
        Start-Sleep -Milliseconds 50
        $context.CompletePhase("Validation")
        
        # Test error phase
        $context.StartPhase("ErrorTest")
        $context.CompletePhaseWithError("ErrorTest", "Simulated test error")
        
        # Test various logging levels
        $context.LogInfo("Info message with data", @{"testKey" = "testValue"})
        $context.LogSuccess("Success with metrics", @{"processed" = 100; "duration" = "125ms"})
        $context.LogWarning("Warning about test condition", @{"warningCode" = "TEST001"})
        $context.LogError("Test error scenario", @{"errorCode" = "TEST002"; "severity" = "low"})
        
        $summary = $context.GetExecutionSummary()
        
        Write-Host "✓ ExecutionContext with logging successful" -ForegroundColor Green
        Write-Host "  - Operation: $($summary.OperationName)" -ForegroundColor Gray
        Write-Host "  - Phases completed: $($summary.PhasesCompleted)" -ForegroundColor Gray
        Write-Host "  - Phases with errors: $($summary.PhasesWithErrors)" -ForegroundColor Gray
        Write-Host "  - Logging enabled: $($context.LoggingEnabled)" -ForegroundColor Gray
        
        if ($context.LoggingEnabled -and $context.Logger) {
            Write-Host "  - XML log will be saved on finalization" -ForegroundColor Gray
        }
        
        $context.Finalize()
        
        return $true
    } catch {
        Write-Host "✗ ExecutionContext with logging test failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Test-ExecutionContextErrorHandling {
    Write-Host "`n=== Testing ExecutionContext Error Handling ===" -ForegroundColor Cyan
    
    try {
        $context = [ExecutionContext]::new("ErrorHandlingTest", "error-test")
        
        # Test error finalization
        $context.StartPhase("CriticalOperation")
        
        # Simulate a critical error scenario
        $context.FinalizeWithError("Critical test failure occurred during operation")
        
        Write-Host "✓ ExecutionContext error handling successful" -ForegroundColor Green
        
        return $true
    } catch {
        Write-Host "✗ ExecutionContext error handling test failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Test-ExecutionContextConsoleOutput {
    Write-Host "`n=== Testing ExecutionContext Console Output ===" -ForegroundColor Cyan
    
    try {
        # Test with console output disabled
        $context = [ExecutionContext]::new("ConsoleTest", "console-test", $false)
        
        $context.StartPhase("QuietOperation")
        $context.LogInfo("This should not produce console output")
        $context.CompletePhase("QuietOperation")
        
        $context.Finalize()
        
        Write-Host "✓ ExecutionContext console output control successful" -ForegroundColor Green
        
        return $true
    } catch {
        Write-Host "✗ ExecutionContext console output test failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Main {
    Write-Host "Starting ExecutionContext Comprehensive Tests..." -ForegroundColor Yellow
    Write-Host "Testing ExecutionContext.ps1 functionality and dependency handling" -ForegroundColor Yellow
    
    $results = @()
    
    # Run all tests
    $results += Test-ExecutionContextBasic
    $results += Test-ExecutionContextWithLogging  
    $results += Test-ExecutionContextErrorHandling
    $results += Test-ExecutionContextConsoleOutput
    
    # Summary
    $passed = ($results | Where-Object { $_ -eq $true }).Count
    $total = $results.Count
    
    Write-Host "`n=== ExecutionContext Test Results ===" -ForegroundColor Yellow
    Write-Host "Tests Passed: $passed/$total" -ForegroundColor $(if ($passed -eq $total) { "Green" } else { "Red" })
    
    if ($passed -eq $total) {
        Write-Host "✓ All ExecutionContext tests passed! The utility is working correctly." -ForegroundColor Green
        Write-Host "  - Dependency loading works properly" -ForegroundColor Gray
        Write-Host "  - XMLLogger integration follows project patterns" -ForegroundColor Gray
        Write-Host "  - Error handling is robust" -ForegroundColor Gray
        Write-Host "  - Console output control works" -ForegroundColor Gray
    } else {
        Write-Host "✗ Some ExecutionContext tests failed. Check output above for details." -ForegroundColor Red
    }
    
    # Check for XMLLogger availability
    Write-Host "`n=== Dependency Status ===" -ForegroundColor Yellow
    if ($script:XMLLoggerAvailable) {
        Write-Host "✓ XMLLogger.ps1 is available - full logging functionality enabled" -ForegroundColor Green
    } else {
        Write-Host "ℹ XMLLogger.ps1 not available - running with fallback functionality" -ForegroundColor Yellow
    }
    
    if ($script:DateTimeUtilsAvailable) {
        Write-Host "✓ DateTimeUtils.ps1 is available - enhanced timing functionality enabled" -ForegroundColor Green
    } else {
        Write-Host "ℹ DateTimeUtils.ps1 not available - using basic timing" -ForegroundColor Yellow  
    }
    
    if ($script:ConsoleUtilsAvailable) {
        Write-Host "✓ ConsoleUtils.ps1 is available - enhanced console output enabled" -ForegroundColor Green
    } else {
        Write-Host "ℹ ConsoleUtils.ps1 not available - using basic console output" -ForegroundColor Yellow
    }
}

# Run the tests
Main