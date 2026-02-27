# SourceManifest.ps1 - Tracks ingested source files for smart change detection
# Enables: content-hash skip, rename detection, orphan cleanup

class ManifestEntry {
    [string] $FileName
    [string] $SourcePath
    [string] $ContentHash
    [int]    $ChunkCount
    [long]   $FileSize
    [string] $LastIngested
    [string] $EmbeddingModel

    ManifestEntry() {}

    ManifestEntry([string]$fileName, [string]$sourcePath, [string]$contentHash,
        [int]$chunkCount, [long]$fileSize, [string]$embeddingModel) {
        $this.FileName = $fileName
        $this.SourcePath = $sourcePath
        $this.ContentHash = $contentHash
        $this.ChunkCount = $chunkCount
        $this.FileSize = $fileSize
        $this.LastIngested = (Get-Date).ToString("o")
        $this.EmbeddingModel = $embeddingModel
    }
}

class SourceManifest {
    [string] $CollectionPath
    [string] $CollectionName
    [System.Collections.Generic.Dictionary[string, ManifestEntry]] $Entries

    SourceManifest([string]$collectionPath, [string]$collectionName) {
        $this.CollectionPath = $collectionPath
        $this.CollectionName = $collectionName
        $this.Entries = [System.Collections.Generic.Dictionary[string, ManifestEntry]]::new(
            [System.StringComparer]::OrdinalIgnoreCase
        )
    }

    # --- Persistence ---

    [string] GetManifestPath() {
        return Join-Path $this.CollectionPath "$($this.CollectionName).manifest.json"
    }

    [void] Save() {
        $manifestPath = $this.GetManifestPath()
        $entryList = @()
        foreach ($entry in $this.Entries.Values) {
            $entryList += @{
                FileName       = $entry.FileName
                SourcePath     = $entry.SourcePath
                ContentHash    = $entry.ContentHash
                ChunkCount     = $entry.ChunkCount
                FileSize       = $entry.FileSize
                LastIngested   = $entry.LastIngested
                EmbeddingModel = $entry.EmbeddingModel
            }
        }

        $json = @{
            Version     = "1.0"
            Collection  = $this.CollectionName
            LastUpdated = (Get-Date).ToString("o")
            EntryCount  = $entryList.Count
            Entries     = $entryList
        } | ConvertTo-Json -Depth 5
        Set-Content -Path $manifestPath -Value $json
    }

    [void] Load() {
        $manifestPath = $this.GetManifestPath()
        if (-not (Test-Path $manifestPath)) { return }

        try {
            $json = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
            if ($null -eq $json -or $null -eq $json.Entries) { return }

            $this.Entries.Clear()
            foreach ($raw in $json.Entries) {
                $entry = [ManifestEntry]::new()
                $entry.FileName = $raw.FileName
                $entry.SourcePath = $raw.SourcePath
                $entry.ContentHash = $raw.ContentHash
                $entry.ChunkCount = [int]$raw.ChunkCount
                $entry.FileSize = [long]$raw.FileSize
                $entry.LastIngested = $raw.LastIngested
                $entry.EmbeddingModel = $raw.EmbeddingModel

                $this.Entries[$entry.FileName] = $entry
            }
        }
        catch {
            Write-Warning "Failed to load manifest: $($_.Exception.Message)"
        }
    }

    [void] Clear() {
        $this.Entries.Clear()
        $manifestPath = $this.GetManifestPath()
        if (Test-Path $manifestPath) {
            Remove-Item $manifestPath -Force
        }
    }

    # --- CRUD ---

    [ManifestEntry] GetEntry([string]$fileName) {
        if ($this.Entries.ContainsKey($fileName)) {
            return $this.Entries[$fileName]
        }
        return $null
    }

    [void] AddOrUpdate([string]$fileName, [string]$sourcePath, [string]$contentHash,
        [int]$chunkCount, [long]$fileSize, [string]$embeddingModel) {
        $entry = [ManifestEntry]::new($fileName, $sourcePath, $contentHash,
            $chunkCount, $fileSize, $embeddingModel)
        $this.Entries[$fileName] = $entry
    }

    [void] Remove([string]$fileName) {
        if ($this.Entries.ContainsKey($fileName)) {
            $this.Entries.Remove($fileName) | Out-Null
        }
    }

    # --- Smart Detection ---

    [ManifestEntry] FindByHash([string]$contentHash) {
        foreach ($entry in $this.Entries.Values) {
            if ($entry.ContentHash -eq $contentHash) {
                return $entry
            }
        }
        return $null
    }

    [string[]] GetOrphans([string[]]$currentFileNames) {
        $currentSet = [System.Collections.Generic.HashSet[string]]::new(
            [string[]]$currentFileNames,
            [System.StringComparer]::OrdinalIgnoreCase
        )
        $orphans = @()
        foreach ($fileName in $this.Entries.Keys) {
            if (-not $currentSet.Contains($fileName)) {
                $orphans += $fileName
            }
        }
        return $orphans
    }

    # --- Utilities ---

    [bool] IsUnchanged([string]$fileName, [string]$contentHash) {
        $entry = $this.GetEntry($fileName)
        if ($null -eq $entry) { return $false }
        return ($entry.ContentHash -eq $contentHash)
    }

    [int] Count() {
        return $this.Entries.Count
    }
}
