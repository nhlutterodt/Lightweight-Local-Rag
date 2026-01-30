# Debug script to check the structure of converted data

. "$PSScriptRoot\ConsoleUtils.ps1"
. "$PSScriptRoot\XMLLogger.ps1"
. "$PSScriptRoot\XMLParser.ps1"

Write-InfoMessage "Testing data structure conversion..."

# Create a test log using the centralized path method
$logger = [XMLLogger]::NewWithCentralizedPath("debug-test", "TEST")
$logger.LogInfo("SYSTEM", "Test message", @{ "key" = "value" })
$logger.LogInfo("SERVICE", "Another test", @{ "status" = "running" })
$logger.SaveLog()

Write-InfoMessage "Created log file: $($logger.LogFile)"

# Parse it
$parser = [XMLParser]::new()
$data = $parser.ParseXML($logger.LogFile)

Write-InfoMessage "Raw data structure:"
Write-DetailMessage "Data type: $($data.GetType().Name)"
Write-DetailMessage "Keys: $($data.Keys -join ', ')"

# Show the actual structure
Write-InfoMessage "`nActual data entries:"
foreach ($key in $data.Keys) {
    $entry = $data[$key]
    Write-DetailMessage "Key: $key"
    Write-DetailMessage "  Type: $($entry.GetType().Name)"
    Write-DetailMessage "  Properties: $($entry.Keys -join ', ')" 2
    if ($entry.message) {
        Write-DetailMessage "  Message: $($entry.message)" 2
    }
    if ($entry.attributes) {
        Write-DetailMessage "  Attributes: $($entry.attributes.Keys -join ', ')" 2
        Write-DetailMessage "  Category: $($entry.attributes.category)" 2
    }
}

Write-InfoMessage "`nConversion process (fixed)..."

# Convert the hashtable entries to array - PROPER METHOD FOR POWERSHELL LOGS
$entriesArray = @()
foreach ($key in $data.Keys) {
    if ($key -ne "_metadata") {  # Skip metadata
        $entry = $data[$key]
        $convertedEntry = [PSCustomObject]@{
            Message = $entry.message
            Attributes = @{
                "timestamp" = $entry.timestamp
                "level" = $entry.level
                "category" = $entry.category
            }
        }
        
        # Add any additional data properties
        if ($entry.data) {
            foreach ($dataKey in $entry.data.Keys) {
                $convertedEntry.Attributes[$dataKey] = $entry.data[$dataKey]
            }
        }
        
        $entriesArray += $convertedEntry
        
        Write-DetailMessage "Entry - Message: $($convertedEntry.Message)"
        Write-DetailMessage "Entry - Attributes keys: $($convertedEntry.Attributes.Keys -join ', ')"
        Write-DetailMessage "Entry - Category: $($convertedEntry.Attributes['category'])"
    }
}

Write-InfoMessage "`nTesting Where-Object filtering..."
try {
    $systemFiltered = $entriesArray | Where-Object { $_.Attributes["category"] -eq "SYSTEM" }
    Write-SuccessMessage "SYSTEM filtering worked! Found $($systemFiltered.Count) entries"
    
    $serviceFiltered = $entriesArray | Where-Object { $_.Attributes["category"] -eq "SERVICE" }
    Write-SuccessMessage "SERVICE filtering worked! Found $($serviceFiltered.Count) entries"
} catch {
    Write-ErrorMessage "Filtering failed: $($_.Exception.Message)"
    Write-ErrorMessage "Stack trace: $($_.ScriptStackTrace)"
}

# Clean up
Remove-Item $logger.LogFile -Force