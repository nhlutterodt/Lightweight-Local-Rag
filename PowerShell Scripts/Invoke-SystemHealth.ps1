# Invoke-SystemHealth.ps1
# Comprehensive diagnostic script for RAG health monitoring.

# Load modules
$modulePath = Join-Path $PSScriptRoot "LocalRagUtils\LocalRagUtils.psd1"
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force
}

$results = @{
    timestamp = (Get-Date -UFormat "%Y-%m-%dT%H:%M:%SZ")
    status    = "healthy"
    checks    = @()
}

# 1. Ollama Check
try {
    # Attempt to use OllamaClient if available, otherwise fallback to simple test
    if (Get-Command -Module LocalRagUtils | Where-Object { $_.Name -eq "Get-OllamaModels" }) {
        $ollama = [OllamaClient]::new("http://localhost:11434", "nomic-embed-text")
        $isOllamaUp = $ollama.IsAvailable()
    }
    else {
        $isOllamaUp = $null -ne (Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction SilentlyContinue)
    }
    
    $results.checks += @{
        name    = "Ollama Service"
        status  = if ($isOllamaUp) { "OK" } else { "ERROR" }
        message = if ($isOllamaUp) { "Service reachable" } else { "Service unreachable on port 11434" }
    }
}
catch {
    $results.checks += @{ name = "Ollama Service"; status = "ERROR"; message = $_.Exception.Message }
}

# 2. Vector Store Check
$dataDir = Join-Path $PSScriptRoot "Data"
$isDataDir = Test-Path $dataDir
$results.checks += @{
    name    = "Vector Store"
    status  = if ($isDataDir) { "OK" } else { "WARNING" }
    message = if ($isDataDir) { "Data directory exists at $dataDir" } else { "Data directory missing; initialization required" }
}

# 3. System Storage Check
try {
    $driveLetter = (Split-Path $PSScriptRoot -Qualifier).Replace(":", "")
    $drive = Get-PSDrive -Name $driveLetter
    $freeGB = [Math]::Round($drive.Free / 1GB, 2)
    $results.checks += @{
        name    = "Local Disk"
        status  = if ($freeGB -gt 2) { "OK" } else { "WARNING" }
        message = "$freeGB GB free on $driveLetter` drive"
    }
}
catch {
    # Ignore storage check errors
}

# Determine overall status
if ($results.checks | Where-Object { $_.status -eq "ERROR" }) {
    $results.status = "error"
}
elseif ($results.checks | Where-Object { $_.status -eq "WARNING" }) {
    $results.status = "warning"
}

# Output as JSON
$results | ConvertTo-Json -Depth 5 -Compress
