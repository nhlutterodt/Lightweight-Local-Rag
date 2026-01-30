# ReportUtils.ps1 - Utilities for generating reports and summaries

if (-not (Get-Command Get-SchemaRegistry -ErrorAction SilentlyContinue)) {
    . "$PSScriptRoot\Schemas.ps1"
    . "$PSScriptRoot\PathUtils.ps1"
}

class ReportGenerator {
    [hashtable]$ReportTemplates = @{}
    [string]$DefaultOutputPath = ""
    
    ReportGenerator() {
        $this.InitializeTemplates()
        # Use factory function for path manager
        $this.DefaultOutputPath = (Get-PathManager).ReportsFolder
    }
    
    [void] InitializeTemplates() {
        # Model summary template
        $this.ReportTemplates["ModelSummary"] = @{
            "title"    = "AI Model Summary Report"
            "sections" = @("SystemInfo", "ModelList", "ModelFamilies", "Usage")
        }
        
        # System status template
        $this.ReportTemplates["SystemStatus"] = @{
            "title"    = "System Status Report"
            "sections" = @("Overview", "Services", "Errors", "Performance")
        }
        
        # Log analysis template
        $this.ReportTemplates["LogAnalysis"] = @{
            "title"    = "Log Analysis Report"
            "sections" = @("Summary", "ErrorAnalysis", "Timeline", "Recommendations")
        }
    }
    
    [string] GenerateModelReport([PSCustomObject[]]$logEntries, [string]$outputPath = "") {
        if ($outputPath -eq "") {
            $outputPath = New-ContextualReportPath -reportType "model" -context "analysis" -extension "txt"
        }
        
        $report = @"
=== AI MODEL SUMMARY REPORT ===
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

"@
        
        # Extract session information
        $sessionInfo = $logEntries | Where-Object { $_.SessionInfo.Count -gt 0 } | Select-Object -First 1
        if ($sessionInfo) {
            $report += "SESSION INFORMATION:`n"
            foreach ($key in $sessionInfo.SessionInfo.Keys) {
                $report += "  $key`: $($sessionInfo.SessionInfo[$key])`n"
            }
            $report += "`n"
        }
        
        # System status
        $installationEntries = $logEntries | Where-Object { $_.Attributes["category"] -eq "INSTALLATION" }
        $serviceEntries = $logEntries | Where-Object { $_.Attributes["category"] -eq "SERVICE" }
        
        $report += "SYSTEM STATUS:`n"
        if ($installationEntries -and $installationEntries.Count -gt 0) {
            $lastInstallation = $installationEntries | Sort-Object { $_.Attributes["timestamp"] } | Select-Object -Last 1
            $report += "  Installation Status: $($lastInstallation.Attributes['level'])`n"
            $report += "  Message: $($lastInstallation.Message)`n"
        }
        
        if ($serviceEntries -and $serviceEntries.Count -gt 0) {
            $lastService = $serviceEntries | Sort-Object { $_.Attributes["timestamp"] } | Select-Object -Last 1
            $report += "  Service Status: $($lastService.Attributes['level'])`n"
            $report += "  Message: $($lastService.Message)`n"
        }
        
        # Model analysis
        $modelEntries = $logEntries | Where-Object { $_.Attributes["category"] -eq "MODEL" }
        $totalSizeInGB = 0
        
        $report += "`nMODEL ANALYSIS:`n"
        $report += "  Total Models Found: $($modelEntries.Count)`n"
        
        if ($modelEntries.Count -gt 0) {
            # Group by model family
            $modelsByFamily = @{}
            foreach ($entry in $modelEntries) {
                $family = $entry.Data["family"]
                if (-not $family) { $family = "Unknown" }
                
                if (-not $modelsByFamily.ContainsKey($family)) {
                    $modelsByFamily[$family] = @()
                }
                $modelsByFamily[$family] += $entry
            }
            
            $report += "`n  Models by Family:`n"
            foreach ($family in $modelsByFamily.Keys | Sort-Object) {
                $familyModels = $modelsByFamily[$family]
                $report += "    $family`: $($familyModels.Count) models`n"
                
                foreach ($model in $familyModels) {
                    $name = $model.Data["name"]
                    $size = $model.Data["size"]
                    $report += "      - $name ($size)`n"
                }
            }
            
            # Storage analysis
            $report += "`n  Storage Information:`n"
            $totalSizeInGB = 0
            $sizeByUnit = @{}
            
            foreach ($entry in $modelEntries) {
                $sizeStr = $entry.Data["size"]
                if ($sizeStr -and $sizeStr -ne "Unknown" -and $sizeStr -ne "") {
                    # Parse size (e.g., "4.7 GB" -> 4.7, "274 MB" -> 0.268)
                    if ($sizeStr -match "([0-9.]+)\s*(GB|MB|KB)") {
                        $value = [float]$matches[1]
                        $unit = $matches[2]
                        
                        # Track by unit for display
                        if (-not $sizeByUnit.ContainsKey($unit)) {
                            $sizeByUnit[$unit] = 0
                        }
                        $sizeByUnit[$unit] += $value
                        
                        # Convert to GB for total
                        $sizeInGB = switch ($unit) {
                            "GB" { $value }
                            "MB" { $value / 1024 }
                            "KB" { $value / (1024 * 1024) }
                            default { 0 }
                        }
                        $totalSizeInGB += $sizeInGB
                    }
                }
            }
            
            $report += "    Total Storage Used: $([math]::Round($totalSizeInGB, 2)) GB`n"
            
            foreach ($unit in ($sizeByUnit.Keys | Sort-Object)) {
                $report += "    Total in $unit`: $([math]::Round($sizeByUnit[$unit], 2)) $unit`n"
            }
        }
        
        # Error analysis
        $errorEntries = $logEntries | Where-Object { $_.Attributes["level"] -eq "ERROR" }
        $warningEntries = $logEntries | Where-Object { $_.Attributes["level"] -eq "WARNING" }
        
        $report += "`nISSUE ANALYSIS:`n"
        $errorCount = if ($errorEntries) { $errorEntries.Count } else { 0 }
        $warningCount = if ($warningEntries) { $warningEntries.Count } else { 0 }
        
        $report += "  Errors: $errorCount`n"
        $report += "  Warnings: $warningCount`n"
        
        if ($errorEntries -and $errorEntries.Count -gt 0) {
            $report += "`n  Recent Errors:`n"
            foreach ($errorEntry in ($errorEntries | Select-Object -Last 3)) {
                $report += "    - $($errorEntry.Message)`n"
                if ($errorEntry.Data["suggestion"]) {
                    $report += "      Suggestion: $($errorEntry.Data['suggestion'])`n"
                }
            }
        }
        
        if ($warningEntries -and $warningEntries.Count -gt 0) {
            $report += "`n  Recent Warnings:`n"
            foreach ($warning in ($warningEntries | Select-Object -Last 3)) {
                $report += "    - $($warning.Message)`n"
                if ($warning.Data["suggestion"]) {
                    $report += "      Suggestion: $($warning.Data['suggestion'])`n"
                }
            }
        }
        
        # Recommendations
        $report += "`nRECOMMENDATIONS:`n"
        
        if ($errorCount -gt 0) {
            $report += "  - Address errors listed above to ensure proper functionality`n"
        }
        
        if ($modelEntries.Count -eq 0 -and $serviceEntries -and ($serviceEntries | Where-Object { $_.Attributes["level"] -eq "SUCCESS" })) {
            $report += "  - Install AI models using 'ollama pull <model-name>' to start using the system`n"
        }
        
        if ($totalSizeInGB -gt 50) {
            $report += "  - Consider managing model storage (currently using $([math]::Round($totalSizeInGB, 1)) GB)`n"
        }
        
        $report += "`n=== END OF REPORT ==="
        
        $report | Out-File -FilePath $outputPath -Encoding UTF8
        return $outputPath
    }
    
    [string] GenerateComparisonReport([PSCustomObject[]]$beforeEntries, [PSCustomObject[]]$afterEntries, [string]$outputPath = "") {
        if ($outputPath -eq "") {
            $outputPath = New-ContextualReportPath -reportType "comparison" -context "models" -extension "txt"
        }
        
        $beforeModels = $beforeEntries | Where-Object { $_.Attributes["category"] -eq "MODEL" }
        $afterModels = $afterEntries | Where-Object { $_.Attributes["category"] -eq "MODEL" }
        
        $report = @"
=== MODEL COMPARISON REPORT ===
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

BEFORE: $($beforeModels.Count) models
AFTER:  $($afterModels.Count) models

"@
        
        # Find new models
        $beforeModelNames = $beforeModels | ForEach-Object { $_.Data["name"] }
        $afterModelNames = $afterModels | ForEach-Object { $_.Data["name"] }
        
        $newModels = $afterModelNames | Where-Object { $_ -notin $beforeModelNames }
        $removedModels = $beforeModelNames | Where-Object { $_ -notin $afterModelNames }
        
        if ($newModels) {
            $report += "NEW MODELS:`n"
            foreach ($model in $newModels) {
                $modelEntry = $afterModels | Where-Object { $_.Data["name"] -eq $model }
                $report += "  + $model ($($modelEntry.Data['size']))`n"
            }
            $report += "`n"
        }
        
        if ($removedModels) {
            $report += "REMOVED MODELS:`n"
            foreach ($model in $removedModels) {
                $modelEntry = $beforeModels | Where-Object { $_.Data["name"] -eq $model }
                $report += "  - $model ($($modelEntry.Data['size']))`n"
            }
            $report += "`n"
        }
        
        if (-not $newModels -and -not $removedModels) {
            $report += "NO CHANGES DETECTED`n`n"
        }
        
        $report += "=== END OF COMPARISON ==="
        
        $report | Out-File -FilePath $outputPath -Encoding UTF8
        return $outputPath
    }
    
    [void] GenerateHTMLReport([PSCustomObject[]]$logEntries, [string]$outputPath) {
        $html = @"
<!DOCTYPE html>
<html>
<head>
    <title>AI Model Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 10px; border-radius: 5px; }
        .section { margin: 20px 0; }
        .model { background-color: #f9f9f9; padding: 8px; margin: 5px 0; border-left: 3px solid #007acc; }
        .error { border-left-color: #ff4444; }
        .warning { border-left-color: #ffaa00; }
        .success { border-left-color: #00aa44; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AI Model Report</h1>
        <p>Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</p>
    </div>
"@
        
        # Add model table
        $modelEntries = $logEntries | Where-Object { $_.Attributes["category"] -eq "MODEL" }
        if ($modelEntries) {
            $html += @"
    <div class="section">
        <h2>Installed Models</h2>
        <table>
            <tr><th>Name</th><th>Family</th><th>Size</th><th>Modified</th></tr>
"@
            
            foreach ($model in $modelEntries) {
                $name = if ($model.Data['name']) { $model.Data['name'] } else { "Unknown" }
                $family = if ($model.Data['family']) { $model.Data['family'] } else { "Unknown" }
                $size = if ($model.Data['size']) { $model.Data['size'] } else { "Unknown" }
                $modified = if ($model.Data['modified']) { $model.Data['modified'] } else { "Unknown" }
                
                $html += "            <tr><td>$name</td><td>$family</td><td>$size</td><td>$modified</td></tr>`n"
            }
            
            $html += "        </table>`n    </div>`n"
        }
        
        # Add log entries
        $html += @"
    <div class="section">
        <h2>Log Entries</h2>
"@
        
        foreach ($entry in $logEntries) {
            $class = switch ($entry.Attributes["level"]) {
                "ERROR" { "error" }
                "WARNING" { "warning" }
                "SUCCESS" { "success" }
                default { "" }
            }
            
            $html += "        <div class='model $class'>`n"
            $html += "            <strong>$($entry.Attributes['level']) - $($entry.Attributes['category'])</strong><br>`n"
            $html += "            $($entry.Message)<br>`n"
            $html += "            <small>$($entry.Attributes['timestamp'])</small>`n"
            $html += "        </div>`n"
        }
        
        $html += @"
    </div>
</body>
</html>
"@
        
        $html | Out-File -FilePath $outputPath -Encoding UTF8
    }
}

# Utility functions
function New-ModelReport {
    param(
        [PSCustomObject[]]$LogEntries,
        [string]$OutputPath = "",
        [string]$Format = "text"
    )
    
    $generator = [ReportGenerator]::new()
    
    switch ($Format.ToLower()) {
        "text" { return $generator.GenerateModelReport($LogEntries, $OutputPath) }
        "html" { 
            if ($OutputPath -eq "") {
                $contextualName = $Global:PathManager.GenerateContextualReportName("model", "analysis", "html")
                $OutputPath = Get-HtmlPath $contextualName
            }
            $generator.GenerateHTMLReport($LogEntries, $OutputPath)
            return $OutputPath
        }
        default { throw "Unsupported format: $Format" }
    }
}

function Compare-ModelStates {
    param(
        [PSCustomObject[]]$BeforeEntries,
        [PSCustomObject[]]$AfterEntries,
        [string]$OutputPath = ""
    )
    
    $generator = [ReportGenerator]::new()
    return $generator.GenerateComparisonReport($BeforeEntries, $AfterEntries, $OutputPath)
}

# Enhanced function for Reveal-FolderContents.ps1 integration
function Publish-Report {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        
        [string]$Schema = "file-item-v1",
        
        [string]$ScanRoot = "",
        
        [string]$TargetFormat = "html"
    )
    
    try {
        Write-InfoMessage "Publishing report from: $Source"
        
        # Determine source format from extension
        $ext = [System.IO.Path]::GetExtension($Source).ToLower()
        $sourceFormat = switch ($ext) {
            ".json" { "json" }
            ".xml" { "xml" }
            ".csv" { "csv" }
            default { "unknown" }
        }
        
        Write-DetailMessage "Source format: $sourceFormat, Target format: $TargetFormat"
        
        # Load data based on source format
        $data = $null
        switch ($sourceFormat) {
            "json" {
                $data = Get-Content -Path $Source -Raw | ConvertFrom-Json
            }
            "xml" {
                $xmlData = [xml](Get-Content -Path $Source -Raw)
                $data = @()  # Force array initialization
                foreach ($item in $xmlData.RevealResults.Item) {
                    $obj = [PSCustomObject]@{}
                    foreach ($prop in $item.ChildNodes) {
                        if ($prop.NodeType -eq "Element") {
                            if ($prop.HasChildNodes -and $prop.FirstChild.NodeType -eq "Element") {
                                # Handle nested elements (like hashtables)
                                $hashTable = @{}
                                foreach ($childNode in $prop.ChildNodes) {
                                    if ($childNode.NodeType -eq "Element") {
                                        $hashTable[$childNode.Name] = $childNode.InnerText
                                    }
                                }
                                $obj | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $hashTable
                            }
                            else {
                                # Handle simple properties
                                $value = $prop.InnerText
                                # Convert numeric strings back to numbers where appropriate
                                if ($prop.Name -eq "SizeBytes" -and $value -match '^\d+$') {
                                    $value = [long]$value
                                }
                                $obj | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $value
                            }
                        }
                    }
                    $data += $obj
                }
                # Ensure we have an array type even for single items
                if ($data.Count -eq 1) {
                    $data = @($data)
                }
            }
            "csv" {
                $data = Import-Csv -Path $Source
            }
        }
        
        if ($data -and (($data -is [array] -and $data.Count -gt 0) -or ($data -is [object] -and $null -ne $data))) {
            # Handle both array and single object cases
            $itemCount = if ($data -is [array]) { $data.Count } else { 1 }
            
            # Generate summary statistics
            $stats = @{
                "TotalItems"  = $itemCount
                "Files"       = if ($data -is [array]) { 
                    ($data | Where-Object { $_.ItemType -eq "File" }).Count 
                }
                else { 
                    if ($data.ItemType -eq "File") { 1 } else { 0 }
                }
                "Directories" = if ($data -is [array]) { 
                    ($data | Where-Object { $_.ItemType -eq "Directory" }).Count 
                }
                else { 
                    if ($data.ItemType -eq "Directory") { 1 } else { 0 }
                }
                "TotalSize"   = if ($data -is [array]) { 
                    ($data | Where-Object { $_.ItemType -eq "File" } | Measure-Object -Property SizeBytes -Sum).Sum 
                }
                else { 
                    if ($data.ItemType -eq "File" -and $data.SizeBytes) { $data.SizeBytes } else { 0 }
                }
                "ScanRoot"    = $ScanRoot
                "Schema"      = $Schema
                "GeneratedAt" = Get-XmlTimestamp
            }
            
            # Create HTML summary if requested
            if ($TargetFormat -eq "html") {
                $htmlPath = $Source -replace '\.[^.]+$', '_summary.html'
                
                $htmlContent = @"
<!DOCTYPE html>
<html>
<head>
    <title>Folder Contents Summary</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .stat-item { background: white; padding: 10px; border-radius: 3px; border-left: 3px solid #007acc; }
        .stat-value { font-size: 1.5em; font-weight: bold; color: #007acc; }
        .stat-label { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>Folder Contents Summary</h1>
    <div class="summary">
        <h2>Scan Statistics</h2>
        <div class="stats">
            <div class="stat-item">
                <div class="stat-value">$($stats.TotalItems)</div>
                <div class="stat-label">Total Items</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">$($stats.Files)</div>
                <div class="stat-label">Files</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">$($stats.Directories)</div>
                <div class="stat-label">Directories</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">$(Format-FileSize $stats.TotalSize)</div>
                <div class="stat-label">Total Size</div>
            </div>
        </div>
        <p><strong>Scan Root:</strong> $($stats.ScanRoot)</p>
        <p><strong>Schema:</strong> $($stats.Schema)</p>
        <p><strong>Generated:</strong> $($stats.GeneratedAt)</p>
        <p><strong>Source File:</strong> <a href="file:///$($Source.Replace('\', '/'))">$(Split-Path -Leaf $Source)</a></p>
    </div>
</body>
</html>
"@
                
                $htmlContent | Out-File -FilePath $htmlPath -Encoding UTF8
                Write-SuccessMessage "HTML summary created: $(Split-Path -Leaf $htmlPath)"
                
                return $htmlPath
            }
            
            Write-SuccessMessage "Report published successfully"
            Write-KeyValuePair "Items processed" $stats.TotalItems
            Write-KeyValuePair "Files" $stats.Files
            Write-KeyValuePair "Directories" $stats.Directories
            Write-KeyValuePair "Total size" (Format-FileSize $stats.TotalSize)
            
            return $Source
            
        }
        else {
            Write-WarningMessage "No data found in source file"
            return $null
        }
        
    }
    catch {
        Write-ErrorMessage "Failed to publish report: $($_.Exception.Message)"
        throw
    }
}

# Export functions for use in other scripts
# Export-ModuleMember -Function New-ModelReport, Compare-ModelStates, Publish-Report