# OutputManager.ps1 - Centralized output format management
# Eliminates repetitive format-specific serialization code

# Abstract base formatter class
class BaseFormatter {
    [string]$FormatName
    [hashtable]$Options = @{}
    
    BaseFormatter([string]$formatName) {
        $this.FormatName = $formatName
    }
    
    # Abstract method - must be implemented by derived classes
    [void] Export([array]$data, [string]$outputPath) {
        throw "Export method must be implemented by derived class"
    }
    
    # Virtual method for validation (can be overridden)
    [bool] ValidateData([array]$data) {
        return ($null -ne $data)
    }
    
    # Virtual method for pre-processing (can be overridden) 
    [array] PreProcessData([array]$data) {
        return $data
    }
    
    # Virtual method for post-processing (can be overridden)
    [void] PostProcessFile([string]$outputPath) {
        # Default: do nothing
    }
}

# JSON formatter implementation
class JsonFormatter : BaseFormatter {
    [int]$Depth = 6
    [bool]$Compress = $false
    
    JsonFormatter() : base("json") {
        $this.Options["depth"] = 6
        $this.Options["compress"] = $false
    }
    
    [void] Export([array]$data, [string]$outputPath) {
        if (-not $this.ValidateData($data)) {
            throw "Invalid data for JSON export"
        }
        
        $processedData = $this.PreProcessData($data)
        
        try {
            $jsonParams = @{
                "Depth" = $this.Options["depth"]
            }
            if ($this.Options["compress"]) {
                $jsonParams["Compress"] = $true
            }
            
            $json = $processedData | ConvertTo-Json @jsonParams
            $json | Out-File -FilePath $outputPath -Encoding UTF8
            
            $this.PostProcessFile($outputPath)
            
        } catch {
            throw "JSON export failed: $($_.Exception.Message)"
        }
    }
    
    [array] PreProcessData([array]$data) {
        # Remove any PowerShell-specific metadata that might not serialize well
        return $data | ForEach-Object {
            $item = $_
            $cleaned = [PSCustomObject]@{}
            
            foreach ($prop in $item.PSObject.Properties) {
                if ($prop.Name -notlike "__*") {  # Skip internal metadata
                    $cleaned | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value
                }
            }
            
            return $cleaned
        }
    }
}

# XML formatter implementation
class XmlFormatter : BaseFormatter {
    [string]$RootElementName = "Results"
    [string]$ItemElementName = "Item"
    
    XmlFormatter() : base("xml") {
        $this.Options["rootElementName"] = "Results"
        $this.Options["itemElementName"] = "Item"
    }
    
    [void] Export([array]$data, [string]$outputPath) {
        if (-not $this.ValidateData($data)) {
            throw "Invalid data for XML export"
        }
        
        $processedData = $this.PreProcessData($data)
        
        try {
            # Try to use XMLLogger if available
            if (Get-Command -Name "Write-XmlLog" -ErrorAction SilentlyContinue) {
                Write-XmlLog -Items $processedData -OutFile $outputPath -RootName $this.Options["rootElementName"] -ItemName $this.Options["itemElementName"]
            } else {
                # Fallback to manual XML generation
                $this.ExportManualXml($processedData, $outputPath)
            }
            
            $this.PostProcessFile($outputPath)
            
        } catch {
            throw "XML export failed: $($_.Exception.Message)"
        }
    }
    
    [void] ExportManualXml([array]$data, [string]$outputPath) {
        $xml = New-Object System.Xml.XmlDocument
        
        # Create XML declaration
        $declaration = $xml.CreateXmlDeclaration("1.0", "UTF-8", $null)
        $xml.AppendChild($declaration) | Out-Null
        
        # Create root element
        $rootNode = $xml.CreateElement($this.Options["rootElementName"])
        $xml.AppendChild($rootNode) | Out-Null
        
        foreach ($item in $data) {
            $itemNode = $xml.CreateElement($this.Options["itemElementName"])
            
            foreach ($prop in $item.PSObject.Properties) {
                if ($prop.Name -notlike "__*") {  # Skip internal metadata
                    $propNode = $xml.CreateElement([System.Xml.XmlConvert]::EncodeName($prop.Name))
                    
                    if ($prop.Value -is [System.Array]) {
                        $propNode.InnerText = ($prop.Value -join ",")
                    } else {
                        $propNode.InnerText = ($prop.Value -as [string])
                    }
                    
                    $itemNode.AppendChild($propNode) | Out-Null
                }
            }
            
            $rootNode.AppendChild($itemNode) | Out-Null
        }
        
        $xml.Save($outputPath)
    }
}

# CSV formatter implementation  
class CsvFormatter : BaseFormatter {
    [bool]$IncludeTypeInformation = $false
    [string]$Delimiter = ","
    
    CsvFormatter() : base("csv") {
        $this.Options["includeTypeInformation"] = $false
        $this.Options["delimiter"] = ","
    }
    
    [void] Export([array]$data, [string]$outputPath) {
        if (-not $this.ValidateData($data)) {
            throw "Invalid data for CSV export"
        }
        
        $processedData = $this.PreProcessData($data)
        
        try {
            $csvParams = @{
                "Path" = $outputPath
                "NoTypeInformation" = (-not $this.Options["includeTypeInformation"])
                "Encoding" = "UTF8"
            }
            
            if ($this.Options["delimiter"] -ne ",") {
                $csvParams["Delimiter"] = $this.Options["delimiter"]
            }
            
            $processedData | Export-Csv @csvParams
            
            $this.PostProcessFile($outputPath)
            
        } catch {
            throw "CSV export failed: $($_.Exception.Message)"
        }
    }
    
    [array] PreProcessData([array]$data) {
        # Flatten complex properties for CSV export
        return $data | ForEach-Object {
            $item = $_
            $flattened = [PSCustomObject]@{}
            
            foreach ($prop in $item.PSObject.Properties) {
                if ($prop.Name -notlike "__*") {  # Skip internal metadata
                    if ($prop.Value -is [System.Array]) {
                        # Join arrays with pipe separator for CSV
                        $flattened | Add-Member -MemberType NoteProperty -Name $prop.Name -Value ($prop.Value -join '|')
                    } elseif ($prop.Value -is [hashtable] -or $prop.Value -is [PSCustomObject]) {
                        # Convert complex objects to JSON for CSV
                        try {
                            $jsonValue = $prop.Value | ConvertTo-Json -Compress -Depth 2
                            $flattened | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $jsonValue
                        } catch {
                            $flattened | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value.ToString()
                        }
                    } else {
                        $flattened | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value
                    }
                }
            }
            
            return $flattened
        }
    }
}

# Main OutputManager class
class OutputManager {
    [hashtable]$Formatters = @{}
    [hashtable]$DefaultOptions = @{}
    [bool]$VerboseOutput = $false
    
    OutputManager() {
        $this.RegisterDefaultFormatters()
    }
    
    [void] RegisterDefaultFormatters() {
        $this.Formatters["json"] = [JsonFormatter]::new()
        $this.Formatters["xml"] = [XmlFormatter]::new() 
        $this.Formatters["csv"] = [CsvFormatter]::new()
    }
    
    # Register a custom formatter
    [void] RegisterFormatter([string]$format, [BaseFormatter]$formatter) {
        $this.Formatters[$format.ToLower()] = $formatter
    }
    
    # Set global options for a specific format
    [void] SetFormatOptions([string]$format, [hashtable]$options) {
        $formatKey = $format.ToLower()
        if ($this.Formatters.ContainsKey($formatKey)) {
            $formatter = $this.Formatters[$formatKey]
            foreach ($key in $options.Keys) {
                $formatter.Options[$key] = $options[$key]
            }
        } else {
            throw "Formatter for format '$format' not found"
        }
    }
    
    # Main export method
    [void] ExportData([array]$data, [string]$format, [string]$outputPath) {
        $this.ExportData($data, $format, $outputPath, @{})
    }
    
    # Export with custom options
    [void] ExportData([array]$data, [string]$format, [string]$outputPath, [hashtable]$options) {
        $formatKey = $format.ToLower()
        
        if (-not $this.Formatters.ContainsKey($formatKey)) {
            throw "Unsupported format: $format. Available formats: $($this.Formatters.Keys -join ', ')"
        }
        
        $formatter = $this.Formatters[$formatKey]
        
        # Apply temporary options if provided
        $originalOptions = $formatter.Options.Clone()
        foreach ($key in $options.Keys) {
            $formatter.Options[$key] = $options[$key]
        }
        
        try {
            if ($this.VerboseOutput) {
                $this.WriteVerbose("Exporting $($data.Count) items to $format format")
                $this.WriteVerbose("Output path: $outputPath")
            }
            
            $startTime = Get-Date
            $formatter.Export($data, $outputPath)
            $elapsed = (Get-Date) - $startTime
            
            if ($this.VerboseOutput) {
                $this.WriteVerbose("Export completed in $($elapsed.TotalMilliseconds.ToString('F0'))ms")
                
                if (Test-Path $outputPath) {
                    $fileSize = (Get-Item $outputPath).Length
                    $this.WriteVerbose("Output file size: $($this.FormatFileSize($fileSize))")
                }
            }
            
        } catch {
            throw "Export to $format failed: $($_.Exception.Message)"
        } finally {
            # Restore original options
            $formatter.Options = $originalOptions
        }
    }
    
    # Export to multiple formats
    [hashtable] ExportToMultipleFormats([array]$data, [string[]]$formats, [string]$basePath) {
        $results = @{}
        
        foreach ($format in $formats) {
            $extension = $format.ToLower()
            $outputPath = "$basePath.$extension"
            
            try {
                $this.ExportData($data, $format, $outputPath)
                $results[$format] = @{
                    "status" = "success"
                    "path" = $outputPath
                    "error" = $null
                }
                
                if ($this.VerboseOutput) {
                    $this.WriteVerbose("Successfully exported to $format format")
                }
                
            } catch {
                $results[$format] = @{
                    "status" = "failed"
                    "path" = $outputPath
                    "error" = $_.Exception.Message
                }
                
                if ($this.VerboseOutput) {
                    $this.WriteVerbose("Failed to export to $format format: $($_.Exception.Message)")
                }
            }
        }
        
        return $results
    }
    
    # Get available formats
    [string[]] GetAvailableFormats() {
        return $this.Formatters.Keys | Sort-Object
    }
    
    # Get format capabilities/options
    [hashtable] GetFormatInfo([string]$format) {
        $formatKey = $format.ToLower()
        if ($this.Formatters.ContainsKey($formatKey)) {
            $formatter = $this.Formatters[$formatKey]
            return @{
                "formatName" = $formatter.FormatName
                "typeName" = $formatter.GetType().Name
                "options" = $formatter.Options
            }
        }
        return @{}
    }
    
    # Validate data before export
    [bool] ValidateExportData([array]$data, [string]$format) {
        $formatKey = $format.ToLower()
        if ($this.Formatters.ContainsKey($formatKey)) {
            return $this.Formatters[$formatKey].ValidateData($data)
        }
        return $false
    }
    
    # Helper methods
    [void] WriteVerbose([string]$message) {
        if (Get-Command -Name "Write-DetailMessage" -ErrorAction SilentlyContinue) {
            Write-DetailMessage $message
        } else {
            Write-Host "  $message" -ForegroundColor Gray
        }
    }
    
    [string] FormatFileSize([long]$bytes) {
        if (Get-Command -Name "Format-FileSize" -ErrorAction SilentlyContinue) {
            return Format-FileSize $bytes
        } else {
            # Simple fallback
            if ($bytes -lt 1024) { return "$bytes B" }
            elseif ($bytes -lt 1MB) { return "$([math]::Round($bytes/1KB, 2)) KB" }
            elseif ($bytes -lt 1GB) { return "$([math]::Round($bytes/1MB, 2)) MB" }
            else { return "$([math]::Round($bytes/1GB, 2)) GB" }
        }
    }
    
    # Display export summary
    [void] DisplayExportSummary([hashtable]$exportResults) {
        if (Get-Command -Name "Write-Section" -ErrorAction SilentlyContinue) {
            Write-Section "Export Summary"
        } else {
            Write-Host "`nExport Summary" -ForegroundColor Cyan
        }
        
        foreach ($format in $exportResults.Keys) {
            $result = $exportResults[$format]
            $statusColor = if ($result.status -eq "success") { "Green" } else { "Red" }
            $statusSymbol = if ($result.status -eq "success") { "✓" } else { "✗" }
            
            Write-Host "  $statusSymbol $format`: " -NoNewline
            Write-Host $result.status -ForegroundColor $statusColor
            
            if ($result.status -eq "success" -and (Test-Path $result.path)) {
                $fileSize = $this.FormatFileSize((Get-Item $result.path).Length)
                Write-Host "    Path: $($result.path)" -ForegroundColor Gray
                Write-Host "    Size: $fileSize" -ForegroundColor Gray
            } elseif ($result.error) {
                Write-Host "    Error: $($result.error)" -ForegroundColor Red
            }
        }
    }
}

# Global convenience functions
function New-OutputManager {
    param([switch]$Verbose)
    
    $manager = [OutputManager]::new()
    $manager.VerboseOutput = $Verbose.IsPresent
    return $manager
}

function Export-DataToFormat {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Data,
        [Parameter(Mandatory=$true)]
        [ValidateSet("json", "xml", "csv")]
        [string]$Format,
        [Parameter(Mandatory=$true)]
        [string]$OutputPath,
        [hashtable]$Options = @{},
        [switch]$Verbose
    )
    
    $manager = New-OutputManager -Verbose:$Verbose
    $manager.ExportData($Data, $Format, $OutputPath, $Options)
}

function Export-DataToMultipleFormats {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Data,
        [Parameter(Mandatory=$true)]
        [string[]]$Formats,
        [Parameter(Mandatory=$true)]
        [string]$BasePath,
        [switch]$Verbose,
        [switch]$ShowSummary
    )
    
    $manager = New-OutputManager -Verbose:$Verbose
    $results = $manager.ExportToMultipleFormats($Data, $Formats, $BasePath)
    
    if ($ShowSummary) {
        $manager.DisplayExportSummary($results)
    }
    
    return $results
}

# Export functions for module use
# Export-ModuleMember -Function New-OutputManager, Export-DataToFormat, Export-DataToMultipleFormats