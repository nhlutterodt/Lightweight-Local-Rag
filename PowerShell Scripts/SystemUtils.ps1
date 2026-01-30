# SystemUtils.ps1 - System information collection utilities

# Get PowerShell version outside class context for accessibility
$script:PowerShellVersion = $PSVersionTable.PSVersion.ToString()

class SystemInfoCollector {
    [hashtable]$SystemInfo
    [hashtable]$PerformanceCounters
    
    SystemInfoCollector() {
        $this.SystemInfo = @{}
        $this.PerformanceCounters = @{}
        $this.CollectBasicSystemInfo()
    }
    
    [void] CollectBasicSystemInfo() {
        try {
            $this.SystemInfo = @{
                "computerName" = $env:COMPUTERNAME
                "userName" = $env:USERNAME
                "powerShellVersion" = $script:PowerShellVersion
                "operatingSystem" = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
                "architecture" = $env:PROCESSOR_ARCHITECTURE
                "timezone" = (Get-TimeZone).Id
                "culture" = (Get-Culture).Name
                "collectionTime" = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            }
            
            # Additional OS details
            $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
            if ($os) {
                $this.SystemInfo["osVersion"] = $os.Version
                $this.SystemInfo["buildNumber"] = $os.BuildNumber
                $this.SystemInfo["totalMemoryGB"] = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
                $this.SystemInfo["freeMemoryGB"] = [Math]::Round($os.FreePhysicalMemory / 1MB, 2)
            }
            
            # Processor info
            $processor = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($processor) {
                $this.SystemInfo["processorName"] = $processor.Name.Trim()
                $this.SystemInfo["processorCores"] = $processor.NumberOfCores
                $this.SystemInfo["processorThreads"] = $processor.NumberOfLogicalProcessors
            }
            
        } catch {
            Write-Warning "Could not collect complete system information: $($_.Exception.Message)"
        }
    }
    
    [void] CollectDiskInfo() {
        try {
            $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue
            $diskInfo = @{}
            
            foreach ($disk in $disks) {
                $totalGB = [Math]::Round($disk.Size / 1GB, 2)
                $freeGB = [Math]::Round($disk.FreeSpace / 1GB, 2)
                $usedPercent = [Math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
                
                $diskInfo[$disk.DeviceID] = @{
                    "totalGB" = $totalGB
                    "freeGB" = $freeGB
                    "usedPercent" = $usedPercent
                    "fileSystem" = $disk.FileSystem
                }
            }
            
            $this.SystemInfo["disks"] = $diskInfo
            
        } catch {
            Write-Warning "Could not collect disk information: $($_.Exception.Message)"
        }
    }
    
    [void] CollectNetworkInfo() {
        try {
            $adapters = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" -ErrorAction SilentlyContinue
            $networkInfo = @()
            
            foreach ($adapter in $adapters) {
                if ($adapter.IPAddress) {
                    $networkInfo += @{
                        "description" = $adapter.Description
                        "ipAddresses" = $adapter.IPAddress -join ", "
                        "macAddress" = $adapter.MACAddress
                        "dhcpEnabled" = $adapter.DHCPEnabled
                    }
                }
            }
            
            $this.SystemInfo["network"] = $networkInfo
            
        } catch {
            Write-Warning "Could not collect network information: $($_.Exception.Message)"
        }
    }
    
    [void] CollectProcessInfo() {
        try {
            $processes = Get-Process | Group-Object ProcessName | ForEach-Object {
                @{
                    "name" = $_.Name
                    "count" = $_.Count
                    "totalWorkingSetMB" = [Math]::Round(($_.Group | Measure-Object WorkingSet -Sum).Sum / 1MB, 2)
                }
            } | Sort-Object totalWorkingSetMB -Descending | Select-Object -First 10
            
            $this.SystemInfo["topProcesses"] = $processes
            
        } catch {
            Write-Warning "Could not collect process information: $($_.Exception.Message)"
        }
    }
    
    [hashtable] GetBasicInfo() {
        return $this.SystemInfo
    }
    
    [hashtable] GetExtendedInfo() {
        $this.CollectDiskInfo()
        $this.CollectNetworkInfo()
        return $this.SystemInfo
    }
    
    [hashtable] GetFullSystemReport() {
        $this.CollectDiskInfo()
        $this.CollectNetworkInfo()
        $this.CollectProcessInfo()
        return $this.SystemInfo
    }
    
    [void] DisplaySystemInfo([string]$level = "basic") {
        . "$PSScriptRoot\ConsoleUtils.ps1"
        
        Write-Header "SYSTEM INFORMATION"
        
        # Basic info
        Write-Section "Basic System Details"
        Write-KeyValuePair "Computer Name" $this.SystemInfo["computerName"]
        Write-KeyValuePair "User Name" $this.SystemInfo["userName"]
        Write-KeyValuePair "Operating System" $this.SystemInfo["operatingSystem"]
        Write-KeyValuePair "PowerShell Version" $this.SystemInfo["powerShellVersion"]
        Write-KeyValuePair "Architecture" $this.SystemInfo["architecture"]
        
        if ($this.SystemInfo.ContainsKey("processorName")) {
            Write-Section "Hardware Details"
            Write-KeyValuePair "Processor" $this.SystemInfo["processorName"]
            Write-KeyValuePair "Cores" $this.SystemInfo["processorCores"]
            Write-KeyValuePair "Logical Processors" $this.SystemInfo["processorThreads"]
            Write-KeyValuePair "Total Memory" "$($this.SystemInfo["totalMemoryGB"]) GB"
            Write-KeyValuePair "Free Memory" "$($this.SystemInfo["freeMemoryGB"]) GB"
        }
        
        if ($level -eq "extended" -or $level -eq "full") {
            if ($this.SystemInfo.ContainsKey("disks")) {
                Write-Section "Disk Information"
                foreach ($disk in $this.SystemInfo["disks"].Keys) {
                    $info = $this.SystemInfo["disks"][$disk]
                    Write-DetailMessage "Drive $disk`: $($info.totalGB) GB total, $($info.freeGB) GB free ($($info.usedPercent)% used)"
                }
            }
            
            if ($this.SystemInfo.ContainsKey("network")) {
                Write-Section "Network Adapters"
                foreach ($adapter in $this.SystemInfo["network"]) {
                    Write-DetailMessage "$($adapter.description): $($adapter.ipAddresses)"
                }
            }
        }
        
        if ($level -eq "full") {
            if ($this.SystemInfo.ContainsKey("topProcesses")) {
                Write-Section "Top Processes by Memory Usage"
                foreach ($process in $this.SystemInfo["topProcesses"]) {
                    Write-DetailMessage "$($process.name) ($($process.count) instances): $($process.totalWorkingSetMB) MB"
                }
            }
        }
    }
}

# Utility functions
function Get-BasicSystemInfo {
    $collector = [SystemInfoCollector]::new()
    return $collector.GetBasicInfo()
}

function Get-ExtendedSystemInfo {
    $collector = [SystemInfoCollector]::new()
    return $collector.GetExtendedInfo()
}

function Get-FullSystemInfo {
    $collector = [SystemInfoCollector]::new()
    return $collector.GetFullSystemReport()
}

function Show-SystemInfo {
    param(
        [ValidateSet("basic", "extended", "full")]
        [string]$Level = "basic"
    )
    
    $collector = [SystemInfoCollector]::new()
    
    switch ($Level) {
        "extended" { $collector.GetExtendedInfo() }
        "full" { $collector.GetFullSystemReport() }
    }
    
    $collector.DisplaySystemInfo($Level)
}

# Convenience function for logging
function Add-SystemInfoToLog {
    param(
        [Parameter(Mandatory=$true)]
        $Logger,
        [string]$Category = "SYSTEM",
        [string]$Level = "basic"
    )
    
    $systemInfo = switch ($Level) {
        "basic" { Get-BasicSystemInfo }
        "extended" { Get-ExtendedSystemInfo }
        "full" { Get-FullSystemInfo }
    }
    
    $Logger.LogInfo($Category, "System information collected", $systemInfo)
}

# Export functions for use in other scripts
# Export-ModuleMember -Function Get-BasicSystemInfo, Get-ExtendedSystemInfo, Get-FullSystemInfo, Show-SystemInfo, Add-SystemInfoToLog