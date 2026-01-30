# ErrorManager.ps1 - Centralized error collection and reporting
# Eliminates repetitive error tracking patterns across scripts

class ErrorEntry {
    [string]$Category
    [string]$Path
    [string]$ErrorMessage
    [datetime]$Timestamp
    [string]$Operation
    [hashtable]$Context = @{}
    [string]$Severity = "Error"
    
    ErrorEntry([string]$category, [string]$path, [string]$errorMessage) {
        $this.Category = $category
        $this.Path = $path
        $this.ErrorMessage = $errorMessage
        $this.Timestamp = Get-Date
        $this.Operation = "Unknown"
    }
    
    ErrorEntry([string]$category, [string]$path, [string]$errorMessage, [string]$operation) {
        $this.Category = $category
        $this.Path = $path
        $this.ErrorMessage = $errorMessage
        $this.Operation = $operation
        $this.Timestamp = Get-Date
    }
    
    [string] GetFormattedTimestamp() {
        if (Get-Command -Name "Format-DateTime" -ErrorAction SilentlyContinue) {
            return Format-DateTime $this.Timestamp -Format "display"
        }
        else {
            return $this.Timestamp.ToString("yyyy-MM-dd HH:mm:ss")
        }
    }
    
    [string] ToString() {
        return "[$($this.Category)] $($this.Operation): $($this.ErrorMessage) (Path: $($this.Path))"
    }
}

class ErrorManager {
    [hashtable]$ErrorCategories = @{}
    [int]$TotalErrors = 0
    [int]$TotalWarnings = 0
    [datetime]$InitializationTime
    [hashtable]$Statistics = @{}
    [bool]$VerboseErrorLogging = $false
    [int]$MaxErrorsPerCategory = 1000  # Prevent memory issues with too many errors
    
    # Predefined common error categories
    [string[]]$CommonCategories = @(
        "HashFailures",
        "AclFailures", 
        "EnumerationFailures",
        "ValidationFailures",
        "NetworkFailures",
        "FileSystemFailures",
        "ParsingFailures",
        "GeneralErrors"
    )
    
    ErrorManager() {
        $this.InitializationTime = Get-Date
        $this.InitializeCategories()
        $this.InitializeStatistics()
    }
    
    [void] InitializeCategories() {
        foreach ($category in $this.CommonCategories) {
            $this.ErrorCategories[$category] = @()
        }
    }
    
    [void] InitializeStatistics() {
        $this.Statistics = @{
            "initTime"           = $this.InitializationTime
            "totalOperations"    = 0
            "categoriesUsed"     = 0
            "oldestError"        = $null
            "newestError"        = $null
            "mostCommonCategory" = ""
            "mostCommonError"    = ""
        }
    }
    
    # Add error with minimal parameters
    [void] AddError([string]$category, [string]$path, [string]$errorMessage) {
        $this.AddError($category, $path, $errorMessage, "Unknown", @{})
    }
    
    # Add error with operation context
    [void] AddError([string]$category, [string]$path, [string]$errorMessage, [string]$operation) {
        $this.AddError($category, $path, $errorMessage, $operation, @{})
    }
    
    # Full error addition with context
    [void] AddError([string]$category, [string]$path, [string]$errorMessage, [string]$operation, [hashtable]$context) {
        # Ensure category exists
        if (-not $this.ErrorCategories.ContainsKey($category)) {
            $this.ErrorCategories[$category] = @()
        }
        
        # Check if we're at max capacity for this category
        if ($this.ErrorCategories[$category].Count -ge $this.MaxErrorsPerCategory) {
            # Remove oldest error if at capacity
            $this.ErrorCategories[$category] = $this.ErrorCategories[$category][1..($this.MaxErrorsPerCategory - 1)]
        }
        
        # Create error entry
        $errorEntry = [ErrorEntry]::new($category, $path, $errorMessage, $operation)
        $errorEntry.Context = $context
        $errorEntry.Severity = "Error"
        
        # Add to category
        $this.ErrorCategories[$category] += $errorEntry
        $this.TotalErrors++
        
        # Update statistics
        $this.UpdateStatistics($errorEntry)
        
        # Verbose logging if enabled
        if ($this.VerboseErrorLogging) {
            $this.LogErrorVerbose($errorEntry)
        }
        
        # Console output for immediate feedback
        if (Get-Command -Name "Write-ErrorMessage" -ErrorAction SilentlyContinue) {
            Write-ErrorMessage "[$category] $operation failed: $errorMessage"
        }
        else {
            Write-Host "✗ [$category] $operation failed: $errorMessage" -ForegroundColor Red
        }
    }
    
    # Add warning (non-fatal error)
    [void] AddWarning([string]$category, [string]$path, [string]$warning, [string]$operation, [hashtable]$context = @{}) {
        # Ensure category exists
        if (-not $this.ErrorCategories.ContainsKey($category)) {
            $this.ErrorCategories[$category] = @()
        }
        
        # Create warning entry
        $warningEntry = [ErrorEntry]::new($category, $path, $warning, $operation)
        $warningEntry.Context = $context
        $warningEntry.Severity = "Warning"
        
        # Add to category
        $this.ErrorCategories[$category] += $warningEntry
        $this.TotalWarnings++
        
        # Update statistics
        $this.UpdateStatistics($warningEntry)
        
        # Console output
        if (Get-Command -Name "Write-WarningMessage" -ErrorAction SilentlyContinue) {
            Write-WarningMessage "[$category] $operation warning: $warning"
        }
        else {
            Write-Host "⚠ [$category] $operation warning: $warning" -ForegroundColor Yellow
        }
    }
    
    # Update internal statistics
    [void] UpdateStatistics([ErrorEntry]$entry) {
        $this.Statistics["totalOperations"]++
        
        # Track oldest/newest
        if ($null -eq $this.Statistics["oldestError"] -or $entry.Timestamp -lt $this.Statistics["oldestError"]) {
            $this.Statistics["oldestError"] = $entry.Timestamp
        }
        if ($null -eq $this.Statistics["newestError"] -or $entry.Timestamp -gt $this.Statistics["newestError"]) {
            $this.Statistics["newestError"] = $entry.Timestamp
        }
        
        # Count categories used
        $categoriesUsed = $this.ErrorCategories.Keys | Where-Object { $this.ErrorCategories[$_].Count -gt 0 }
        $this.Statistics["categoriesUsed"] = $categoriesUsed.Count
        
        # Find most common category
        $categoryWithMostErrors = $this.ErrorCategories.Keys | 
        Sort-Object { $this.ErrorCategories[$_].Count } -Descending | 
        Select-Object -First 1
        $this.Statistics["mostCommonCategory"] = $categoryWithMostErrors
    }
    
    # Verbose error logging 
    [void] LogErrorVerbose([ErrorEntry]$entry) {
        if (Get-Command -Name "Write-DetailMessage" -ErrorAction SilentlyContinue) {
            Write-DetailMessage "Error logged: [$($entry.Category)] $($entry.Operation) at $($entry.GetFormattedTimestamp())"
            if ($entry.Context.Count -gt 0) {
                Write-DetailMessage "  Context: $($entry.Context | ConvertTo-Json -Compress)" -IndentLevel 2
            }
        }
    }
    
    # Get errors for a specific category
    [ErrorEntry[]] GetErrorsByCategory([string]$category) {
        if ($this.ErrorCategories.ContainsKey($category)) {
            return $this.ErrorCategories[$category]
        }
        return @()
    }
    
    # Get errors filtered by severity
    [ErrorEntry[]] GetErrorsBySeverity([string]$severity) {
        $filteredErrors = @()
        foreach ($category in $this.ErrorCategories.Keys) {
            $filteredErrors += $this.ErrorCategories[$category] | Where-Object { $_.Severity -eq $severity }
        }
        return $filteredErrors
    }
    
    # Get errors within time range
    [ErrorEntry[]] GetErrorsInTimeRange([datetime]$startTime, [datetime]$endTime) {
        $filteredErrors = @()
        foreach ($category in $this.ErrorCategories.Keys) {
            $filteredErrors += $this.ErrorCategories[$category] | Where-Object { 
                $_.Timestamp -ge $startTime -and $_.Timestamp -le $endTime 
            }
        }
        return $filteredErrors | Sort-Object Timestamp
    }
    
    # Get recent errors (last N minutes)
    [ErrorEntry[]] GetRecentErrors([int]$minutes = 10) {
        $cutoff = (Get-Date).AddMinutes(-$minutes)
        return $this.GetErrorsInTimeRange($cutoff, (Get-Date))
    }
    
    # Check if any errors exist
    [bool] HasErrors() {
        return $this.TotalErrors -gt 0
    }
    
    # Check if specific category has errors
    [bool] HasErrorsInCategory([string]$category) {
        return $this.ErrorCategories.ContainsKey($category) -and $this.ErrorCategories[$category].Count -gt 0
    }
    
    # Clear all errors
    [void] ClearAllErrors() {
        foreach ($category in $this.ErrorCategories.Keys) {
            $this.ErrorCategories[$category] = @()
        }
        $this.TotalErrors = 0
        $this.TotalWarnings = 0
        $this.InitializeStatistics()
    }
    
    # Clear errors for specific category
    [void] ClearCategory([string]$category) {
        if ($this.ErrorCategories.ContainsKey($category)) {
            $removedCount = $this.ErrorCategories[$category].Count
            $this.ErrorCategories[$category] = @()
            $this.TotalErrors -= $removedCount
        }
    }
    
    # Print summary to console
    [void] PrintSummary() {
        if (Get-Command -Name "Write-Section" -ErrorAction SilentlyContinue) {
            Write-Section "Error Summary"
        }
        else {
            Write-Host "`nError Summary" -ForegroundColor Cyan
            Write-Host "-" * 13 -ForegroundColor Cyan
        }
        
        # Total counts
        if (Get-Command -Name "Write-KeyValuePair" -ErrorAction SilentlyContinue) {
            Write-KeyValuePair "Total Errors" $this.TotalErrors
            Write-KeyValuePair "Total Warnings" $this.TotalWarnings
            Write-KeyValuePair "Categories Used" $this.Statistics["categoriesUsed"]
        }
        else {
            Write-Host "  Total Errors: $($this.TotalErrors)" -ForegroundColor Gray
            Write-Host "  Total Warnings: $($this.TotalWarnings)" -ForegroundColor Gray
            Write-Host "  Categories Used: $($this.Statistics["categoriesUsed"])" -ForegroundColor Gray
        }
        
        # Category breakdown
        if ($this.TotalErrors -gt 0 -or $this.TotalWarnings -gt 0) {
            Write-Host "`nCategory Breakdown:" -ForegroundColor Yellow
            
            foreach ($category in $this.ErrorCategories.Keys | Sort-Object) {
                $count = $this.ErrorCategories[$category].Count
                if ($count -gt 0) {
                    $errorCount = ($this.ErrorCategories[$category] | Where-Object { $_.Severity -eq "Error" }).Count
                    $warningCount = ($this.ErrorCategories[$category] | Where-Object { $_.Severity -eq "Warning" }).Count
                    
                    if (Get-Command -Name "Write-KeyValuePair" -ErrorAction SilentlyContinue) {
                        Write-KeyValuePair $category "$errorCount errors, $warningCount warnings"
                    }
                    else {
                        Write-Host "  $category`: $errorCount errors, $warningCount warnings" -ForegroundColor Gray
                    }
                }
            }
        }
        
        # Time range if errors exist
        if ($this.Statistics["oldestError"] -and $this.Statistics["newestError"]) {
            $duration = $this.Statistics["newestError"] - $this.Statistics["oldestError"]
            Write-Host "`nTime Range:" -ForegroundColor Yellow
            
            $oldestFormatted = if (Get-Command -Name "Format-DateTime" -ErrorAction SilentlyContinue) {
                Format-DateTime $this.Statistics["oldestError"]
            }
            else {
                $this.Statistics["oldestError"].ToString("yyyy-MM-dd HH:mm:ss")
            }
            
            $newestFormatted = if (Get-Command -Name "Format-DateTime" -ErrorAction SilentlyContinue) {
                Format-DateTime $this.Statistics["newestError"]
            }
            else {
                $this.Statistics["newestError"].ToString("yyyy-MM-dd HH:mm:ss")
            }
            
            Write-Host "  First Error: $oldestFormatted" -ForegroundColor Gray
            Write-Host "  Last Error: $newestFormatted" -ForegroundColor Gray
            Write-Host "  Duration: $($duration.TotalMinutes.ToString('F1')) minutes" -ForegroundColor Gray
        }
    }
    
    # Print detailed error report
    [void] PrintDetailedReport([int]$maxErrorsPerCategory = 5) {
        $this.PrintSummary()
        
        if ($this.TotalErrors -eq 0 -and $this.TotalWarnings -eq 0) {
            if (Get-Command -Name "Write-SuccessMessage" -ErrorAction SilentlyContinue) {
                Write-SuccessMessage "No errors or warnings to report"
            }
            else {
                Write-Host "✓ No errors or warnings to report" -ForegroundColor Green
            }
            return
        }
        
        Write-Host "`nDetailed Error Report:" -ForegroundColor Magenta
        
        foreach ($category in $this.ErrorCategories.Keys | Sort-Object) {
            $errors = $this.ErrorCategories[$category]
            if ($errors.Count -gt 0) {
                Write-Host "`n[$category] - $($errors.Count) items:" -ForegroundColor Yellow
                
                $displayErrors = $errors | Sort-Object Timestamp -Descending | Select-Object -First $maxErrorsPerCategory
                
                foreach ($errorItem in $displayErrors) {
                    $timeStr = $errorItem.GetFormattedTimestamp()
                    $severityColor = if ($errorItem.Severity -eq "Warning") { "Yellow" } else { "Red" }
                    $severitySymbol = if ($errorItem.Severity -eq "Warning") { "⚠" } else { "✗" }
                    
                    Write-Host "  $severitySymbol $($errorItem.Operation): $($errorItem.ErrorMessage)" -ForegroundColor $severityColor
                    Write-Host "    Path: $($errorItem.Path)" -ForegroundColor DarkGray
                    Write-Host "    Time: $timeStr" -ForegroundColor DarkGray
                    
                    if ($errorItem.Context.Count -gt 0) {
                        Write-Host "    Context: $($errorItem.Context.Keys -join ', ')" -ForegroundColor DarkGray
                    }
                }
                
                if ($errors.Count -gt $maxErrorsPerCategory) {
                    Write-Host "  ... and $($errors.Count - $maxErrorsPerCategory) more" -ForegroundColor DarkGray
                }
            }
        }
    }
    
    # Generate structured error report
    [hashtable] GetErrorReport() {
        $report = @{
            "summary"          = @{
                "totalErrors"            = $this.TotalErrors
                "totalWarnings"          = $this.TotalWarnings
                "categoriesUsed"         = $this.Statistics["categoriesUsed"]
                "reportGeneratedAt"      = (Get-Date).ToString("o")
                "errorCollectionStarted" = $this.InitializationTime.ToString("o")
            }
            "categories"       = @{}
            "statistics"       = $this.Statistics
            "recentErrors"     = @()
            "mostCommonErrors" = @()
        }
        
        # Category details
        foreach ($category in $this.ErrorCategories.Keys) {
            if ($this.ErrorCategories[$category].Count -gt 0) {
                $categoryErrors = $this.ErrorCategories[$category]
                $report["categories"][$category] = @{
                    "count"  = $categoryErrors.Count
                    "errors" = $categoryErrors | ForEach-Object {
                        @{
                            "path"      = $_.Path
                            "error"     = $_.ErrorMessage
                            "operation" = $_.Operation
                            "timestamp" = $_.Timestamp.ToString("o")
                            "severity"  = $_.Severity
                            "context"   = $_.Context
                        }
                    }
                }
            }
        }
        
        # Recent errors (last 10 minutes)
        $recentErrorList = $this.GetRecentErrors(10)
        if ($recentErrorList -and $recentErrorList.Count -gt 0) {
            $report["recentErrors"] = @($recentErrorList | ForEach-Object {
                    @{
                        "category"  = $_.Category
                        "path"      = $_.Path
                        "error"     = $_.ErrorMessage
                        "operation" = $_.Operation
                        "timestamp" = $_.Timestamp.ToString("o")
                        "severity"  = $_.Severity
                    }
                })
        }
        else {
            $report["recentErrors"] = @()
        }
        
        return $report
    }
    
    # Export errors to file
    [void] ExportToFile([string]$outputPath, [string]$format = "json") {
        $report = $this.GetErrorReport()
        
        try {
            switch ($format.ToLower()) {
                "json" {
                    $report | ConvertTo-Json -Depth 6 | Out-File -FilePath $outputPath -Encoding UTF8
                }
                "csv" {
                    # Flatten for CSV
                    $flattenedErrors = @()
                    foreach ($category in $report["categories"].Keys) {
                        foreach ($errorItem in $report["categories"][$category]["errors"]) {
                            $flattenedErrors += [PSCustomObject]@{
                                Category  = $category
                                Path      = $errorItem["path"]
                                Error     = $errorItem["error"]
                                Operation = $errorItem["operation"]
                                Timestamp = $errorItem["timestamp"]
                                Severity  = $errorItem["severity"]
                            }
                        }
                    }
                    $flattenedErrors | Export-Csv -Path $outputPath -NoTypeInformation -Encoding UTF8
                }
                "xml" {
                    # Simple XML export
                    $xmlContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<ErrorReport generatedAt="$((Get-Date).ToString("o"))">
    <Summary>
        <TotalErrors>$($report["summary"]["totalErrors"])</TotalErrors>
        <TotalWarnings>$($report["summary"]["totalWarnings"])</TotalWarnings>
        <CategoriesUsed>$($report["summary"]["categoriesUsed"])</CategoriesUsed>
    </Summary>
    <Errors>
"@
                    foreach ($category in $report["categories"].Keys) {
                        foreach ($errorItem in $report["categories"][$category]["errors"]) {
                            $xmlContent += @"
        <Error category="$category" severity="$($errorItem["severity"])" timestamp="$($errorItem["timestamp"])">
            <Path>$([System.Security.SecurityElement]::Escape($errorItem["path"]))</Path>
            <Operation>$([System.Security.SecurityElement]::Escape($errorItem["operation"]))</Operation>
            <Message>$([System.Security.SecurityElement]::Escape($errorItem["error"]))</Message>
        </Error>
"@
                        }
                    }
                    $xmlContent += @"
    </Errors>
</ErrorReport>
"@
                    $xmlContent | Out-File -FilePath $outputPath -Encoding UTF8
                }
                default {
                    throw "Unsupported format: $format. Use json, csv, or xml."
                }
            }
            
            if (Get-Command -Name "Write-SuccessMessage" -ErrorAction SilentlyContinue) {
                Write-SuccessMessage "Error report exported to: $outputPath"
            }
            else {
                Write-Host "✓ Error report exported to: $outputPath" -ForegroundColor Green
            }
            
        }
        catch {
            if (Get-Command -Name "Write-ErrorMessage" -ErrorAction SilentlyContinue) {
                Write-ErrorMessage "Failed to export error report: $($_.Exception.Message)"
            }
            else {
                Write-Host "✗ Failed to export error report: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

# Global convenience functions
function New-ErrorManager {
    param([switch]$VerboseLogging)
    
    $manager = [ErrorManager]::new()
    $manager.VerboseErrorLogging = $VerboseLogging.IsPresent
    return $manager
}

# Simplified error tracking functions
function Add-ErrorToManager {
    param(
        [Parameter(Mandatory = $true)]
        [ErrorManager]$ErrorManager,
        [Parameter(Mandatory = $true)]
        [string]$Category,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$ErrorMessage,
        [string]$Operation = "Unknown",
        [hashtable]$Context = @{}
    )
    
    $ErrorManager.AddError($Category, $Path, $ErrorMessage, $Operation, $Context)
}

function Add-WarningToManager {
    param(
        [Parameter(Mandatory = $true)]
        [ErrorManager]$ErrorManager,
        [Parameter(Mandatory = $true)]
        [string]$Category,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Warning,
        [string]$Operation = "Unknown",
        [hashtable]$Context = @{}
    )
    
    $ErrorManager.AddWarning($Category, $Path, $Warning, $Operation, $Context)
}

# Export functions for module use
# Export-ModuleMember -Function New-ErrorManager, Add-ErrorToManager, Add-WarningToManager