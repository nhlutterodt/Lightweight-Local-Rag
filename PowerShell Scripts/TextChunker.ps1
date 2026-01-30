class TextChunker {
    [int] $MaxChunkSize
    [int] $Overlap

    TextChunker() {
        $this.MaxChunkSize = 1000
        $this.Overlap = 100
    }

    TextChunker([int]$maxSize, [int]$overlap) {
        $this.MaxChunkSize = $maxSize
        $this.Overlap = $overlap
    }

    [string[]] SplitText([string]$text) {
        if ([string]::IsNullOrWhiteSpace($text)) {
            return @()
        }

        # Normalize line endings
        $text = $text -replace "`r`n", "`n"

        # Split by double newline (paragraphs)
        $paragraphs = $text -split "`n`n+"
        
        $chunks = [System.Collections.Generic.List[string]]::new()
        $currentChunk = [System.Text.StringBuilder]::new()

        foreach ($para in $paragraphs) {
            $para = $para.Trim()
            if ([string]::IsNullOrWhiteSpace($para)) { continue }

            # If single paragraph is HUGE, we must force split it (fallback)
            if ($para.Length -gt $this.MaxChunkSize) {
                # If we have pending content, dump it first
                if ($currentChunk.Length -gt 0) {
                    $chunks.Add($currentChunk.ToString())
                    $currentChunk.Clear()
                }
                
                # Recursive strict split or simple slice? 
                # For v1, let's keep it simple: Add as is (oversized) or just slice?
                # Let's slice it roughly
                $start = 0
                while ($start -lt $para.Length) {
                    $len = [Math]::Min($this.MaxChunkSize, $para.Length - $start)
                    $chunks.Add($para.Substring($start, $len))
                    $start += $len # No overlap logic for sub-paragraph force split yet
                }
                continue
            }

            # If adding this paragraph exceeds max, verify current chunk
            if ($currentChunk.Length + $para.Length + 2 -gt $this.MaxChunkSize) {
                $chunks.Add($currentChunk.ToString())
                $currentChunk.Clear()
                
                # Overlap logic could go here (keeping last N chars), but strict paragraph boundaries are often cleaner
            }

            if ($currentChunk.Length -gt 0) {
                $currentChunk.Append("`n`n") | Out-Null
            }
            $currentChunk.Append($para) | Out-Null
        }

        # Add remaining
        if ($currentChunk.Length -gt 0) {
            $chunks.Add($currentChunk.ToString())
        }

        return $chunks.ToArray()
    }
}
