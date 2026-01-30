# Get-VectorMetrics.ps1 - Diagnostic utility for Interacting with Vector Store Metadata
# Returns JSON telemetry for all discovered collections

param(
    [string]$DataPath = "$PSScriptRoot/Data"
)

# Load PathUtils if available for directory resolution
$modulePath = Join-Path $PSScriptRoot "LocalRagUtils/LocalRagUtils.psd1"
if (Test-Path $modulePath) { Import-Module $modulePath -Force }

# Resolve absolute path
if (-not (Test-Path $DataPath)) {
    @{ status = "error"; message = "Data directory not found at $DataPath" } | ConvertTo-Json -Compress
    exit 1
}

$results = @()
$binFiles = Get-ChildItem -Path $DataPath -Filter "*.vectors.bin"

foreach ($file in $binFiles) {
    $collectionName = $file.BaseName -replace "\.vectors$", ""
    
    $metrics = @{
        name           = $collectionName
        file           = $file.Name
        lastModified   = $file.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
        totalSizeBytes = $file.Length
    }

    # Extract Header (Efficiently read only first 8 bytes)
    try {
        $fs = [System.IO.File]::OpenRead($file.FullName)
        $br = [System.IO.BinaryReader]::new($fs)
        
        $count = $br.ReadInt32()
        $dim = $br.ReadInt32()
        
        $br.Close()
        $fs.Dispose()

        $metrics.vectorCount = $count
        $metrics.dimension = $dim
        $metrics.estimatedMemoryFootprintBytes = $count * $dim * 4 # 4 bytes per float32
        $metrics.health = "OK"
    }
    catch {
        $metrics.vectorCount = 0
        $metrics.dimension = 0
        $metrics.health = "CORRUPT"
        $metrics.error = $_.Exception.Message
    }

    $results += [PSCustomObject]$metrics
}

# Output as compressed JSON for the Bridge
$results | ConvertTo-Json -Compress
