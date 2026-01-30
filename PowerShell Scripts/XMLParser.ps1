# XMLParser.ps1 - Enhanced XML parsing script with utilities integration

# Import required utilities (if not already loaded via module)
if (-not (Get-Command Get-SchemaRegistry -ErrorAction SilentlyContinue)) {
    . "$PSScriptRoot\XMLLogger.ps1"
    . "$PSScriptRoot\Schemas.ps1"
    
    # Import new utilities
    . "$PSScriptRoot\ConsoleUtils.ps1"
    . "$PSScriptRoot\SystemUtils.ps1"
    . "$PSScriptRoot\DateTimeUtils.ps1"
    . "$PSScriptRoot\FileUtils.ps1"
    . "$PSScriptRoot\ValidationUtils.ps1"
}

class XMLParser {
    [object]$SchemaRegistry
    
    XMLParser() {
        $this.SchemaRegistry = Get-SchemaRegistry
    }
    
    # Detect schema from XML document (now using centralized registry with utilities)
    [hashtable] DetectSchema([System.Xml.XmlDocument]$xmlDoc) {
        $rootElement = $xmlDoc.DocumentElement
        $rootName = $rootElement.Name
        
        Write-InfoMessage "Detecting schema for root element: $rootName"
        
        $detectedSchema = $this.SchemaRegistry.DetectSchema($xmlDoc)
        Write-SuccessMessage "Using schema: $($detectedSchema.Name) - $($detectedSchema.Definition['description'])"
        
        # Include the schema name in the definition for the switch statement
        $schemaDefinition = $detectedSchema.Definition.Clone()
        $schemaDefinition["Name"] = $detectedSchema.Name
        
        return $schemaDefinition
    }
    
    # Parse XML with enhanced logging and validation
    [hashtable] ParseXML([string]$xmlFilePath) {
        # Validate input file with new utilities
        if (-not (Test-FileExists -FilePath $xmlFilePath)) {
            Write-ErrorMessage "XML file not found: $xmlFilePath"
            throw [System.IO.FileNotFoundException]::new("File not found: $xmlFilePath")
        }
        
        Write-InfoMessage "Starting XML parsing"
        Write-KeyValuePair "File" $xmlFilePath
        Write-KeyValuePair "File Size" (Format-FileSize (Get-Item $xmlFilePath).Length)
        
        $timer = New-PerformanceTimer -OperationName "XML Parsing"
        
        try {
            # Load XML document
            $xmlDoc = [System.Xml.XmlDocument]::new()
            $xmlDoc.Load($xmlFilePath)
            $timer.AddCheckpoint("XML document loaded")
            
            # Detect and apply schema
            $schema = $this.DetectSchema($xmlDoc)
            $timer.AddCheckpoint("Schema detected")
            
            # Parse based on detected schema
            $result = $this.ParseWithSchema($xmlDoc, $schema)
            $timer.AddCheckpoint("Document parsed")
            
            # Add parsing metadata with utilities
            $result["_metadata"] = @{
                "filePath"        = $xmlFilePath
                "fileSize"        = Format-FileSize (Get-Item $xmlFilePath).Length
                "lastModified"    = Get-RelativeTimeString (Get-Item $xmlFilePath).LastWriteTime
                "parseTime"       = Get-XmlTimestamp
                "parsingDuration" = Format-ElapsedTime $timer.GetElapsed()
                "schemaUsed"      = $schema.Name
            }
            
            Write-SuccessMessage "XML parsing completed successfully"
            Write-KeyValuePair "Parsing Time" (Format-ElapsedTime $timer.GetElapsed())
            Write-KeyValuePair "Records Found" $result.Count
            
            return $result
            
        }
        catch {
            Write-ErrorMessage "XML parsing failed: $($_.Exception.Message)"
            Write-DetailMessage $_.Exception.StackTrace
            throw
        }
    }
    
    # Enhanced parsing with schema-aware processing
    [hashtable] ParseWithSchema([System.Xml.XmlDocument]$xmlDoc, [hashtable]$schema) {
        Write-Section "Schema-based Parsing"
        
        $result = @{}
        $rootElement = $xmlDoc.DocumentElement
        
        # Handle different schema types with enhanced console output
        switch ($schema.Name) {
            "PowerShellLog" { 
                Write-DetailMessage "Processing PowerShell log format"
                $result = $this.ParsePowerShellLog($xmlDoc) 
            }
            "WindowsEventLog" { 
                Write-DetailMessage "Processing Windows Event log format"
                $result = $this.ParseWindowsEventLog($xmlDoc) 
            }
            default { 
                Write-DetailMessage "Using generic XML parsing"
                $result = $this.ParseGenericXML($xmlDoc, $schema) 
            }
        }
        
        Write-DetailMessage "Found $($result.Count) elements"
        return $result
    }
    
    # PowerShell log parsing with utilities
    [hashtable] ParsePowerShellLog([System.Xml.XmlDocument]$xmlDoc) {
        Write-DetailMessage "Parsing PowerShell log entries"
        
        $result = @{}
        $logEntries = $xmlDoc.SelectNodes("//LogEntry")
        
        Write-KeyValuePair "Log Entries" $logEntries.Count 2
        
        foreach ($entry in $logEntries) {
            $timestampAttr = $entry.Attributes["timestamp"]
            $levelAttr = $entry.Attributes["level"]
            $categoryAttr = $entry.Attributes["category"]
            $messageNode = $entry.SelectSingleNode("Message")
            
            $entryData = @{
                "timestamp" = if ($timestampAttr) { $timestampAttr.Value } else { "" }
                "level"     = if ($levelAttr) { $levelAttr.Value } else { "" }
                "category"  = if ($categoryAttr) { $categoryAttr.Value } else { "" }
                "message"   = if ($messageNode) { $messageNode.InnerText } else { "" }
                "data"      = @{}
            }
            
            # Parse data elements
            $dataElements = $entry.SelectNodes("Data/*")
            foreach ($dataElement in $dataElements) {
                $entryData.data[$dataElement.Name] = $dataElement.InnerText
            }
            
            $entryId = "Entry_$(Get-Date $entryData.timestamp -Format 'yyyyMMdd_HHmmss')"
            $result[$entryId] = $entryData
        }
        
        Write-DetailMessage "Processed $($result.Count) log entries" 2
        return $result
    }
    
    # Generic XML parsing with enhanced output
    [hashtable] ParseGenericXML([System.Xml.XmlDocument]$xmlDoc, [hashtable]$schema) {
        Write-DetailMessage "Applying generic parsing strategy"
        
        $result = @{}
        $elements = $xmlDoc.SelectNodes("//*")
        
        Write-KeyValuePair "Total Elements" $elements.Count 2
        
        foreach ($element in $elements) {
            if ($element.HasChildNodes -and $element.FirstChild.NodeType -eq [System.Xml.XmlNodeType]::Text) {
                $key = "$($element.Name)_$(Get-Random -Maximum 1000)"
                $result[$key] = @{
                    "name"       = $element.Name
                    "value"      = $element.InnerText
                    "attributes" = @{}
                }
                
                foreach ($attr in $element.Attributes) {
                    $result[$key].attributes[$attr.Name] = $attr.Value
                }
            }
        }
        
        Write-DetailMessage "Extracted $($result.Count) data elements" 2
        return $result
    }
    
    # Windows Event log parsing (placeholder with utilities)
    [hashtable] ParseWindowsEventLog([System.Xml.XmlDocument]$xmlDoc) {
        Write-DetailMessage "Parsing Windows Event log entries"
        Write-WarningMessage "Windows Event log parsing not yet implemented"
        return @{}
    }
}

# Enhanced convenience function with full utilities integration
function Read-XMLLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [hashtable]$Filter = @{}
    )
    
    Write-Header "XML LOG READER"
    
    # Validate file existence
    if (-not (Test-FileExists -FilePath $FilePath)) {
        Write-ErrorMessage "File not found: $FilePath"
        return $null
    }
    
    Write-Section "File Information"
    $fileInfo = Get-Item $FilePath
    Write-KeyValuePair "File Path" $FilePath
    Write-KeyValuePair "File Size" (Format-FileSize $fileInfo.Length)
    Write-KeyValuePair "Last Modified" (Get-RelativeTimeString $fileInfo.LastWriteTime)
    
    # Parse XML with performance monitoring
    $overallTimer = New-PerformanceTimer -OperationName "XML Log Reading"
    
    try {
        $parser = [XMLParser]::new()
        $data = $parser.ParseXML($FilePath)
        $overallTimer.AddCheckpoint("Parsing completed")
        
        # Apply filters if provided
        if ($Filter.Count -gt 0) {
            Write-Section "Applying Filters"
            $originalCount = $data.Count
            
            foreach ($filterKey in $Filter.Keys) {
                $filterValue = $Filter[$filterKey]
                Write-KeyValuePair "Filter" "$filterKey = $filterValue"
                
                $filteredData = @{}
                foreach ($key in $data.Keys) {
                    $item = $data[$key]
                    if ($item.$filterKey -eq $filterValue) {
                        $filteredData[$key] = $item
                    }
                }
                $data = $filteredData
            }
            
            Write-KeyValuePair "Original Records" $originalCount
            Write-KeyValuePair "Filtered Records" $data.Count
            $overallTimer.AddCheckpoint("Filtering completed")
        }
        
        Write-Section "Results Summary"
        Write-SuccessMessage "XML log reading completed"
        Write-KeyValuePair "Total Processing Time" (Format-ElapsedTime $overallTimer.GetElapsed())
        Write-KeyValuePair "Records Retrieved" $data.Count
        
        # Display performance details
        Write-DetailMessage $overallTimer.GetSummary()
        
        return $data
        
    }
    catch {
        Write-ErrorMessage "Failed to read XML log: $($_.Exception.Message)"
        Write-DetailMessage $_.Exception.StackTrace
        return $null
    }
}