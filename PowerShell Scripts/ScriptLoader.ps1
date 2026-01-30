# ScriptLoader.ps1 - Centralized script loading and dependency management
# Eliminates repetitive dot-sourcing patterns across scripts

class ScriptLoader {
    [string]$ScriptRoot
    [hashtable]$LoadedUtilities = @{}
    [hashtable]$LoadResults = @{}
    [string[]]$StandardUtilities = @(
        "PathUtils.ps1", 
        "ConsoleUtils.ps1", 
        "DateTimeUtils.ps1", 
        "ValidationUtils.ps1", 
        "XMLLogger.ps1", 
        "SystemUtils.ps1",
        "FileUtils.ps1", 
        "Schemas.ps1"
    )
    [string[]]$ExtendedUtilities = @(
        "ReportUtils.ps1",
        "ModelUtils.ps1"
    )
    [string[]]$AbstractionUtilities = @(
        "ExecutionContext.ps1",
        "OutputManager.ps1", 
        "ErrorManager.ps1",
        "DataProcessor.ps1"
    )
    [bool]$VerboseLoading = $false
    [datetime]$LoadStartTime
    
    ScriptLoader([string]$scriptRoot = $PSScriptRoot) {
        $this.ScriptRoot = $scriptRoot
        $this.LoadStartTime = Get-Date
    }
    
    # Load all standard utilities (core dependencies)
    [hashtable] LoadStandardUtilities() {
        if ($this.VerboseLoading) {
            Write-Host "Loading standard utilities..." -ForegroundColor Cyan
        }
        
        foreach ($utility in $this.StandardUtilities) {
            $this.LoadUtility($utility)
        }
        
        if ($this.VerboseLoading) {
            $this.DisplayLoadSummary("Standard")
        }
        
        return $this.LoadResults
    }
    
    # Load extended utilities (optional enhancements)
    [hashtable] LoadExtendedUtilities() {
        if ($this.VerboseLoading) {
            Write-Host "Loading extended utilities..." -ForegroundColor Yellow
        }
        
        foreach ($utility in $this.ExtendedUtilities) {
            $this.LoadUtility($utility)
        }
        
        if ($this.VerboseLoading) {
            $this.DisplayLoadSummary("Extended")
        }
        
        return $this.LoadResults
    }
    
    # Load all utilities (standard + extended)
    [hashtable] LoadAllUtilities() {
        $this.LoadStandardUtilities()
        $this.LoadExtendedUtilities()
        return $this.LoadResults
    }
    
    # Load specific utility by name
    [bool] LoadUtility([string]$utilityName) {
        $fullPath = Join-Path $this.ScriptRoot $utilityName
        $utilLoadStartTime = Get-Date
        
        if (Test-Path $fullPath) {
            try {
                if ($this.VerboseLoading) {
                    Write-Host "  Loading $utilityName..." -NoNewline -ForegroundColor Gray
                }
                
                # Dot-source the script
                . $fullPath
                
                $loadTime = (Get-Date) - $utilLoadStartTime
                $this.LoadedUtilities[$utilityName] = $true
                $this.LoadResults[$utilityName] = @{
                    "status" = "success"
                    "loadTime" = $loadTime
                    "path" = $fullPath
                    "error" = $null
                }
                
                if ($this.VerboseLoading) {
                    Write-Host " ✓ ($($loadTime.TotalMilliseconds.ToString('F0'))ms)" -ForegroundColor Green
                }
                
                return $true
                
            } catch {
                $loadTime = (Get-Date) - $utilLoadStartTime
                $this.LoadedUtilities[$utilityName] = $false
                $this.LoadResults[$utilityName] = @{
                    "status" = "failed"
                    "loadTime" = $loadTime
                    "path" = $fullPath
                    "error" = $_.Exception.Message
                }
                
                if ($this.VerboseLoading) {
                    Write-Host " ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
                } else {
                    Write-Warning "Failed to load $utilityName`: $($_.Exception.Message)"
                }
                
                return $false
            }
        } else {
            $this.LoadedUtilities[$utilityName] = $false
            $this.LoadResults[$utilityName] = @{
                "status" = "not_found"
                "loadTime" = [timespan]::Zero
                "path" = $fullPath
                "error" = "File not found"
            }
            
            if ($this.VerboseLoading) {
                Write-Host "  $utilityName - Not found" -ForegroundColor DarkGray
            }
            
            return $false
        }
    }
    
    # Load utilities by pattern (e.g., "*Utils.ps1")
    [hashtable] LoadUtilitiesByPattern([string]$pattern) {
        $matchingFiles = Get-ChildItem -Path $this.ScriptRoot -Filter $pattern -File | 
                        Where-Object { $_.Name -notlike "Test-*" } | 
                        Sort-Object Name
        
        $results = @{}
        foreach ($file in $matchingFiles) {
            $success = $this.LoadUtility($file.Name)
            $results[$file.Name] = $success
        }
        
        return $results
    }
    
    # Check if a utility is loaded and available
    [bool] IsUtilityLoaded([string]$utilityName) {
        return $this.LoadedUtilities.ContainsKey($utilityName) -and $this.LoadedUtilities[$utilityName]
    }
    
    # Get loading statistics
    [hashtable] GetLoadingStats() {
        $totalTime = (Get-Date) - $this.LoadStartTime
        $successful = ($this.LoadResults.Values | Where-Object { $_.status -eq "success" }).Count
        $failed = ($this.LoadResults.Values | Where-Object { $_.status -eq "failed" }).Count
        $notFound = ($this.LoadResults.Values | Where-Object { $_.status -eq "not_found" }).Count
        
        return @{
            "totalUtilities" = $this.LoadResults.Count
            "successful" = $successful
            "failed" = $failed
            "notFound" = $notFound
            "totalLoadTime" = $totalTime
            "averageLoadTime" = if ($successful -gt 0) { 
                [timespan]::FromTicks(($this.LoadResults.Values | Where-Object { $_.status -eq "success" } | 
                    ForEach-Object { $_.loadTime.Ticks } | Measure-Object -Sum).Sum / $successful)
            } else { 
                [timespan]::Zero 
            }
        }
    }
    
    # Display detailed loading summary
    [void] DisplayLoadSummary([string]$category = "All") {
        Write-Host "`n=== $category Utilities Load Summary ===" -ForegroundColor Cyan
        
        $stats = $this.GetLoadingStats()
        Write-Host "Total Utilities: $($stats.totalUtilities)" -ForegroundColor White
        Write-Host "Successfully Loaded: $($stats.successful)" -ForegroundColor Green
        Write-Host "Failed: $($stats.failed)" -ForegroundColor Red  
        Write-Host "Not Found: $($stats.notFound)" -ForegroundColor Yellow
        Write-Host "Total Load Time: $($stats.totalLoadTime.TotalMilliseconds.ToString('F0'))ms" -ForegroundColor Gray
        
        if ($stats.successful -gt 0) {
            Write-Host "Average Load Time: $($stats.averageLoadTime.TotalMilliseconds.ToString('F0'))ms" -ForegroundColor Gray
        }
        
        # Show failures if any
        if ($stats.failed -gt 0 -or $stats.notFound -gt 0) {
            Write-Host "`nIssues:" -ForegroundColor Yellow
            foreach ($utility in $this.LoadResults.Keys) {
                $result = $this.LoadResults[$utility]
                if ($result.status -ne "success") {
                    $statusColor = if ($result.status -eq "failed") { "Red" } else { "DarkYellow" }
                    Write-Host "  $utility`: $($result.status) - $($result.error)" -ForegroundColor $statusColor
                }
            }
        }
        Write-Host ""
    }
    
    # Display loaded utilities in a compact format
    [void] DisplayLoadedUtilities() {
        $successful = $this.LoadResults.Keys | Where-Object { $this.LoadResults[$_].status -eq "success" } | Sort-Object
        $failed = $this.LoadResults.Keys | Where-Object { $this.LoadResults[$_].status -ne "success" } | Sort-Object
        
        if ($successful.Count -gt 0) {
            Write-Host "Loaded Utilities: " -NoNewline -ForegroundColor Green
            Write-Host ($successful -join ", ") -ForegroundColor Gray
        }
        
        if ($failed.Count -gt 0) {
            Write-Host "Failed/Missing Utilities: " -NoNewline -ForegroundColor Red
            Write-Host ($failed -join ", ") -ForegroundColor DarkGray
        }
    }
    
    # Validate all loaded utilities have expected functions
    [hashtable] ValidateLoadedUtilities() {
        $validationResults = @{}
        
        # Define expected functions per utility
        $expectedFunctions = @{
            "ConsoleUtils.ps1" = @("Write-Header", "Write-Section", "Write-SuccessMessage", "Write-KeyValuePair")
            "DateTimeUtils.ps1" = @("Get-Timestamp", "New-PerformanceTimer", "Format-ElapsedTime")
            "ValidationUtils.ps1" = @("Test-FileExists", "Test-PathExists")
            "XMLLogger.ps1" = @("Write-XmlLog")
            "Schemas.ps1" = @("Get-SchemaRegistry")
        }
        
        foreach ($utility in $this.LoadedUtilities.Keys) {
            if ($this.LoadedUtilities[$utility] -and $expectedFunctions.ContainsKey($utility)) {
                $expected = $expectedFunctions[$utility]
                $missing = @()
                
                foreach ($func in $expected) {
                    if (-not (Get-Command -Name $func -ErrorAction SilentlyContinue)) {
                        $missing += $func
                    }
                }
                
                $validationResults[$utility] = @{
                    "expectedFunctions" = $expected
                    "missingFunctions" = $missing
                    "isValid" = ($missing.Count -eq 0)
                }
            }
        }
        
        return $validationResults
    }
    
    # Create a simple loading profile for common scenarios
    [hashtable] LoadProfile([string]$profileName) {
        switch ($profileName.ToLower()) {
            "minimal" {
                # Only core essentials
                $utilities = @("ConsoleUtils.ps1", "DateTimeUtils.ps1", "ValidationUtils.ps1")
                foreach ($util in $utilities) { $this.LoadUtility($util) }
            }
            "logging" {
                # For logging-focused scripts
                $utilities = @("ConsoleUtils.ps1", "DateTimeUtils.ps1", "ValidationUtils.ps1", "XMLLogger.ps1", "Schemas.ps1")
                foreach ($util in $utilities) { $this.LoadUtility($util) }
            }
            "analysis" {
                # For analysis and reporting scripts
                $utilities = @("ConsoleUtils.ps1", "DateTimeUtils.ps1", "ValidationUtils.ps1", "XMLLogger.ps1", "Schemas.ps1", "ReportUtils.ps1", "FileUtils.ps1")
                foreach ($util in $utilities) { $this.LoadUtility($util) }
            }
            "system" {
                # For system monitoring scripts
                $utilities = @("ConsoleUtils.ps1", "DateTimeUtils.ps1", "ValidationUtils.ps1", "XMLLogger.ps1", "SystemUtils.ps1", "ModelUtils.ps1")
                foreach ($util in $utilities) { $this.LoadUtility($util) }
            }
            "abstractions" {
                # For scripts using utility abstractions
                $utilities = @("ConsoleUtils.ps1", "DateTimeUtils.ps1", "ValidationUtils.ps1", "XMLLogger.ps1", "Schemas.ps1", "ExecutionContext.ps1", "OutputManager.ps1", "ErrorManager.ps1", "DataProcessor.ps1")
                foreach ($util in $utilities) { $this.LoadUtility($util) }
            }
            "full" {
                # Load everything
                return $this.LoadAllUtilities()
            }
            default {
                throw "Unknown profile: $profileName. Available profiles: minimal, logging, analysis, system, abstractions, full"
            }
        }
        
        return $this.LoadResults
    }
}

# Global convenience functions for easy usage
function New-ScriptLoader {
    param(
        [string]$ScriptRoot = $PSScriptRoot,
        [switch]$Verbose
    )
    
    $loader = [ScriptLoader]::new($ScriptRoot)
    $loader.VerboseLoading = $Verbose.IsPresent
    return $loader
}

function Import-StandardUtilities {
    param(
        [string]$ScriptRoot = $PSScriptRoot,
        [switch]$Verbose,
        [switch]$ShowSummary
    )
    
    $loader = New-ScriptLoader -ScriptRoot $ScriptRoot -Verbose:$Verbose
    $results = $loader.LoadStandardUtilities()
    
    if ($ShowSummary) {
        $loader.DisplayLoadSummary("Standard")
    }
    
    return $results
}

function Import-UtilityProfile {
    param(
        [Parameter(Mandatory=$true)]
        [ValidateSet("minimal", "logging", "analysis", "system", "abstractions", "full")]
        [string]$Profile,
        [string]$ScriptRoot = $PSScriptRoot,
        [switch]$Verbose,
        [switch]$ShowSummary
    )
    
    $loader = New-ScriptLoader -ScriptRoot $ScriptRoot -Verbose:$Verbose
    $results = $loader.LoadProfile($Profile)
    
    if ($ShowSummary) {
        $loader.DisplayLoadSummary($Profile.Substring(0,1).ToUpper() + $Profile.Substring(1))
    }
    
    return $results
}

# Quick utility check function
function Test-UtilityAvailability {
    param(
        [string[]]$RequiredUtilities = @("ConsoleUtils.ps1", "DateTimeUtils.ps1"),
        [string]$ScriptRoot = $PSScriptRoot
    )
    
    $available = @{}
    
    foreach ($util in $RequiredUtilities) {
        $available[$util] = (Test-Path (Join-Path $ScriptRoot $util))
    }
    
    return $available
}

# Export key functions for module use
# Export-ModuleMember -Function New-ScriptLoader, Import-StandardUtilities, Import-UtilityProfile, Test-UtilityAvailability