# Get-ProjectConfig.ps1
# Exports the project-config.psd1 as JSON for consumption by the Bridge server.

$configPath = Join-Path $PSScriptRoot "..\config\project-config.psd1"

if (Test-Path $configPath) {
    try {
        $config = Import-PowerShellDataFile $configPath
        $config | ConvertTo-Json -Depth 10 -Compress
    }
    catch {
        Write-Error "Failed to parse config file: $($_.Exception.Message)"
        "{}" 
    }
}
else {
    Write-Error "Config file not found at: $configPath"
    "{}"
}
