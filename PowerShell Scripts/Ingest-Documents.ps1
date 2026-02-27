param(
    [string]$SourcePath = "$PSScriptRoot\..\docs",
    [string]$CollectionName = "ProjectDocs",
    [string]$OllamaUrl = "http://localhost:11434",
    [string]$EmbeddingModel = "nomic-embed-text",
    [int]$ChunkSize = 1000,
    [switch]$ForceRebuild,
    [switch]$Signal
)

# Helper for conditional output
function Write-ProgressSignal($msg, $type = "status") {
    if ($Signal) { 
        @{ 
            type    = $type
            message = $msg
            time    = (Get-Date -UFormat "%Y-%m-%dT%H:%M:%SZ")
        } | ConvertTo-Json -Compress
    }
}

# --- Load Module ---
$modulePath = Join-Path $PSScriptRoot "LocalRagUtils\LocalRagUtils.psd1"
if (-not (Test-Path $modulePath)) {
    Write-Error "LocalRagUtils module not found at $modulePath"
    exit 1
}
Import-Module $modulePath -Force

# --- Initialize Components ---
if (-not $Signal) { Write-Host "Initializing RAG Components..." -ForegroundColor Cyan }
Write-ProgressSignal "CONNECTING"

$ollama = [OllamaClient]::new($OllamaUrl, $EmbeddingModel)

if (-not $ollama.IsAvailable()) {
    if ($Signal) { @{ error = "Ollama is not available" } | ConvertTo-Json -Compress; exit 1 }
    Write-Error "Ollama is not available at $OllamaUrl. Please start Ollama."
    exit 1
}

# Ensure Data Directory
$dataDir = Join-Path $PSScriptRoot "Data"
if (-not (Test-Path $dataDir)) { New-Item $dataDir -ItemType Directory -Force | Out-Null }

$store = [VectorStore]::new($dataDir, $CollectionName)
if (-not $ForceRebuild) {
    try {
        $store.Load()
    }
    catch {
        if (-not $Signal) { Write-Warning "  Could not load existing store: $_" }
    }
}

$chunker = [SmartTextChunker]::new($ChunkSize)

# --- Scan Files ---
if (-not (Test-Path $SourcePath)) {
    if ($Signal) { @{ error = "Source path does not exist: $SourcePath" } | ConvertTo-Json -Compress; exit 1 }
    Write-Error "Source path does not exist: $SourcePath"
    exit 1
}

Write-ProgressSignal "SCANNING"
if (-not $Signal) { Write-Host "`nScanning $SourcePath..." -ForegroundColor Cyan }

$files = Get-ChildItem -Path $SourcePath -Recurse -File -Include "*.md", "*.txt", "*.ps1", "*.xml"
if (-not $Signal) { Write-Host "Found $($files.Count) eligible files." }

# --- Processing Loop ---
$batchSize = 10
$processedCount = 0
$errorCount = 0

foreach ($file in $files) {
    try {
        Write-ProgressSignal "PROCESSING:$($file.Name)"
        if (-not $Signal) { Write-Host "Processing $($file.Name)..." -NoNewline }

        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($content)) { continue }

        # Remove existing entries for this file to prevent duplicates on re-ingestion
        $store.RemoveBySource($file.Name)
        
        # Use Smart Chunking
        $chunks = $chunker.SplitMarkdown($content)
        $chunkIndex = 0
        
        foreach ($smartChunk in $chunks) {
            $id = "$($file.Name)_$($chunkIndex)_$([guid]::NewGuid().ToString().Substring(0,8))"
            $embedding = $ollama.GetEmbedding($smartChunk.Text)
            
            if ($embedding.Count -gt 0) {
                $meta = @{
                    Source        = $file.FullName
                    FileName      = $file.Name
                    ChunkIndex    = $chunkIndex
                    TextPreview   = $smartChunk.Text.Substring(0, [Math]::Min(100, $smartChunk.Text.Length))
                    HeaderContext = $smartChunk.HeaderContext
                }
                $store.Add($id, $embedding, $meta)
            }
            $chunkIndex++
        }
        
        $processedCount++
        if (-not $Signal) { Write-Host " Done." -ForegroundColor Green }
        
        if ($processedCount % $batchSize -eq 0) {
            $store.Save()
        }
    }
    catch {
        if (-not $Signal) { Write-Host " Error: $_" -ForegroundColor Red }
        $errorCount++
    }
}

# Final Save
Write-ProgressSignal "SAVING"
$store.Save()

if ($Signal) {
    @{
        status    = "complete"
        processed = $processedCount
        total     = $store.Items.Count
        errors    = $errorCount
    } | ConvertTo-Json -Compress
}
else {
    Write-Host "`nIngestion Complete!" -ForegroundColor Cyan
    Write-Host "  Processed Files: $processedCount"
    Write-Host "  Total Vectors:   $($store.Items.Count)"
    Write-Host "  Errors:          $errorCount"
}

