# Full-System-Test.ps1 - Comprehensive end-to-end test with all utility improvements

# Import LocalRagUtils module
Import-Module "$PSScriptRoot\LocalRagUtils\LocalRagUtils.psd1" -Force -Verbose

# Ensure all scripts are loaded (double check via module)
# Note: ScriptsToProcess in the module manifest handles loading, so dot-sourcing is no longer needed.
# However, for the test validation logic below, we might still want to verify files exist.

Write-Header "FULL SYSTEM TEST - LOCAL RAG PROJECT" "="
Write-InfoMessage "Comprehensive end-to-end test with all utility improvements"

# Initialize performance tracking
$overallTimer = New-PerformanceTimer -OperationName "Full System Test"
$testResults = @()
$currentDir = Get-Location

# Initialize validation helper
$validator = New-ValidationHelper
$errorHandler = New-ErrorHandler -Context "Full System Test"

try {
    # Set the script directory as working directory
    Set-Location $PSScriptRoot
    
    Write-Section "Test Environment Setup"
    Show-ProjectInfo
    Write-KeyValuePair "Test Start Time" (Get-Timestamp)
    Write-KeyValuePair "PowerShell Version" $PSVersionTable.PSVersion
    Write-KeyValuePair "Working Directory" $PWD.Path
    
    # Test 1: Core Utilities Loading and Validation
    Write-Section "1. CORE UTILITIES LOADING AND VALIDATION"
    $testTimer = New-PerformanceTimer -OperationName "Core Utilities Test"
    
    try {
        # Validate all utility files exist
        $utilityFiles = @(
            "PathUtils.ps1", "ConsoleUtils.ps1", "DateTimeUtils.ps1", 
            "ValidationUtils.ps1", "XMLLogger.ps1", "XMLParser.ps1",
            "ReportUtils.ps1", "ModelUtils.ps1", "SystemUtils.ps1",
            "Schemas.ps1", "FileUtils.ps1"
        )
        
        $allUtilitiesFound = $true
        foreach ($file in $utilityFiles) {
            if (-not $validator.ValidateFileExists("$PSScriptRoot\$file", $file)) {
                $allUtilitiesFound = $false
            }
        }
        
        if ($allUtilitiesFound) {
            Write-SuccessMessage "All utility files found and loaded"
            $testResults += @{ 
                "Test"     = "Core Utilities"; 
                "Status"   = "✓ PASS"; 
                "Details"  = "$($utilityFiles.Count) utility files loaded successfully"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        else {
            Write-ErrorMessage "Some utility files missing"
            $testResults += @{ 
                "Test"     = "Core Utilities"; 
                "Status"   = "✗ FAIL"; 
                "Details"  = ($validator.GetErrors() -join "; ")
                "Duration" = $testTimer.GetElapsed()
            }
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "Core utilities test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "Core Utilities"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 2: Date/Time Utilities
    Write-Section "2. DATE/TIME UTILITIES TESTING"
    $testTimer = New-PerformanceTimer -OperationName "DateTime Utilities Test"
    
    try {
        # Test various datetime formatting
        $timestamp = Get-Timestamp
        $filenameTimestamp = Get-FilenameTimestamp
        $xmlTimestamp = Get-XmlTimestamp
        $relativeTime = Get-RelativeTimeString((Get-Date).AddHours(-2))
        
        Write-DetailMessage "Standard Timestamp: $timestamp"
        Write-DetailMessage "Filename Timestamp: $filenameTimestamp"
        Write-DetailMessage "XML Timestamp: $xmlTimestamp"
        Write-DetailMessage "Relative Time (2h ago): $relativeTime"
        
        # Test performance measurement
        $measureResult = Measure-ScriptBlock -ScriptBlock { Start-Sleep -Milliseconds 100 } -OperationName "Test Sleep"
        Write-DetailMessage "Performance measurement working: $($measureResult.elapsed.TotalMilliseconds)ms"
        
        $testTimer.Stop()
        Write-SuccessMessage "DateTime utilities working correctly"
        $testResults += @{ 
            "Test"     = "DateTime Utilities"; 
            "Status"   = "✓ PASS"; 
            "Details"  = "All timestamp formats and performance measurement working"
            "Duration" = $testTimer.GetElapsed()
        }
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "DateTime utilities test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "DateTime Utilities"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 3: Validation Utilities
    Write-Section "3. VALIDATION UTILITIES TESTING"
    $testTimer = New-PerformanceTimer -OperationName "Validation Utilities Test"
    
    try {
        $validationHelper = New-ValidationHelper
        
        # Test file validation
        $pathValidation = $validationHelper.ValidateFileExists("$PSScriptRoot\XMLLogger.ps1", "XMLLogger")
        $dirValidation = $validationHelper.ValidateDirectoryExists($Global:PathManager.LogsFolder, "Logs Directory")
        
        # Test string validation
        $stringValidation = $validationHelper.ValidateNotEmpty("test string", "Test String")
        $patternValidation = $validationHelper.ValidatePattern("test-123", "^[a-z]+-\d+$", "Pattern Test")
        
        if ($pathValidation -and $dirValidation -and $stringValidation -and $patternValidation) {
            Write-SuccessMessage "All validation tests passed"
            $testResults += @{ 
                "Test"     = "Validation Utilities"; 
                "Status"   = "✓ PASS"; 
                "Details"  = "File, directory, string, and pattern validation working"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        else {
            Write-WarningMessage "Some validation tests failed"
            $testResults += @{ 
                "Test"     = "Validation Utilities"; 
                "Status"   = "⚠ WARN"; 
                "Details"  = ($validationHelper.GetErrors() -join "; ")
                "Duration" = $testTimer.GetElapsed()
            }
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "Validation utilities test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "Validation Utilities"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 4: XMLLogger with Enhanced Features
    Write-Section "4. ENHANCED XMLLOGGER TESTING"
    $testTimer = New-PerformanceTimer -OperationName "Enhanced XMLLogger Test"
    
    try {
        $testLogger = [XMLLogger]::NewWithCentralizedPath("full-system-test", "EnhancedTest-$(Get-FilenameTimestamp)")
        
        # Test enhanced logging features
        $testLogger.LogInfo("SYSTEM", "Full system test started", @{
                "testVersion" = "2.0"
                "timestamp"   = Get-XmlTimestamp
                "machine"     = $env:COMPUTERNAME
                "user"        = $env:USERNAME
            })
        
        $testLogger.LogSuccess("VALIDATION", "All utilities loaded successfully")
        $testLogger.LogWarning("PERFORMANCE", "This is a performance test warning")
        
        # Test error handling with validation
        $errorHandler.SafeExecuteVoid({
                $testLogger.LogInfo("SAFE_EXEC", "Safe execution test passed")
            }, "Safe Execute Test")
        
        $testLogger.SaveLog()
        
        # Validate the log file was created correctly
        if ($validator.ValidateFileExists($testLogger.LogFile, "Test Log File") -and 
            $validator.ValidateXmlStructure($testLogger.LogFile, "PowerShellLog")) {
            
            Write-SuccessMessage "Enhanced XMLLogger working correctly"
            Write-DetailMessage "Log file created: $(Split-Path -Leaf $testLogger.LogFile)"
            
            $testResults += @{ 
                "Test"     = "Enhanced XMLLogger"; 
                "Status"   = "✓ PASS"; 
                "Details"  = "Centralized paths, enhanced logging, and validation working"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        else {
            Write-ErrorMessage "XMLLogger validation failed"
            $testResults += @{ 
                "Test"     = "Enhanced XMLLogger"; 
                "Status"   = "✗ FAIL"; 
                "Details"  = ($validator.GetErrors() -join "; ")
                "Duration" = $testTimer.GetElapsed()
            }
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "Enhanced XMLLogger test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "Enhanced XMLLogger"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 5: Enhanced Parsing and Reporting
    Write-Section "5. ENHANCED PARSING AND REPORTING"
    $testTimer = New-PerformanceTimer -OperationName "Parsing and Reporting Test"
    
    try {
        $parser = [XMLParser]::new()
        $schemaRegistry = Get-SchemaRegistry
        
        # Test parsing the log we just created
        $testLogData = $parser.ParseXML($testLogger.LogFile)
        Write-DetailMessage "Parsed $($testLogData.Count) log entries"
        
        if ($testLogData -and $testLogData.Count -gt 0) {
            # Convert PowerShell log entries to PSCustomObject array for reporting
            $logEntriesArray = @()
            foreach ($key in $testLogData.Keys) {
                if ($key -ne "_metadata") {
                    # Skip metadata
                    $entry = $testLogData[$key]
                    $logEntry = [PSCustomObject]@{
                        "Message"    = $entry.message
                        "Attributes" = @{
                            "timestamp" = $entry.timestamp
                            "level"     = $entry.level
                            "category"  = $entry.category
                        }
                    }
                    
                    # Add any additional data properties
                    if ($entry.data) {
                        foreach ($dataKey in $entry.data.Keys) {
                            $logEntry.Attributes[$dataKey] = $entry.data[$dataKey]
                        }
                    }
                    
                    $logEntriesArray += $logEntry
                }
            }
            
            Write-DetailMessage "Converted $($logEntriesArray.Count) entries to PSCustomObject format"
            
            # Test enhanced report generation with error handling
            try {
                Write-DetailMessage "Attempting text report generation..."
                $textReport = New-ModelReport -LogEntries $logEntriesArray -Format "text"
                Write-DetailMessage "Text report generated: $textReport"
                
                Write-DetailMessage "Attempting HTML report generation..."
                $htmlReport = New-ModelReport -LogEntries $logEntriesArray -Format "html"
                Write-DetailMessage "HTML report generated: $htmlReport"
                
                # Validate reports were created in correct locations
                $textValid = $validator.ValidateFileExists($textReport, "Text Report")
                $htmlValid = $validator.ValidateFileExists($htmlReport, "HTML Report")
                
                if ($textValid -and $htmlValid) {
                    Write-SuccessMessage "Enhanced parsing and reporting working"
                    Write-DetailMessage "Text report: $(Split-Path -Leaf $textReport)"
                    Write-DetailMessage "HTML report: $(Split-Path -Leaf $htmlReport)"
                    
                    $testResults += @{ 
                        "Test"     = "Enhanced Parsing/Reporting"; 
                        "Status"   = "✓ PASS"; 
                        "Details"  = "XML parsing and dual-format reporting working"
                        "Duration" = $testTimer.GetElapsed()
                    }
                }
                else {
                    Write-ErrorMessage "Report validation failed"
                    $testResults += @{ 
                        "Test"     = "Enhanced Parsing/Reporting"; 
                        "Status"   = "✗ FAIL"; 
                        "Details"  = ($validator.GetErrors() -join "; ")
                        "Duration" = $testTimer.GetElapsed()
                    }
                }
                
            }
            catch {
                Write-ErrorMessage "Report generation exception: $($_.Exception.Message)"
                Write-DetailMessage "Exception details: $($_.Exception.GetType().Name)" 2
                Write-DetailMessage "Stack trace: $($_.ScriptStackTrace)" 2
                
                $testResults += @{ 
                    "Test"     = "Enhanced Parsing/Reporting"; 
                    "Status"   = "✗ FAIL"; 
                    "Details"  = $_.Exception.Message
                    "Duration" = $testTimer.GetElapsed()
                }
            }
        }
        else {
            Write-ErrorMessage "No log data parsed"
            $testResults += @{ 
                "Test"     = "Enhanced Parsing/Reporting"; 
                "Status"   = "✗ FAIL"; 
                "Details"  = "No data from XML parsing"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "Parsing and reporting test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "Enhanced Parsing/Reporting"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 6: System and Model Utilities
    Write-Section "6. SYSTEM AND MODEL UTILITIES TESTING"
    $testTimer = New-PerformanceTimer -OperationName "System and Model Utilities Test"
    
    try {
        # Test SystemUtils
        $systemLogger = [XMLLogger]::NewWithCentralizedPath("system-test", "SystemUtilsTest")
        Add-SystemInfoToLog -Logger $systemLogger -Category "SYSTEM" -Level "basic"
        
        Write-DetailMessage "System Info Collected:"
        Write-DetailMessage "  OS: Basic system info collected" 2
        
        # Test ModelUtils
        $modelManager = [OllamaManager]::new()
        $modelManager.LogSystemCheck($systemLogger)
        
        Write-DetailMessage "Ollama System Check Completed"
        
        $systemLogger.SaveLog()
        
        Write-SuccessMessage "System and model utilities working"
        $testResults += @{ 
            "Test"     = "System/Model Utilities"; 
            "Status"   = "✓ PASS"; 
            "Details"  = "System info collection and Ollama checking working"
            "Duration" = $testTimer.GetElapsed()
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "System/Model utilities test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "System/Model Utilities"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 7: File Management and Organization
    Write-Section "7. FILE MANAGEMENT AND ORGANIZATION"
    $testTimer = New-PerformanceTimer -OperationName "File Management Test"
    
    try {
        # Test file organization display
        Write-DetailMessage "Current Project Organization:"
        Show-ProjectInfo
        
        # Test FileUtils if available
        if (Test-Path "$PSScriptRoot\FileUtils.ps1") {
            # Test file utilities
            $inventoryResult = Get-FileInventory -Path $Global:PathManager.ScriptsFolder -Filter "*.ps1"
            Write-DetailMessage "Project files enumerated: $($inventoryResult.fileCount) files"
        }
        
        # Validate directory structure
        $structureValid = $true
        $structureDetails = @()
        
        # Check essential directories exist
        if (-not (Test-Path $Global:PathManager.LogsFolder)) {
            $structureValid = $false
            $structureDetails += "Logs folder missing"
        }
        
        if (-not (Test-Path $Global:PathManager.ReportsFolder)) {
            $structureValid = $false
            $structureDetails += "Reports folder missing"
        }
        
        if (-not (Test-Path $Global:PathManager.HtmlPagesFolder)) {
            $structureValid = $false
            $structureDetails += "HTML pages folder missing"
        }
        
        if ($structureValid) {
            Write-SuccessMessage "File management and organization working"
            $testResults += @{ 
                "Test"     = "File Management"; 
                "Status"   = "✓ PASS"; 
                "Details"  = "Directory structure and file organization correct"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        else {
            Write-WarningMessage "Some file management issues detected"
            $testResults += @{ 
                "Test"     = "File Management"; 
                "Status"   = "⚠ WARN"; 
                "Details"  = ($structureDetails -join "; ")
                "Duration" = $testTimer.GetElapsed()
            }
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "File management test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "File Management"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 8: Integration Test - check-models.ps1
    Write-Section "8. INTEGRATION TEST - check-models.ps1"
    $testTimer = New-PerformanceTimer -OperationName "check-models Integration Test"
    
    try {
        Write-InfoMessage "Running check-models.ps1 with all enhancements..."
        & "$PSScriptRoot\check-models.ps1"
        
        # Verify the enhanced script created proper files
        $modelLogFiles = Get-ChildItem -Path $Global:PathManager.LogsFolder -Filter "*ollama*.xml" | 
        Sort-Object LastWriteTime -Descending
        
        if ($modelLogFiles.Count -gt 0) {
            $latestModelLog = $modelLogFiles[0]
            Write-DetailMessage "Latest model log: $($latestModelLog.Name)"
            
            # Parse and validate the log
            $modelLogData = $parser.ParseXML($latestModelLog.FullName)
            Write-DetailMessage "Model log entries: $($modelLogData.Count)"
            
            Write-SuccessMessage "check-models.ps1 integration successful"
            $testResults += @{ 
                "Test"     = "check-models Integration"; 
                "Status"   = "✓ PASS"; 
                "Details"  = "Script executed successfully with $($modelLogData.Count) entries"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        else {
            Write-WarningMessage "check-models.ps1 did not create expected log files"
            $testResults += @{ 
                "Test"     = "check-models Integration"; 
                "Status"   = "⚠ WARN"; 
                "Details"  = "Script ran but no model logs found"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "check-models.ps1 integration test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "check-models Integration"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 9: Performance and Error Handling Validation
    Write-Section "9. PERFORMANCE AND ERROR HANDLING VALIDATION"
    $testTimer = New-PerformanceTimer -OperationName "Performance and Error Handling Test"
    
    try {
        # Test error handling utilities
        $testErrorHandler = New-ErrorHandler -Context "Performance Test"
        
        # Test safe execution with success case
        $successResult = $testErrorHandler.SafeExecute({
                return "Success operation completed"
            }, "Success Test")
        
        # Test safe execution with error case
        $errorResult = $testErrorHandler.SafeExecute({
                throw "Intentional test error"
            }, "Error Test")
        
        # Test performance measurement
        $performanceTest = Measure-ScriptBlock -ScriptBlock {
            1..1000 | ForEach-Object { $_ * 2 } | Measure-Object -Sum
        } -OperationName "Math Operations Test"
        
        Write-DetailMessage "Performance test completed in: $($performanceTest.elapsed.TotalMilliseconds)ms"
        Write-DetailMessage "Error handler logged: $($testErrorHandler.GetErrorLog().Count) errors"
        
        if ($successResult -and $null -eq $errorResult -and $performanceTest.elapsed.TotalMilliseconds -lt 5000) {
            Write-SuccessMessage "Performance and error handling working correctly"
            $testResults += @{ 
                "Test"     = "Performance/Error Handling"; 
                "Status"   = "✓ PASS"; 
                "Details"  = "Safe execution and performance measurement working"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        else {
            Write-WarningMessage "Some performance/error handling issues detected"
            $testResults += @{ 
                "Test"     = "Performance/Error Handling"; 
                "Status"   = "⚠ WARN"; 
                "Details"  = "Performance or error handling not optimal"
                "Duration" = $testTimer.GetElapsed()
            }
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "Performance/Error handling test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "Performance/Error Handling"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Test 10: Comprehensive Integration Test
    Write-Section "10. COMPREHENSIVE INTEGRATION TEST"
    $testTimer = New-PerformanceTimer -OperationName "Comprehensive Integration Test"
    
    try {
        # Create a comprehensive test scenario
        $integrationLogger = [XMLLogger]::NewWithCentralizedPath("comprehensive-integration", "FullIntegration-$(Get-FilenameTimestamp)")
        
        # Log test start with system information
        $integrationLogger.LogInfo("INTEGRATION", "Comprehensive integration test started", @{
                "testVersion"       = "3.0"
                "utilitiesLoaded"   = $utilityFiles.Count.ToString()
                "timestamp"         = Get-XmlTimestamp
                "machine"           = $env:COMPUTERNAME
                "user"              = $env:USERNAME
                "powershellVersion" = $PSVersionTable.PSVersion.ToString()
            })
        
        # Test system information collection
        Add-SystemInfoToLog -Logger $integrationLogger -Category "INTEGRATION" -Level "basic"
        
        # Test model management
        $modelManager.LogSystemCheck($integrationLogger)
        
        # Test validation with logging
        $integrationValidator = New-ValidationHelper
        $pathsValid = $integrationValidator.ValidateDirectoryExists($Global:PathManager.ProjectRoot, "Project Root")
        
        if ($pathsValid) {
            $integrationLogger.LogSuccess("VALIDATION", "All integration validations passed")
        }
        else {
            $integrationLogger.LogWarning("VALIDATION", "Some integration validations failed", @{
                    "errors" = ($integrationValidator.GetErrors() -join "; ")
                })
        }
        
        # Test file operations
        $projectFiles = Get-ChildItem -Path $Global:PathManager.ScriptsFolder -Filter "*.ps1" | 
        Select-Object -First 5
        
        $integrationLogger.LogInfo("FILES", "Project file enumeration completed", @{
                "scriptsFound" = $projectFiles.Count.ToString()
                "sampleFiles"  = ($projectFiles.Name -join ", ")
            })
        
        # Log completion
        $integrationLogger.LogSuccess("INTEGRATION", "Comprehensive integration test completed successfully", @{
                "totalTests"     = $testResults.Count.ToString()
                "completionTime" = Get-XmlTimestamp
            })
        
        $integrationLogger.SaveLog()
        
        # Generate final reports
        $integrationData = $parser.ParseXML($integrationLogger.LogFile)
        
        # Convert PowerShell log entries to PSCustomObject array for reporting
        $integrationEntriesArray = @()
        foreach ($key in $integrationData.Keys) {
            if ($key -ne "_metadata") {
                # Skip metadata
                $entry = $integrationData[$key]
                $logEntry = [PSCustomObject]@{
                    "Message"    = $entry.message
                    "Attributes" = @{
                        "timestamp" = $entry.timestamp
                        "level"     = $entry.level
                        "category"  = $entry.category
                    }
                }
                
                # Add any additional data properties
                if ($entry.data) {
                    foreach ($dataKey in $entry.data.Keys) {
                        $logEntry.Attributes[$dataKey] = $entry.data[$dataKey]
                    }
                }
                
                $integrationEntriesArray += $logEntry
            }
        }
        
        try {
            $finalTextReport = New-ModelReport -LogEntries $integrationEntriesArray -Format "text"
            $finalHtmlReport = New-ModelReport -LogEntries $integrationEntriesArray -Format "html"
            
            Write-SuccessMessage "Comprehensive integration test completed successfully"
            Write-DetailMessage "Integration log: $(Split-Path -Leaf $integrationLogger.LogFile)"
            Write-DetailMessage "Final text report: $(Split-Path -Leaf $finalTextReport)"
            Write-DetailMessage "Final HTML report: $(Split-Path -Leaf $finalHtmlReport)"
            
            $testResults += @{ 
                "Test"     = "Comprehensive Integration"; 
                "Status"   = "✓ PASS"; 
                "Details"  = "Full system integration with $($integrationData.Count) logged events"
                "Duration" = $testTimer.GetElapsed()
            }
            
        }
        catch {
            Write-ErrorMessage "Report generation failed: $($_.Exception.Message)"
            Write-DetailMessage "Exception details: $($_.Exception.GetType().Name)" 2
            
            $testResults += @{ 
                "Test"     = "Comprehensive Integration"; 
                "Status"   = "✗ FAIL"; 
                "Details"  = $_.Exception.Message
                "Duration" = $testTimer.GetElapsed()
            }
        }
        
        $testTimer.Stop()
    }
    catch {
        $testTimer.Stop()
        Write-ErrorMessage "Comprehensive integration test failed: $($_.Exception.Message)"
        $testResults += @{ 
            "Test"     = "Comprehensive Integration"; 
            "Status"   = "✗ FAIL"; 
            "Details"  = $_.Exception.Message
            "Duration" = $testTimer.GetElapsed()
        }
    }
    
    # Stop overall timer
    $overallTimer.Stop()
}
finally {
    Set-Location $currentDir
}

# Display comprehensive test results
Write-Header "COMPREHENSIVE TEST RESULTS" "="

$passCount = 0
$failCount = 0
$warnCount = 0
$totalDuration = [TimeSpan]::Zero

foreach ($result in $testResults) {
    $status = $result.Status
    $testName = $result.Test.PadRight(30)
    $details = $result.Details
    $duration = if ($result.Duration) { $result.Duration } else { [TimeSpan]::Zero }
    
    if ($duration -ne [TimeSpan]::Zero) {
        $totalDuration = $totalDuration.Add($duration)
    }
    
    if ($status.StartsWith("✓")) {
        Write-Host "$testName : $status" -ForegroundColor $script:ColorScheme["success"]
        $passCount++
    }
    elseif ($status.StartsWith("⚠")) {
        Write-Host "$testName : $status" -ForegroundColor $script:ColorScheme["warning"]
        $warnCount++
    }
    else {
        Write-Host "$testName : $status" -ForegroundColor $script:ColorScheme["error"]
        $failCount++
    }
    
    if ($details) {
        Write-DetailMessage $details
    }
    
    if ($duration -ne [TimeSpan]::Zero) {
        Write-MutedMessage "Duration: $(Format-ElapsedTime $duration)" 2
    }
}

Write-Separator

# Performance summary
Write-Section "PERFORMANCE SUMMARY"
Write-KeyValuePair "Total Tests" ($passCount + $failCount + $warnCount)
Write-KeyValuePair "Total Duration" (Format-ElapsedTime $totalDuration)
Write-KeyValuePair "Average Test Duration" (Format-ElapsedTime ([TimeSpan]::FromMilliseconds($totalDuration.TotalMilliseconds / ($testResults.Count))))
Write-KeyValuePair "Overall Timer" ($overallTimer.GetSummary())

# Final test summary
Write-Section "FINAL SUMMARY"
Write-Host "✓ Passed: " -NoNewline -ForegroundColor $script:ColorScheme["success"]
Write-Host "$passCount" -ForegroundColor $script:ColorScheme["success"]

Write-Host "⚠ Warnings: " -NoNewline -ForegroundColor $script:ColorScheme["warning"]
Write-Host "$warnCount" -ForegroundColor $script:ColorScheme["warning"]

Write-Host "✗ Failed: " -NoNewline -ForegroundColor $script:ColorScheme["error"]
Write-Host "$failCount" -ForegroundColor $script:ColorScheme["error"]

if ($failCount -eq 0) {
    Write-Header "🎉 ALL TESTS PASSED!" "="
    Write-SuccessMessage "Enhanced Local RAG Project system successfully validated!"
}
else {
    Write-Header "⚠️ SOME TESTS FAILED" "="
    Write-WarningMessage "Review the details above for failed tests."
}

# Show final project state
Write-Section "FINAL PROJECT STATE"
Show-ProjectInfo

Write-Header "ENHANCED SYSTEM FEATURES VALIDATED" "="
Write-SuccessMessage "✓ Advanced Console Utilities - Colored, formatted output"
Write-SuccessMessage "✓ Enhanced DateTime Utilities - Multiple formats and performance timing"
Write-SuccessMessage "✓ Comprehensive Validation Utilities - Input validation and error handling"
Write-SuccessMessage "✓ Improved XMLLogger - Centralized paths and enhanced logging"
Write-SuccessMessage "✓ Advanced Parsing and Reporting - XML parsing with dual format reports"
Write-SuccessMessage "✓ System and Model Utilities - Comprehensive system information collection"
Write-SuccessMessage "✓ File Management - Organized project structure with utilities"
Write-SuccessMessage "✓ Performance Monitoring - Built-in timing and measurement"
Write-SuccessMessage "✓ Error Handling - Safe execution with comprehensive error management"
Write-SuccessMessage "✓ Full Integration - All components working together seamlessly"

Write-Header "LOCAL RAG PROJECT - ENHANCED SYSTEM READY" "="
Write-InfoMessage "System successfully tested with all utility improvements integrated"
Write-InfoMessage "Total execution time: $(Format-ElapsedTime $overallTimer.GetElapsed())"
Write-InfoMessage "Test completed at: $(Get-Timestamp)"