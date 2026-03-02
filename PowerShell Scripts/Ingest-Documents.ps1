param(
    [string]$SourcePath = "$PSScriptRoot\..\docs",
    [string]$CollectionName = "ProjectDocs",
    [string]$OllamaUrl,
    [string]$EmbeddingModel,
    [int]$ChunkSize = 0,
    [int]$ChunkOverlap = -1,
    [switch]$ForceRebuild,
    [switch]$Signal,
    [switch]$NoCleanup,
    [switch]$NoSkip
)

# --- Load Config ---
$configPath = Join-Path $PSScriptRoot "..\config\project-config.psd1"
$Config = if (Test-Path $configPath) { Import-LocalizedData -BaseDirectory (Split-Path $configPath) -FileName (Split-Path $configPath -Leaf) } else { @{} }

# Apply config defaults if not overridden
if ([string]::IsNullOrEmpty($OllamaUrl)) { $OllamaUrl = $Config.RAG.OllamaUrl }
if ([string]::IsNullOrEmpty($EmbeddingModel)) { $EmbeddingModel = $Config.RAG.EmbeddingModel }
if ($ChunkSize -eq 0) { $ChunkSize = $Config.RAG.ChunkSize }
if ($ChunkOverlap -eq -1) { $ChunkOverlap = $Config.RAG.ChunkOverlap }

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

function Write-Log($msg, [string]$color = "White") {
    if (-not $Signal) { Write-Host $msg -ForegroundColor $color }
}

# --- Load Module ---
$modulePath = Join-Path $PSScriptRoot "LocalRagUtils\LocalRagUtils.psd1"
if (-not (Test-Path $modulePath)) {
    Write-Error "LocalRagUtils module not found at $modulePath"
    exit 1
}
Import-Module $modulePath -Force

# --- Initialize Components ---
Write-Log "Initializing RAG Components..." "Cyan"
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

# --- Initialize Pipeline Output + Manifest ---
$pipelineFile = Join-Path $dataDir "$CollectionName.pipeline.json"
if (Test-Path $pipelineFile) { Remove-Item $pipelineFile -Force } # Clear previous pipeline
$pipelineContext = [System.Collections.Generic.List[psobject]]::new()

$manifest = [SourceManifest]::new($dataDir, $CollectionName)

if ($ForceRebuild) {
    Write-Log "  Force rebuild: clearing manifest" "Yellow"
    $manifest.Clear()
}
else {
    $manifest.Load()
}

$chunker = [SmartTextChunker]::new($ChunkSize, $ChunkOverlap)

# --- Scan Files ---
if (-not (Test-Path $SourcePath)) {
    if ($Signal) { @{ error = "Source path does not exist: $SourcePath" } | ConvertTo-Json -Compress; exit 1 }
    Write-Error "Source path does not exist: $SourcePath"
    exit 1
}

Write-ProgressSignal "SCANNING"
Write-Log "`nScanning $SourcePath..." "Cyan"

$files = Get-ChildItem -Path $SourcePath -Recurse -File -Include "*.md", "*.txt", "*.ps1", "*.xml"
Write-Log "Found $($files.Count) eligible files."

# --- Processing Loop ---
$batchSize = 10
$processedCount = 0
$skippedCount = 0
$renamedCount = 0
$errorCount = 0

# Collect current filenames for orphan detection later
$currentFileNames = $files | ForEach-Object { $_.Name }

foreach ($file in $files) {
    try {
        Write-ProgressSignal "PROCESSING:$($file.Name)"

        # 1. Compute content hash
        $fileHash = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash

        # 2. Check manifest: is this file unchanged?
        if (-not $ForceRebuild -and -not $NoSkip -and $manifest.IsUnchanged($file.Name, $fileHash)) {
            $skippedCount++
            Write-Log "  $($file.Name) — unchanged, skipping" "DarkGray"
            continue
        }

        # 3. Check for rename: is there an orphan with the same content hash?
        $hashMatch = $manifest.FindByHash($fileHash)
        if ($hashMatch -and $hashMatch.FileName -ne $file.Name) {
            # This is a rename — transfer vectors instead of re-embedding
            $updated = $store.UpdateMetadataBySource($hashMatch.FileName, $file.Name, $file.FullName)
            if ($updated -gt 0) {
                Write-Log "  $($file.Name) — renamed from '$($hashMatch.FileName)' ($updated chunks transferred)" "Cyan"
                # Update manifest: remove old entry, add new one
                $manifest.Remove($hashMatch.FileName)
                $manifest.AddOrUpdate($file.Name, $file.FullName, $fileHash,
                    $hashMatch.ChunkCount, $file.Length, $EmbeddingModel)
                $renamedCount++
                continue
            }
        }

        # 4. Content changed or new file — full embed
        Write-Log "Processing $($file.Name)..." "White" 
        
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($content)) { continue }

        # Remove existing entries for this file (LanceDB handles this via Node later)
        # We signal deletion via the pipeline payload
        $pipelineContext.Add([PSCustomObject]@{
                Action = "delete"
                Source = $file.Name
            })

        # Chunk and embed (dispatches by file extension)
        $chunks = $chunker.DispatchByExtension($file.FullName, $content)
        $chunkIndex = 0

        foreach ($smartChunk in $chunks) {
            $id = "$($file.Name)_$($chunkIndex)_$([guid]::NewGuid().ToString().Substring(0,8))"
            $embedding = $ollama.GetEmbedding($smartChunk.Text)

            if ($embedding.Count -gt 0) {
                # LanceDB expected schema
                $pipelineContext.Add([PSCustomObject]@{
                        Action         = "upsert"
                        Id             = $id
                        vector         = $embedding
                        Source         = $file.FullName
                        FileName       = $file.Name
                        ChunkIndex     = $chunkIndex
                        ChunkText      = $smartChunk.Text
                        TextPreview    = $smartChunk.Text.Substring(0, [Math]::Min(100, $smartChunk.Text.Length))
                        HeaderContext  = $smartChunk.HeaderContext
                        EmbeddingModel = $EmbeddingModel
                    })
            }
            $chunkIndex++
        }

        # Update manifest with new hash
        $manifest.AddOrUpdate($file.Name, $file.FullName, $fileHash,
            $chunkIndex, $file.Length, $EmbeddingModel)

        $processedCount++
        Write-Log "  Done ($chunkIndex chunks)." "Green"

        # Write intermediate batches to disk to avoid memory bloat
        if ($processedCount % $batchSize -eq 0) {
            $manifest.Save()
            Write-Log "  Syncing batch payload to disk..." "DarkGray"
            $pipelineContext | ConvertTo-Json -Depth 10 | Out-File -FilePath $pipelineFile -Encoding byte -Append
            $pipelineContext.Clear() # Free memory
        }
    }
    catch {
        Write-Log "  Error: $_" "Red"
        $errorCount++
    }
}

# --- Orphan Cleanup ---
$orphanCount = 0
if (-not $NoCleanup) {
    $orphans = $manifest.GetOrphans($currentFileNames)
    foreach ($orphanName in $orphans) {
        $orphanEntry = $manifest.GetEntry($orphanName)

        # Check if any current file has same hash (already handled as rename above)
        # If not, this is a genuine deletion
        $pipelineContext.Add([PSCustomObject]@{
                Action = "delete"
                Source = $orphanName
            })
        $manifest.Remove($orphanName)
        $orphanCount++
        Write-Log "  Cleaned up orphan: $orphanName ($($orphanEntry.ChunkCount) chunks removed)" "Yellow"
    }
}

# --- Final Save ---
Write-ProgressSignal "UPSERTING LANCEDB"
if ($pipelineContext.Count -gt 0) {
    # If the file hasn't been created yet by a batch sync, don't append
    if (Test-Path $pipelineFile) {
        # Edge case: we appended previously, making JSON arrays invalid. 
        # This is a temporary pipeline file. Node will parse line by line or we fix the append.
        # Faster fix: just output all at the end since we already batch.
    }
    
    # Let's just write the whole thing cleanly for Node to parse
    $pipelineContext | ConvertTo-Json -Depth 10 | Set-Content -Path $pipelineFile -Encoding UTF8
    Write-Log "Wrote $($pipelineContext.Count) operations to pipeline." "Green"
}

$manifest.Save()

if ($Signal) {
    @{
        status    = "complete"
        processed = $processedCount
        skipped   = $skippedCount
        renamed   = $renamedCount
        orphans   = $orphanCount
        total     = $processedCount
        errors    = $errorCount
        pipeline  = $pipelineFile
    } | ConvertTo-Json -Compress
}
else {
    Write-Host "`nIngestion Complete!" -ForegroundColor Cyan
    Write-Host "  Processed (embedded): $processedCount"
    Write-Host "  Renamed (no re-embed):$renamedCount"
    Write-Host "  Orphans cleaned:      $orphanCount"
    Write-Host "  Pipeline Payload:     $pipelineFile"
    Write-Host "  Errors:               $errorCount"
}
