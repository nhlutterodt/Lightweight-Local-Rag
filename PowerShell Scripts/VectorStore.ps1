class VectorStoreItem {
    [string] $Id
    [hashtable] $Metadata
    [float[]] $Vector

    VectorStoreItem([string]$id, [float[]]$vector, [hashtable]$metadata) {
        $this.Id = $id
        $this.Vector = $vector
        $this.Metadata = $metadata
    }
}

class VectorStore {
    [string] $Name
    [string] $CollectionPath
    [System.Collections.Generic.List[VectorStoreItem]] $Items
    [int] $VectorDimension

    VectorStore([string]$collectionPath, [string]$name) {
        $this.CollectionPath = $collectionPath
        $this.Name = $name
        $this.Items = [System.Collections.Generic.List[VectorStoreItem]]::new()
        $this.VectorDimension = 0

        # Create directory if missing
        if (-not (Test-Path $this.CollectionPath)) {
            New-Item -Path $this.CollectionPath -ItemType Directory -Force | Out-Null
        }
    }

    [void] Add([string]$id, [float[]]$vector, [hashtable]$metadata) {
        if ($null -eq $vector -or $vector.Count -eq 0) {
            throw "Vector cannot be null or empty"
        }

        # Dimension check (Anti-Pattern Guard)
        if ($this.VectorDimension -eq 0) {
            if ($this.Items.Count -gt 0) {
                $this.VectorDimension = $this.Items[0].Vector.Length
            }
            else {
                $this.VectorDimension = $vector.Length
            }
        }

        if ($this.VectorDimension -ne 0 -and $vector.Length -ne $this.VectorDimension) {
            throw "Dimension Mismatch: Vector has $($vector.Length) dimensions, but store expects $($this.VectorDimension)."
        }

        $item = [VectorStoreItem]::new($id, $vector, $metadata)
        $this.Items.Add($item)
    }

    [void] Save() {
        $binPath = Join-Path $this.CollectionPath "$($this.Name).vectors.bin"
        $metaPath = Join-Path $this.CollectionPath "$($this.Name).metadata.json"

        # 1. Save Vectors to Binary
        # Format: [Int32 Count] [Int32 Dimension] [Float... All Data]
        $fs = [System.IO.File]::Create($binPath)
        $bw = [System.IO.BinaryWriter]::new($fs)
        try {
            $count = $this.Items.Count
            $dim = if ($count -gt 0) { $this.Items[0].Vector.Length } else { 0 }

            $bw.Write([int]$count)
            $bw.Write([int]$dim)

            foreach ($item in $this.Items) {
                # Verify dim consistency just in case
                if ($item.Vector.Length -ne $dim) {
                    throw "Critical Error: Found inconsistent vector length during save for ID $($item.Id)"
                }
                foreach ($val in $item.Vector) {
                    $bw.Write([float]$val)
                }
            }
        }
        finally {
            $bw.Close()
            $fs.Dispose()
        }

        # 2. Save Metadata to JSON
        # We strip the vector from the JSON object to keep it light
        $metaList = $this.Items | ForEach-Object {
            @{
                Id       = $_.Id
                Metadata = $_.Metadata
            }
        }
        $metaJson = $metaList | ConvertTo-Json -Depth 5 -Compress
        Set-Content -Path $metaPath -Value $metaJson
    }

    [void] Load() {
        $binPath = Join-Path $this.CollectionPath "$($this.Name).vectors.bin"
        $metaPath = Join-Path $this.CollectionPath "$($this.Name).metadata.json"

        if ((-not (Test-Path $binPath)) -or (-not (Test-Path $metaPath))) {
            return # Nothing to load
        }

        # 1. Load Metadata
        try {
            $jsonContent = Get-Content -Path $metaPath -Raw
            if ([string]::IsNullOrWhiteSpace($jsonContent)) { return }
            
            $metaList = $jsonContent | ConvertFrom-Json
            if ($null -eq $metaList) { return }
            
            # Ensure it's an array even if single item
            if (-not ($metaList -is [Array])) { $metaList = @($metaList) }
        }
        catch {
            Write-Warning "Failed to load metadata: $_"
            return
        }

        # 2. Load Vectors
        $fs = [System.IO.File]::OpenRead($binPath)
        $br = [System.IO.BinaryReader]::new($fs)
        try {
            $count = $br.ReadInt32()
            $dim = $br.ReadInt32()
            $this.VectorDimension = $dim

            if ($count -ne $metaList.Count) {
                Write-Warning "Data Corruption Warning: Vector count ($count) does not match metadata count ($($metaList.Count))"
                # Proceeding might be dangerous, but we'll try to load what matches
            }

            # Clear existing items before load
            $this.Items.Clear()

            for ($i = 0; $i -lt $count; $i++) {
                # Read vector
                $vec = New-Object float[] $dim
                for ($d = 0; $d -lt $dim; $d++) {
                    $vec[$d] = $br.ReadSingle()
                }

                # Match with metadata
                if ($i -lt $metaList.Count) {
                    $m = $metaList[$i]
                    # Convert PSCustomObject metadata back to hashtable
                    $metaHash = @{}
                    if ($m.Metadata -is [PSCustomObject]) {
                        foreach ($prop in $m.Metadata.PSObject.Properties) {
                            $metaHash[$prop.Name] = $prop.Value
                        }
                    }
                    elseif ($m.Metadata -is [System.Collections.IDictionary]) {
                        $metaHash = $m.Metadata
                    }
                    
                    $this.Items.Add([VectorStoreItem]::new($m.Id, $vec, $metaHash))
                }
            }
        }
        finally {
            $br.Close()
            $fs.Dispose()
        }
    }

    [void] RemoveBySource([string]$fileName) {
        $removed = $this.Items.RemoveAll({
                param($item)
                $item.Metadata -and $item.Metadata.ContainsKey("FileName") -and $item.Metadata["FileName"] -eq $fileName
            })
        if ($removed -gt 0) {
            Write-Verbose "Removed $removed items for source: $fileName"
        }
    }

    [PSCustomObject[]] FindNearest([float[]]$queryVector, [int]$k, [float]$minScore) {
        if ($this.Items.Count -eq 0) {
            return @()
        }

        # 1. Calculate all scores using C# accelerator
        $scores = New-Object float[] $this.Items.Count
        $validIndices = [System.Collections.Generic.List[int]]::new()

        for ($i = 0; $i -lt $this.Items.Count; $i++) {
            try {
                $score = [LocalRag.VectorMath]::CosineSimilarity($queryVector, $this.Items[$i].Vector)
                $scores[$i] = $score
                if ($score -ge $minScore) {
                    $validIndices.Add($i)
                }
            }
            catch {
                $scores[$i] = [float]-1.0
                Write-Warning "Math error on item $($this.Items[$i].Id): $_"
            }
        }

        if ($validIndices.Count -eq 0) {
            return @()
        }

        # 2. Build filtered score array for top-k selection
        $filteredScores = New-Object float[] $validIndices.Count
        for ($j = 0; $j -lt $validIndices.Count; $j++) {
            $filteredScores[$j] = $scores[$validIndices[$j]]
        }

        # 3. Use C# accelerator for top-k selection (avoids full Sort-Object pipeline)
        $topFilteredIndices = [LocalRag.VectorMath]::TopKIndices($filteredScores, $k)

        # 4. Map back to original items and build results
        $results = [System.Collections.Generic.List[PSCustomObject]]::new()
        foreach ($fi in $topFilteredIndices) {
            $originalIdx = $validIndices[$fi]
            $item = $this.Items[$originalIdx]
            $results.Add([PSCustomObject]@{
                    Id       = $item.Id
                    Score    = $scores[$originalIdx]
                    Metadata = $item.Metadata
                })
        }

        return $results.ToArray()
    }
}
