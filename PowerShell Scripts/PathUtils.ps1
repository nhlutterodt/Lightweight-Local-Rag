# PathUtils.ps1 - Centralized path management for the Local RAG Project

class PathManager {
    [string]$ProjectRoot
    [string]$LogsFolder
    [string]$ReportsFolder
    [string]$ScriptsFolder
    [string]$HtmlPagesFolder
    
    PathManager() {
        # Determine project root from script location
        $this.ProjectRoot = Split-Path $PSScriptRoot -Parent
        $this.LogsFolder = Join-Path $this.ProjectRoot "Logs"
        $this.ReportsFolder = Join-Path $this.LogsFolder "Reports"
        $this.ScriptsFolder = Join-Path $this.ProjectRoot "PowerShell Scripts"
        $this.HtmlPagesFolder = Join-Path $this.ProjectRoot "html_pages"
        
        # Ensure directories exist
        $this.EnsureDirectoriesExist()
    }
    
    [void] EnsureDirectoriesExist() {
        $directories = @($this.LogsFolder, $this.ReportsFolder, $this.HtmlPagesFolder)
        
        foreach ($dir in $directories) {
            if (-not (Test-Path $dir)) {
                New-Item -Path $dir -ItemType Directory -Force | Out-Null
                Write-Host "Created directory: $dir" -ForegroundColor Green
            }
        }
    }
    
    [string] GetLogPath([string]$logFileName) {
        if ([string]::IsNullOrWhiteSpace($logFileName)) {
            return $this.LogsFolder
        }
        if (-not $logFileName.EndsWith(".xml")) {
            $logFileName += ".xml"
        }
        return Join-Path $this.LogsFolder $logFileName
    }
    
    [string] GetReportPath([string]$reportFileName) {
        if ([string]::IsNullOrWhiteSpace($reportFileName)) {
            return $this.ReportsFolder
        }
        return Join-Path $this.ReportsFolder $reportFileName
    }
    
    [string] GetHtmlPath([string]$htmlFileName) {
        if ([string]::IsNullOrWhiteSpace($htmlFileName)) {
            return $this.HtmlPagesFolder
        }
        if (-not $htmlFileName.EndsWith(".html")) {
            $htmlFileName += ".html"
        }
        return Join-Path $this.HtmlPagesFolder $htmlFileName
    }
    
    [string] GetScriptPath([string]$scriptFileName) {
        if (-not $scriptFileName.EndsWith(".ps1")) {
            $scriptFileName += ".ps1"
        }
        return Join-Path $this.ScriptsFolder $scriptFileName
    }
    
    [string] GenerateTimestampedLogName([string]$baseName = "log") {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        return "$baseName-$timestamp.xml"
    }
    
    # Enhanced log naming with context
    [string] GenerateContextualLogName([string]$operation, [string]$context = "", [string]$component = "") {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $parts = @($operation.ToLower())
        
        if (![string]::IsNullOrWhiteSpace($context)) {
            $parts += $context.ToLower()
        }
        
        if (![string]::IsNullOrWhiteSpace($component)) {
            $parts += $component.ToLower()
        }
        
        $parts += $timestamp
        return ($parts -join "-") + ".xml"
    }
    
    # Enhanced report naming with context
    [string] GenerateContextualReportName([string]$reportType, [string]$context = "", [string]$extension = "txt") {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $parts = @($reportType.ToLower())
        
        if (![string]::IsNullOrWhiteSpace($context)) {
            $parts += $context.ToLower()
        }
        
        $parts += "report", $timestamp
        return ($parts -join "-") + ".$extension"
    }
    
    [string] GenerateTimestampedReportName([string]$baseName = "report", [string]$extension = "txt") {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        return "$baseName-$timestamp.$extension"
    }
    
    [void] CleanOldLogs([int]$daysToKeep = 30) {
        $cutoffDate = (Get-Date).AddDays(-$daysToKeep)
        $oldLogs = Get-ChildItem -Path $this.LogsFolder -Filter "*.xml" | 
        Where-Object { $_.CreationTime -lt $cutoffDate }
        
        if ($oldLogs.Count -gt 0) {
            Write-Host "Cleaning up $($oldLogs.Count) old log files (older than $daysToKeep days)" -ForegroundColor Yellow
            $oldLogs | Remove-Item -Force
        }
    }
    
    [void] CleanOldReports([int]$daysToKeep = 30) {
        $cutoffDate = (Get-Date).AddDays(-$daysToKeep)
        $oldReports = Get-ChildItem -Path $this.ReportsFolder | 
        Where-Object { $_.CreationTime -lt $cutoffDate }
        
        if ($oldReports.Count -gt 0) {
            Write-Host "Cleaning up $($oldReports.Count) old report files (older than $daysToKeep days)" -ForegroundColor Yellow
            $oldReports | Remove-Item -Force
        }
    }
    
    [hashtable] GetProjectInfo() {
        return @{
            "projectRoot"     = $this.ProjectRoot
            "logsFolder"      = $this.LogsFolder
            "reportsFolder"   = $this.ReportsFolder
            "scriptsFolder"   = $this.ScriptsFolder
            "htmlPagesFolder" = $this.HtmlPagesFolder
            "logCount"        = (Get-ChildItem -Path $this.LogsFolder -Filter "*.xml" -ErrorAction SilentlyContinue).Count
            "reportCount"     = (Get-ChildItem -Path $this.ReportsFolder -ErrorAction SilentlyContinue).Count
        }
    }
    
    [void] PrintProjectInfo() {
        $info = $this.GetProjectInfo()
        Write-Host "=== PROJECT STRUCTURE ===" -ForegroundColor Magenta
        Write-Host "Project Root: $($info.projectRoot)" -ForegroundColor White
        Write-Host "Logs Folder: $($info.logsFolder) ($($info.logCount) files)" -ForegroundColor White
        Write-Host "Reports Folder: $($info.reportsFolder) ($($info.reportCount) files)" -ForegroundColor White
        Write-Host "Scripts Folder: $($info.scriptsFolder)" -ForegroundColor White
        Write-Host "HTML Pages Folder: $($info.htmlPagesFolder)" -ForegroundColor White
    }
}

# ===== Singleton Pattern with Script Scope =====
# Using script-scope for module-internal singleton, with backward-compatible $Global alias

# Script-scope singleton instance (preferred - will become module-scope when converted to module)
$script:PathManagerInstance = $null

function Get-PathManager {
    <#
    .SYNOPSIS
        Returns the PathManager singleton instance. Preferred over $Global:PathManager.
    .DESCRIPTION
        This factory function provides access to the PathManager singleton.
        Use this for explicit dependency injection in new code.
    .EXAMPLE
        $pm = Get-PathManager
        $logPath = $pm.GetLogPath("mylog")
    #>
    if ($null -eq $script:PathManagerInstance) {
        $script:PathManagerInstance = [PathManager]::new()
    }
    return $script:PathManagerInstance
}

# Initialize the singleton
$script:PathManagerInstance = [PathManager]::new()

# DEPRECATED: Backward-compatible global alias for existing scripts
# New code should use: Get-PathManager or dependency injection
$Global:PathManager = $script:PathManagerInstance

# Convenience functions (use singleton internally)
function Get-ProjectPath {
    return (Get-PathManager).ProjectRoot
}

function Get-LogPath {
    param([string]$logFileName)
    return (Get-PathManager).GetLogPath($logFileName)
}

function Get-ReportPath {
    param([string]$reportFileName)
    return (Get-PathManager).GetReportPath($reportFileName)
}

function Get-HtmlPath {
    param([string]$htmlFileName)
    return (Get-PathManager).GetHtmlPath($htmlFileName)
}

function New-TimestampedLogPath {
    param([string]$baseName = "log")
    $pm = Get-PathManager
    $fileName = $pm.GenerateTimestampedLogName($baseName)
    return $pm.GetLogPath($fileName)
}

function New-ContextualLogPath {
    param(
        [Parameter(Mandatory = $true)][string]$operation,
        [string]$context = "",
        [string]$component = ""
    )
    $pm = Get-PathManager
    $fileName = $pm.GenerateContextualLogName($operation, $context, $component)
    return $pm.GetLogPath($fileName)
}

function New-TimestampedReportPath {
    param(
        [string]$baseName = "report",
        [string]$extension = "txt"
    )
    $pm = Get-PathManager
    $fileName = $pm.GenerateTimestampedReportName($baseName, $extension)
    return $pm.GetReportPath($fileName)
}

function New-ContextualReportPath {
    param(
        [Parameter(Mandatory = $true)][string]$reportType,
        [string]$context = "",
        [string]$extension = "txt"
    )
    $pm = Get-PathManager
    $fileName = $pm.GenerateContextualReportName($reportType, $context, $extension)
    return $pm.GetReportPath($fileName)
}

function Show-ProjectInfo {
    (Get-PathManager).PrintProjectInfo()
}

function Clear-OldFiles {
    param([int]$daysToKeep = 30)
    $pm = Get-PathManager
    $pm.CleanOldLogs($daysToKeep)
    $pm.CleanOldReports($daysToKeep)
}

# ===== Configuration Management =====

# Cache for loaded configuration
$script:ProjectConfigCache = $null

function Get-ProjectConfig {
    <#
    .SYNOPSIS
        Loads and caches the project configuration from config/project-config.psd1
    .PARAMETER Force
        Force reload of configuration even if cached
    .EXAMPLE
        $config = Get-ProjectConfig
        $retentionDays = $config.Logging.RetentionDays
    #>
    param([switch]$Force)
    
    if ($null -eq $script:ProjectConfigCache -or $Force) {
        $configPath = Join-Path $Global:PathManager.ProjectRoot "config/project-config.psd1"
        
        if (Test-Path $configPath) {
            $script:ProjectConfigCache = Import-PowerShellDataFile $configPath
        }
        else {
            # Return default configuration if file doesn't exist
            Write-Warning "Configuration file not found at $configPath, using defaults"
            $script:ProjectConfigCache = @{
                Logging = @{
                    RetentionDays = 30
                    MaxTotalSize  = 104857600  # 100MB
                    MaxFileSize   = 10485760    # 10MB
                }
            }
        }
    }
    
    return $script:ProjectConfigCache
}

# ===== Enhanced Log Rotation =====

function Invoke-LogRotation {
    <#
    .SYNOPSIS
        Performs log rotation based on age and total directory size
    .PARAMETER RetentionDays
        Number of days to keep logs. Default: from config or 30
    .PARAMETER MaxTotalSize
        Maximum total size of logs directory in bytes. Default: from config or 100MB
    .PARAMETER WhatIf
        Show what would be deleted without actually deleting
    .EXAMPLE
        Invoke-LogRotation -RetentionDays 14
    .EXAMPLE
        Invoke-LogRotation -WhatIf
    #>
    param(
        [int]$RetentionDays = 0,
        [long]$MaxTotalSize = 0,
        [switch]$WhatIf
    )
    
    $config = Get-ProjectConfig
    
    # Use config values if not specified
    if ($RetentionDays -eq 0) {
        $RetentionDays = $config.Logging.RetentionDays
        if ($RetentionDays -eq 0) { $RetentionDays = 30 }
    }
    
    if ($MaxTotalSize -eq 0) {
        $MaxTotalSize = $config.Logging.MaxTotalSize
        if ($MaxTotalSize -eq 0) { $MaxTotalSize = 104857600 }  # 100MB
    }
    
    $logsPath = $Global:PathManager.LogsFolder
    $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
    $deletedCount = 0
    $freedBytes = 0
    
    # Get all log files sorted by age (oldest first)
    $logFiles = Get-ChildItem -Path $logsPath -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime
    
    if ($logFiles.Count -eq 0) {
        Write-Host "No log files found in $logsPath" -ForegroundColor Gray
        return @{ DeletedCount = 0; FreedBytes = 0 }
    }
    
    # Phase 1: Delete files older than retention period
    $oldFiles = $logFiles | Where-Object { $_.LastWriteTime -lt $cutoffDate }
    
    foreach ($file in $oldFiles) {
        $freedBytes += $file.Length
        $deletedCount++
        
        if ($WhatIf) {
            Write-Host "  [WhatIf] Would delete: $($file.Name) (Age: $([int]((Get-Date) - $file.LastWriteTime).TotalDays) days)" -ForegroundColor Yellow
        }
        else {
            Remove-Item $file.FullName -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Phase 2: If still over size limit, delete oldest files
    $remainingFiles = Get-ChildItem -Path $logsPath -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime
    $totalSize = ($remainingFiles | Measure-Object -Property Length -Sum).Sum
    
    if ($totalSize -gt $MaxTotalSize) {
        Write-Host "Logs directory exceeds size limit. Current: $([math]::Round($totalSize/1MB, 2))MB, Max: $([math]::Round($MaxTotalSize/1MB, 2))MB" -ForegroundColor Yellow
        
        foreach ($file in $remainingFiles) {
            if ($totalSize -le $MaxTotalSize) { break }
            
            $totalSize -= $file.Length
            $freedBytes += $file.Length
            $deletedCount++
            
            if ($WhatIf) {
                Write-Host "  [WhatIf] Would delete (size limit): $($file.Name)" -ForegroundColor Yellow
            }
            else {
                Remove-Item $file.FullName -Force -ErrorAction SilentlyContinue
            }
        }
    }
    
    # Report results
    if ($deletedCount -gt 0) {
        $action = if ($WhatIf) { "Would delete" } else { "Deleted" }
        Write-Host "$action $deletedCount files, freed $([math]::Round($freedBytes/1MB, 2))MB" -ForegroundColor $(if ($WhatIf) { "Yellow" } else { "Green" })
    }
    else {
        Write-Host "No files needed rotation (retention: $RetentionDays days, max size: $([math]::Round($MaxTotalSize/1MB, 2))MB)" -ForegroundColor Gray
    }
    
    return @{
        DeletedCount = $deletedCount
        FreedBytes   = $freedBytes
    }
}

# Function to demonstrate enhanced naming patterns
function Show-EnhancedNamingExamples {
    Write-Host "=== ENHANCED LOG NAMING EXAMPLES ===" -ForegroundColor Magenta
    
    Write-Host "`nTraditional naming:" -ForegroundColor Yellow
    $traditional = New-TimestampedLogPath -baseName "simple-log"
    Write-Host "  $traditional" -ForegroundColor White
    
    Write-Host "`nContextual naming examples:" -ForegroundColor Yellow
    $contextual1 = New-ContextualLogPath -operation "check" -context "ollama" -component "models"
    Write-Host "  $contextual1" -ForegroundColor Green
    
    $contextual2 = New-ContextualLogPath -operation "parse" -context "xml" -component "logs"
    Write-Host "  $contextual2" -ForegroundColor Green
    
    $contextual3 = New-ContextualLogPath -operation "test" -context "integration"
    Write-Host "  $contextual3" -ForegroundColor Green
    
    Write-Host "`nReport naming examples:" -ForegroundColor Yellow
    $report1 = New-ContextualReportPath -reportType "model" -context "analysis"
    Write-Host "  $report1" -ForegroundColor Cyan
    
    $report2 = New-ContextualReportPath -reportType "system" -context "health" -extension "html"
    Write-Host "  $report2" -ForegroundColor Cyan
    
    Write-Host "`nXMLLogger static methods:" -ForegroundColor Yellow
    Write-Host "  [XMLLogger]::NewWithContextualPath('check', 'ollama', 'models', 'session')" -ForegroundColor Green
    Write-Host "  [XMLLogger]::NewForOperation('parse', 'session')" -ForegroundColor Green
}

# Export functions for use in other scripts
# Export-ModuleMember -Function Get-ProjectPath, Get-LogPath, Get-ReportPath, Get-HtmlPath, New-TimestampedLogPath, New-ContextualLogPath, New-TimestampedReportPath, New-ContextualReportPath, Show-ProjectInfo, Show-EnhancedNamingExamples, Clear-OldFiles