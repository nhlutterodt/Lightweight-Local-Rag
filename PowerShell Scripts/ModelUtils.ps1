# ModelUtils.ps1 - Utilities for AI model detection and management

if (-not (Get-Command New-XMLLogger -ErrorAction SilentlyContinue)) {
    . "$PSScriptRoot\XMLLogger.ps1"
}

class ModelInfo {
    [string]$Name
    [string]$Size
    [string]$Modified
    [string]$Id
    [string]$Family
    [hashtable]$Details
    
    ModelInfo([string]$name) {
        $this.Name = $name
        $this.Size = ""
        $this.Modified = ""
        $this.Id = ""
        $this.Family = ""
        $this.Details = @{}
    }
    
    ModelInfo([string]$name, [string]$size, [string]$modified) {
        $this.Name = $name
        $this.Size = $size
        $this.Modified = $modified
        $this.Id = ""
        $this.Family = $this.ExtractFamily($name)
        $this.Details = @{}
    }
    
    [string] ExtractFamily([string]$modelName) {
        # Extract model family from name (e.g., "llama3.1:8b" -> "llama3.1")
        if ($modelName -match "^([^:]+):") {
            return $matches[1]
        }
        elseif ($modelName -match "^([^-]+)-") {
            return $matches[1]
        }
        else {
            return $modelName.Split()[0]
        }
    }
    
    [hashtable] ToHashtable() {
        return @{
            "name"     = $this.Name
            "size"     = $this.Size
            "modified" = $this.Modified
            "id"       = $this.Id
            "family"   = $this.Family
        }
    }
}

class OllamaManager {
    [string]$OllamaPath
    [bool]$IsAvailable
    [string]$Version
    [ModelInfo[]]$Models
    
    OllamaManager() {
        $this.OllamaPath = ""
        $this.IsAvailable = $false
        $this.Version = ""
        $this.Models = @()
        $this.CheckOllamaAvailability()
    }
    
    [void] CheckOllamaAvailability() {
        try {
            $versionOutput = ollama --version 2>$null
            if ($versionOutput) {
                $this.IsAvailable = $true
                $this.Version = $versionOutput.Trim()
                $this.OllamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Source
            }
        }
        catch {
            $this.IsAvailable = $false
        }
    }
    
    # Extract semantic version number from version string
    # E.g., "ollama version is 0.12.2" -> "0.12.2"
    [string] GetSemanticVersion() {
        if (-not $this.Version) { return "unknown" }
        
        if ($this.Version -match '(\d+\.\d+\.?\d*)') {
            return $matches[1]
        }
        return "unknown"
    }
    
    # Check if current version meets minimum requirement
    # Tested versions: 0.12.x, 0.13.x
    static [string] $MinSupportedVersion = "0.12.0"
    static [string[]] $TestedVersions = @("0.12.0", "0.12.2", "0.13.0")
    
    [bool] IsVersionSupported() {
        $semVer = $this.GetSemanticVersion()
        if ($semVer -eq "unknown") { return $false }
        
        try {
            $current = [System.Version]::new($semVer)
            $minimum = [System.Version]::new([OllamaManager]::MinSupportedVersion)
            return $current -ge $minimum
        }
        catch {
            return $false
        }
    }
    
    [bool] IsVersionTested() {
        $semVer = $this.GetSemanticVersion()
        foreach ($tested in [OllamaManager]::TestedVersions) {
            if ($semVer.StartsWith($tested.Substring(0, 4))) {
                # Match major.minor
                return $true
            }
        }
        return $false
    }
    
    [bool] IsServiceRunning() {
        try {
            $testOutput = ollama list 2>$null
            return $null -ne $testOutput
        }
        catch {
            return $false
        }
    }
    
    [bool] StartService() {
        if ($this.IsServiceRunning()) {
            return $true
        }
        
        try {
            Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3
            return $this.IsServiceRunning()
        }
        catch {
            return $false
        }
    }
    
    [ModelInfo[]] GetModels() {
        if (-not $this.IsAvailable -or -not $this.IsServiceRunning()) {
            return @()
        }
        
        try {
            $modelOutput = ollama list 2>$null
            if (-not $modelOutput) {
                return @()
            }
            
            $tempModels = @()
            $lines = $modelOutput -split "`n" | Where-Object { $_.Trim() -ne "" }
            
            # Skip header line
            for ($i = 1; $i -lt $lines.Count; $i++) {
                $line = $lines[$i].Trim()
                if ($line -eq "") { continue }
                
                # Parse the model line using regex to handle spaces in columns properly
                # Format: NAME (spaces) ID (spaces) SIZE (spaces) MODIFIED
                if ($line -match '^(\S+)\s+(\S+)\s+([\d.]+\s+\w+)\s+(.+)$') {
                    $name = $matches[1]
                    $id = $matches[2]
                    $size = $matches[3]  # e.g., "4.7 GB"
                    $modified = $matches[4]  # e.g., "42 hours ago"
                    
                    $model = [ModelInfo]::new($name, $size, $modified)
                    $model.Id = $id
                    $tempModels += $model
                }
                else {
                    # Fallback parsing for unexpected format
                    $parts = $line -split "\s+" | Where-Object { $_ -ne "" }
                    if ($parts.Count -ge 4) {
                        # Reconstruct size and modified fields
                        $name = $parts[0]
                        $id = $parts[1]
                        
                        # Find where size ends (look for GB, MB, KB)
                        $sizeEndIndex = 2
                        for ($j = 2; $j -lt $parts.Count; $j++) {
                            if ($parts[$j] -match '^(GB|MB|KB)$') {
                                $sizeEndIndex = $j
                                break
                            }
                        }
                        
                        $sizeParts = $parts[2..$sizeEndIndex] -join " "
                        $modifiedParts = $parts[($sizeEndIndex + 1)..($parts.Count - 1)] -join " "
                        
                        $model = [ModelInfo]::new($name, $sizeParts, $modifiedParts)
                        $model.Id = $id
                        $tempModels += $model
                    }
                }
            }
            
            $this.Models = $tempModels
            return $tempModels
        }
        catch {
            Write-Warning "Failed to get model list: $($_.Exception.Message)"
            return @()
        }
    }
    
    [hashtable] GetSystemInfo() {
        # Get current model count dynamically
        $currentModelCount = 0
        if ($this.IsAvailable -and $this.IsServiceRunning()) {
            try {
                $currentModels = $this.GetModels()
                $currentModelCount = $currentModels.Count
            }
            catch {
                $currentModelCount = $this.Models.Count
            }
        }
        
        return @{
            "isAvailable"      = $this.IsAvailable.ToString()
            "version"          = $this.Version
            "ollamaPath"       = $this.OllamaPath
            "isServiceRunning" = $this.IsServiceRunning().ToString()
            "modelCount"       = $currentModelCount.ToString()
        }
    }
    
    [void] LogSystemCheck($logger) {
        Write-Host "Checking for Ollama installation..." -ForegroundColor Yellow
        $logger.LogInfo("SYSTEM", "Starting Ollama installation check")
        
        if ($this.IsAvailable) {
            Write-Host "✓ Ollama is installed: $($this.Version)" -ForegroundColor Green
            
            # Version compatibility check
            $semVer = $this.GetSemanticVersion()
            if (-not $this.IsVersionTested()) {
                Write-Host "⚠ Warning: Ollama version $semVer has not been tested with this project" -ForegroundColor Yellow
                Write-Host "  Tested versions: $([OllamaManager]::TestedVersions -join ', ')" -ForegroundColor DarkYellow
                $logger.LogWarning("VERSION", "Untested Ollama version detected", @{
                        "currentVersion" = $semVer
                        "testedVersions" = ([OllamaManager]::TestedVersions -join ", ")
                        "minVersion"     = [OllamaManager]::MinSupportedVersion
                    })
            }
            elseif (-not $this.IsVersionSupported()) {
                Write-Host "⚠ Warning: Ollama version $semVer is below minimum supported version" -ForegroundColor Yellow
                $logger.LogWarning("VERSION", "Unsupported Ollama version", @{
                        "currentVersion" = $semVer
                        "minVersion"     = [OllamaManager]::MinSupportedVersion
                    })
            }
            
            $logger.LogSuccess("INSTALLATION", "Ollama is installed", $this.GetSystemInfo())
            
            $this.LogServiceCheck($logger)
        }
        else {
            Write-Host "✗ Ollama is not installed or not in PATH" -ForegroundColor Red
            Write-Host "You can install Ollama from: https://ollama.ai" -ForegroundColor Cyan
            $logger.LogError("INSTALLATION", "Ollama is not installed or not in PATH", @{ 
                    "suggestion" = "Install from https://ollama.ai" 
                })
        }
    }
    
    [void] LogServiceCheck($logger) {
        Write-Host "`nChecking Ollama service..." -ForegroundColor Yellow
        $logger.LogInfo("SERVICE", "Checking if Ollama service is running")
        
        if ($this.IsServiceRunning()) {
            Write-Host "✓ Ollama is running" -ForegroundColor Green
            $this.LogModels($logger)
        }
        else {
            Write-Host "⚠ Ollama is installed but may not be running" -ForegroundColor Yellow
            $logger.LogWarning("SERVICE", "Ollama installed but not responding to list command")
            
            Write-Host "Trying to start Ollama..." -ForegroundColor Yellow
            $logger.LogInfo("SERVICE", "Attempting to start Ollama service")
            
            if ($this.StartService()) {
                Write-Host "✓ Ollama started successfully" -ForegroundColor Green
                $logger.LogSuccess("SERVICE", "Ollama started successfully after retry")
                $this.LogModels($logger)
            }
            else {
                Write-Host "✗ Failed to start Ollama service" -ForegroundColor Red
                $logger.LogError("SERVICE", "Failed to start Ollama service")
            }
        }
    }
    
    [void] LogModels($logger) {
        $currentModels = $this.GetModels()
        
        if ($currentModels.Count -gt 0) {
            Write-Host "`nAvailable models:" -ForegroundColor Cyan
            
            # Display models in a formatted table
            $currentModels | ForEach-Object {
                $displaySize = if ($_.Size) { $_.Size } else { "Unknown" }
                $displayModified = if ($_.Modified) { $_.Modified } else { "Unknown" }
                Write-Host "  $($_.Name) ($displaySize) - Modified: $displayModified" -ForegroundColor White
            }
            
            # Log overall summary
            $modelFamilies = $currentModels | Group-Object Family | Sort-Object Count -Descending
            $familyInfo = $modelFamilies | ForEach-Object { "$($_.Name):$($_.Count)" }
            
            # Calculate total size properly
            $totalSizeInGB = 0
            foreach ($model in $currentModels) {
                $sizeStr = $model.Size
                if ($sizeStr -match "([0-9.]+)\s*(GB|MB|KB)") {
                    $value = [float]$matches[1]
                    $unit = $matches[2]
                    
                    $sizeInGB = switch ($unit) {
                        "GB" { $value }
                        "MB" { $value / 1024 }
                        "KB" { $value / (1024 * 1024) }
                        default { 0 }
                    }
                    $totalSizeInGB += $sizeInGB
                }
            }
            
            $logger.LogSuccess("SERVICE", "Models are available", @{
                    "modelCount"    = $currentModels.Count.ToString()
                    "modelFamilies" = ($familyInfo -join ",")
                    "totalSize"     = $totalSizeInGB.ToString()
                })
            
            # Log each model individually for detailed analysis
            foreach ($model in $currentModels) {
                $logger.LogInfo("MODEL", "Model details: $($model.Name)", $model.ToHashtable())
            }
        }
        else {
            Write-Host "`n⚠ No models found" -ForegroundColor Yellow
            $logger.LogWarning("SERVICE", "Ollama is running but no models are installed", @{
                    "suggestion" = "Install models using 'ollama pull <model-name>'"
                })
        }
    }
}

# Utility functions for common model operations
function Test-OllamaInstallation {
    param(
        [XMLLogger]$Logger = $null,
        [bool]$Detailed = $true
    )
    
    $manager = [OllamaManager]::new()
    
    if ($Logger) {
        $manager.LogSystemCheck($Logger)
    }
    else {
        # Simple check without logging
        if ($manager.IsAvailable) {
            Write-Host "✓ Ollama is available: $($manager.Version)" -ForegroundColor Green
            if ($manager.IsServiceRunning()) {
                $models = $manager.GetModels()
                Write-Host "✓ Service is running with $($models.Count) models" -ForegroundColor Green
                return $true
            }
            else {
                Write-Host "⚠ Service is not running" -ForegroundColor Yellow
                return $false
            }
        }
        else {
            Write-Host "✗ Ollama is not available" -ForegroundColor Red
            return $false
        }
    }
}

function Get-OllamaModels {
    param(
        [bool]$AsObjects = $false
    )
    
    $manager = [OllamaManager]::new()
    $models = $manager.GetModels()
    
    if ($AsObjects) {
        return $models
    }
    else {
        return $models | ForEach-Object { $_.Name }
    }
}

function Get-ModelSummary {
    $manager = [OllamaManager]::new()
    
    if (-not $manager.IsAvailable) {
        return @{ "status" = "not_installed"; "models" = @() }
    }
    
    if (-not $manager.IsServiceRunning()) {
        return @{ "status" = "not_running"; "models" = @() }
    }
    
    $models = $manager.GetModels()
    $summary = @{
        "status"     = "running"
        "version"    = $manager.Version
        "modelCount" = $models.Count
        "models"     = $models | ForEach-Object { $_.ToHashtable() }
        "families"   = ($models | Group-Object Family | ForEach-Object { @{ "name" = $_.Name; "count" = $_.Count } })
    }
    
    return $summary
}

# Export functions for module use
# Export-ModuleMember -Function Test-OllamaInstallation, Get-OllamaModels, Get-ModelSummary