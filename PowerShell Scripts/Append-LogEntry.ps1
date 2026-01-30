# Append-LogEntry.ps1
# Simple CLI utility to add an entry to a persistent XML log file.
# Used by the Node.js Bridge server to centralize logs.

param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [string]$Level = "INFO",
    [string]$Category = "BRIDGE",
    [string]$LogName = "bridge-log"
)

# --- Load Logger ---
$modulePath = Join-Path $PSScriptRoot "XMLLogger.ps1"
if (-not (Test-Path $modulePath)) {
    Write-Error "XMLLogger.ps1 not found"
    exit 1
}
. $modulePath

try {
    # Get a persistent logger (appends if file exists)
    $logger = [XMLLogger]::GetPersistentLogger($LogName, "Bridge-Server")
    
    # Add the entry
    $logger.AddLogEntry($Level, $Category, $Message, @{})
    
    # Save back to file
    $logger.SaveLog()
    
    # Success signal
    @{ status = "success"; message = "Log entry appended to $($logger.LogFile)" } | ConvertTo-Json -Compress
}
catch {
    @{ status = "error"; message = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
