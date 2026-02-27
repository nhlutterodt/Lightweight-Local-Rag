# Query-Rag.ps1
# CLI tool for performing semantic search against ingested documents.

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Query,

    [string]$CollectionName = "ProjectDocs",
    
    [int]$TopK = 0,
    
    [float]$MinScore = -1.0,
    
    [string]$OllamaUrl,
    [string]$EmbeddingModel,
    
    [switch]$Json
)

# --- Load Config ---
$configPath = Join-Path $PSScriptRoot "..\config\project-config.psd1"
$Config = if (Test-Path $configPath) { Import-LocalizedData -BaseDirectory (Split-Path $configPath) -FileName (Split-Path $configPath -Leaf) } else { @{} }

# Apply config defaults if not overridden
if ($TopK -eq 0) { $TopK = $Config.RAG.TopK }
if ($MinScore -eq -1.0) { $MinScore = $Config.RAG.MinScore }
if ([string]::IsNullOrEmpty($OllamaUrl)) { $OllamaUrl = $Config.RAG.OllamaUrl }
if ([string]::IsNullOrEmpty($EmbeddingModel)) { $EmbeddingModel = $Config.RAG.EmbeddingModel }

# --- Load Module ---
$modulePath = Join-Path $PSScriptRoot "LocalRagUtils\LocalRagUtils.psd1"
if (-not (Test-Path $modulePath)) {
    Write-Error "LocalRagUtils module not found at $modulePath"
    exit 1
}
Import-Module $modulePath -Force

# --- Initialize ---
$dataDir = Join-Path $PSScriptRoot "Data"
if (-not (Test-Path $dataDir)) {
    Write-Error "Data directory not found ($dataDir). Please run Ingest-Documents.ps1 first."
    exit 1
}

$store = [VectorStore]::new($dataDir, $CollectionName)
try {
    $store.Load()
}
catch {
    Write-Error "Failed to load collection '$CollectionName': $_"
    exit 1
}

if ($store.Items.Count -eq 0) {
    Write-Warning "Collection '$CollectionName' is empty."
    exit
}

# --- Pre-flight Model Validation ---
if ($store.EmbeddingModel -and $store.EmbeddingModel -ne $EmbeddingModel) {
    throw "Embedding model mismatch: store='$($store.EmbeddingModel)', config='$EmbeddingModel'. Re-ingest or correct project-config.psd1."
}

$ollama = [OllamaClient]::new($OllamaUrl, $EmbeddingModel)
if (-not $ollama.IsAvailable()) {
    Write-Error "Ollama is not available at $OllamaUrl"
    exit 1
}

# --- Execute Search ---
if (-not $Json) { Write-Host "Generating embedding for query..." -ForegroundColor Cyan }
if ($Json) { @{ type = "status"; message = "🔍 Generating query embedding..." } | ConvertTo-Json -Compress }

try {
    $queryVec = $ollama.GetEmbedding($Query)
}
catch {
    if ($Json) { @{ error = "Failed to generate embedding: $_" } | ConvertTo-Json -Compress; exit 1 }
    Write-Error "Failed to generate embedding: $_"
    exit 1
}

if (-not $Json) { Write-Host "Searching $($store.Items.Count) documents..." -ForegroundColor Cyan }
if ($Json) { @{ type = "status"; message = "📁 Searching vector store..." } | ConvertTo-Json -Compress }

$results = $store.FindNearest($queryVec, $TopK, $MinScore, $EmbeddingModel)

# --- Output ---
if ($Json) {
    if ($Json) { @{ type = "status"; message = "🧠 Synthesizing response..." } | ConvertTo-Json -Compress }
    $output = @{
        Query   = $Query
        Count   = $results.Count
        Results = $results | ForEach-Object {
            @{
                Score       = [Math]::Round($_.Score, 4)
                FileName    = $_.Metadata["FileName"]
                ChunkText   = if ($_.Metadata["ChunkText"]) { $_.Metadata["ChunkText"] } else { $_.Metadata["TextPreview"] }
                TextPreview = $_.Metadata["TextPreview"]
            }
        }
    }
    $output | ConvertTo-Json -Depth 5 -Compress
}
else {
    if ($results.Count -eq 0) {
        Write-Warning "No result found with score >= $MinScore"
    }
    else {
        Write-Host "`nTop $($results.Count) Results:`n" -ForegroundColor Green
        
        foreach ($res in $results) {
            $score = [Math]::Round($res.Score, 4)
            $file = $res.Metadata["FileName"]
            $text = $res.Metadata["TextPreview"]
            
            Write-Host "[$score] $file" -ForegroundColor Yellow
            Write-Host "  $text..." -ForegroundColor Gray
            Write-Host ""
        }
    }
}
