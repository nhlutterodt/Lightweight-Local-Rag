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

# Load VectorStore
. "$PSScriptRoot/VectorStore.ps1"

$results = @()
$binFiles = Get-ChildItem -Path $DataPath -Filter "*.vectors.bin"

foreach ($file in $binFiles) {
    $collectionName = $file.BaseName -replace "\.vectors$", ""
    
    $metrics = [ordered]@{
        name           = $collectionName
        file           = $file.Name
        lastModified   = $file.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
        totalSizeBytes = $file.Length
    }

    try {
        $store = [VectorStore]::new($DataPath, $collectionName)
        $store.Load()
        
        $count = $store.Items.Count
        $dim = $store.VectorDimension

        $metrics.vectorCount = $count
        $metrics.dimension = $dim
        $metrics.estimatedMemoryFootprintBytes = $count * $dim * 4 # 4 bytes per float32
        $metrics.health = "OK"
        
        # --- New Chunk Quality Metrics ---
        $metrics.ChunkCount = $count
        $metrics.EmbeddingModel = $store.EmbeddingModel

        $chunkLengths = @()
        $legacyCount = 0
        $ingestDates = @()

        foreach ($item in $store.Items) {
            $meta = $item.Metadata
            if ($null -ne $meta.ChunkText) {
                $chunkLengths += $meta.ChunkText.Length
            }
            else {
                $legacyCount++
            }
            
            if ($null -ne $meta.IngestedAt) {
                $ingestDates += [datetime]$meta.IngestedAt
            }
        }

        if ($chunkLengths.Count -gt 0) {
            $measures = $chunkLengths | Measure-Object -Average -Minimum -Maximum
            $metrics.AvgChunkCharLength = [math]::Round($measures.Average, 2)
            $metrics.MinChunkCharLength = $measures.Minimum
            $metrics.MaxChunkCharLength = $measures.Maximum
        }
        else {
            $metrics.AvgChunkCharLength = $null
            $metrics.MinChunkCharLength = $null
            $metrics.MaxChunkCharLength = $null
        }

        $metrics.LegacyChunkCount = $legacyCount

        if ($ingestDates.Count -gt 0) {
            $sortedDates = $ingestDates | Sort-Object
            $metrics.OldestIngestDate = $sortedDates[0].ToString("o")
            $metrics.NewestIngestDate = $sortedDates[-1].ToString("o")
        }
        else {
            $metrics.OldestIngestDate = $null
            $metrics.NewestIngestDate = $null
        }
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
