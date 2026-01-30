# Debug-Parser.ps1 - Debug the XML parser output structure

# Import utilities
. "$PSScriptRoot\XMLLogger.ps1"
. "$PSScriptRoot\XMLParser.ps1"
. "$PSScriptRoot\ConsoleUtils.ps1"

Write-Header "XML PARSER DEBUG" "="

# Create a test log
$testLogger = [XMLLogger]::NewWithCentralizedPath("debug-test", "DebugTest")
$testLogger.LogInfo("DEBUG", "Test message 1", @{"data1" = "value1"})
$testLogger.LogSuccess("DEBUG", "Test message 2", @{"data2" = "value2"})
$testLogger.LogWarning("DEBUG", "Test message 3", @{"data3" = "value3"})
$testLogger.SaveLog()

Write-InfoMessage "Test log created: $($testLogger.LogFile)"

# Parse it
$parser = [XMLParser]::new()
$result = $parser.ParseXML($testLogger.LogFile)

Write-InfoMessage "Parser result type: $($result.GetType().Name)"
Write-InfoMessage "Parser result count: $($result.Count)"

Write-Section "Result Structure"
if ($result -is [hashtable]) {
    Write-InfoMessage "Result is a hashtable"
    Write-KeyValuePair "Keys Count" $result.Keys.Count
    
    foreach ($key in $result.Keys | Select-Object -First 3) {
        Write-DetailMessage "Key: $key"
        $item = $result[$key]
        Write-DetailMessage "  Type: $($item.GetType().Name)" 2
        
        if ($item -is [PSCustomObject]) {
            Write-DetailMessage "  Properties:" 2
            $item.PSObject.Properties | ForEach-Object {
                Write-DetailMessage "    $($_.Name): $($_.Value)" 3
            }
        } elseif ($item -is [hashtable]) {
            Write-DetailMessage "  Hashtable Keys:" 2
            foreach ($itemKey in $item.Keys) {
                Write-DetailMessage "    $itemKey`: $($item[$itemKey])" 3
            }
        }
    }
} else {
    Write-InfoMessage "Result is: $($result.GetType().Name)"
}

Write-Section "Conversion Test"
try {
    # Try to convert to array
    $logEntriesArray = @()
    if ($result -is [hashtable]) {
        foreach ($key in $result.Keys) {
            $logEntriesArray += $result[$key]
        }
        
        Write-SuccessMessage "Successfully converted to array"
        Write-KeyValuePair "Array Length" $logEntriesArray.Length
        Write-KeyValuePair "First Item Type" $logEntriesArray[0].GetType().Name
        
        # Show first item structure
        if ($logEntriesArray.Length -gt 0) {
            Write-DetailMessage "First item:"
            $firstItem = $logEntriesArray[0]
            if ($firstItem -is [PSCustomObject]) {
                $firstItem.PSObject.Properties | ForEach-Object {
                    Write-DetailMessage "  $($_.Name): $($_.Value)" 2
                }
            } elseif ($firstItem -is [hashtable]) {
                foreach ($key in $firstItem.Keys) {
                    Write-DetailMessage "  $key`: $($firstItem[$key])" 2
                }
            }
        }
    }
} catch {
    Write-ErrorMessage "Conversion failed: $($_.Exception.Message)"
}