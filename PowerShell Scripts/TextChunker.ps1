class TextChunker {
    [int] $MaxChunkSize
    [int] $Overlap

    TextChunker() {
        $this.MaxChunkSize = 1000
        $this.Overlap = 200
    }

    TextChunker([int]$maxSize, [int]$overlap) {
        $this.MaxChunkSize = $maxSize
        $this.Overlap = $overlap
    }

    # Finds the last sentence boundary (.?!\n) within a window, or last space as fallback
    static [int] FindSentenceBoundary([string]$text, [int]$maxPos) {
        # Search backward from maxPos for sentence-ending punctuation or newline
        $searchStart = [Math]::Max(0, [int]($maxPos * 0.8))  # 20% tolerance window
        
        for ($i = $maxPos; $i -ge $searchStart; $i--) {
            $ch = $text[$i]
            if ($ch -eq '.' -or $ch -eq '?' -or $ch -eq '!' -or $ch -eq "`n") {
                return $i + 1  # Split AFTER the punctuation
            }
        }

        # No sentence boundary found — fall back to last space
        for ($i = $maxPos; $i -ge $searchStart; $i--) {
            if ($text[$i] -eq ' ') {
                return $i + 1
            }
        }

        # Absolute fallback: split at maxPos
        return $maxPos
    }

    # Estimates token count (approx 4 chars per token)
    static [int] EstimateTokens([string]$text) {
        if ([string]::IsNullOrEmpty($text)) { return 0 }
        return [int]($text.Length / 4)
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

            # If single paragraph exceeds MaxChunkSize, sentence-split it
            if ($para.Length -gt $this.MaxChunkSize) {
                # Flush pending content first
                if ($currentChunk.Length -gt 0) {
                    $chunks.Add($currentChunk.ToString())
                    $currentChunk.Clear()
                }

                # Sentence-aware splitting with overlap
                $start = 0
                while ($start -lt $para.Length) {
                    $remaining = $para.Length - $start
                    if ($remaining -le $this.MaxChunkSize) {
                        $chunks.Add($para.Substring($start))
                        break
                    }

                    $splitAt = [TextChunker]::FindSentenceBoundary($para, $start + $this.MaxChunkSize - 1)
                    # Clamp splitAt to be at least start+1 to avoid infinite loop
                    if ($splitAt -le $start) { $splitAt = $start + $this.MaxChunkSize }

                    $chunks.Add($para.Substring($start, $splitAt - $start))

                    # Apply overlap: step back by Overlap chars for next chunk
                    $start = [Math]::Max($start + 1, $splitAt - $this.Overlap)
                }
                continue
            }

            # If adding this paragraph exceeds max, emit current chunk
            if ($currentChunk.Length + $para.Length + 2 -gt $this.MaxChunkSize) {
                $emittedText = $currentChunk.ToString()
                $chunks.Add($emittedText)
                $currentChunk.Clear()

                # Overlap: carry forward the last Overlap chars as prefix
                if ($this.Overlap -gt 0 -and $emittedText.Length -gt $this.Overlap) {
                    $overlapText = $emittedText.Substring($emittedText.Length - $this.Overlap)
                    $currentChunk.Append($overlapText) | Out-Null
                    $currentChunk.Append("`n`n") | Out-Null
                }
            }

            if ($currentChunk.Length -gt 0 -and -not $currentChunk.ToString().EndsWith("`n`n")) {
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
