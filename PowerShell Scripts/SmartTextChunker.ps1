class SmartChunk {
    [string] $Text
    [string] $HeaderContext
    [int] $Level
}

class SmartTextChunker {
    [int] $MaxChunkSize
    [int] $Overlap

    SmartTextChunker([int]$maxSize) {
        $this.MaxChunkSize = $maxSize
        $this.Overlap = 200  # Default; callers can override via property
    }

    SmartTextChunker([int]$maxSize, [int]$overlap) {
        $this.MaxChunkSize = $maxSize
        $this.Overlap = $overlap
    }

    # --- Token Estimation ---
    static [int] EstimateTokens([string]$text) {
        if ([string]::IsNullOrEmpty($text)) { return 0 }
        return [int]($text.Length / 4)
    }

    # --- Sentence Boundary Detection ---
    # Scans backward from maxPos to find a sentence-ending character (.?!\n),
    # or falls back to last space. Prevents mid-word/mid-sentence cuts.
    static [int] FindSentenceBoundary([string]$text, [int]$maxPos) {
        $searchStart = [Math]::Max(0, [int]($maxPos * 0.8))  # 20% tolerance window
        
        for ($i = $maxPos; $i -ge $searchStart; $i--) {
            $ch = $text[$i]
            if ($ch -eq '.' -or $ch -eq '?' -or $ch -eq '!' -or $ch -eq "`n") {
                return $i + 1
            }
        }

        # Fallback: last space
        for ($i = $maxPos; $i -ge $searchStart; $i--) {
            if ($text[$i] -eq ' ') {
                return ($i + 1)
            }
        }

        return $maxPos
    }

    # --- File-Type Dispatching ---
    # Routes content to the appropriate chunking strategy based on file extension.
    [SmartChunk[]] DispatchByExtension([string]$filePath, [string]$content) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $fileName = [System.IO.Path]::GetFileName($filePath)

        switch ($ext) {
            { $_ -in '.ps1', '.psm1' } {
                return $this.SplitPowerShell($content, $fileName)
            }
            '.xml' {
                return $this.SplitXml($content, $fileName)
            }
            '.md' {
                return $this.SplitMarkdown($content)
            }
            default {
                # .txt and all others — paragraph-split
                return $this.SplitPlainText($content, $fileName)
            }
        }
        # Unreachable — default branch covers all cases — but satisfies linter
        return $this.SplitPlainText($content, $fileName)
    }

    # --- PowerShell Code Chunker ---
    # Splits on top-level function/filter/class keyword boundaries.
    [SmartChunk[]] SplitPowerShell([string]$content, [string]$fileName) {
        if ([string]::IsNullOrWhiteSpace($content)) { return @() }
        $content = $content -replace "`r`n", "`n"
        
        $chunks = [System.Collections.Generic.List[SmartChunk]]::new()
        
        # Match top-level function/filter/class declarations
        $pattern = '(?m)^(function|filter|class)\s+'
        $functionMatches = [regex]::Matches($content, $pattern)
        
        if ($functionMatches.Count -eq 0) {
            # No function boundaries found — fall back to plain text
            return $this.SplitPlainText($content, $fileName)
        }

        # Capture any content before the first function (imports, comments, etc.)
        if ($functionMatches[0].Index -gt 0) {
            $preamble = $content.Substring(0, $functionMatches[0].Index).Trim()
            if ($preamble.Length -gt 0) {
                $this.ProcessSection($preamble, "$fileName > Preamble", $chunks)
            }
        }

        # Each function boundary to the next
        for ($i = 0; $i -lt $functionMatches.Count; $i++) {
            $start = $functionMatches[$i].Index
            $end = if ($i + 1 -lt $functionMatches.Count) { $functionMatches[$i + 1].Index } else { $content.Length }
            $section = $content.Substring($start, $end - $start).Trim()

            # Extract function name for context
            $nameMatch = [regex]::Match($section, '(?m)^(?:function|filter|class)\s+([^\s{(]+)')
            $funcName = if ($nameMatch.Success) { $nameMatch.Groups[1].Value } else { "Block_$i" }
            $context = "$fileName > $funcName"

            $this.ProcessSection($section, $context, $chunks)
        }

        return $chunks.ToArray()
    }

    # --- XML Chunker ---
    # Splits on top-level element boundaries.
    [SmartChunk[]] SplitXml([string]$content, [string]$fileName) {
        if ([string]::IsNullOrWhiteSpace($content)) { return @() }
        $content = $content -replace "`r`n", "`n"

        $chunks = [System.Collections.Generic.List[SmartChunk]]::new()

        # Match closing tags of top-level elements (simple heuristic)
        $pattern = '</(\w+)>'
        $tagMatches = [regex]::Matches($content, $pattern)

        if ($tagMatches.Count -le 1) {
            # Single root element or no structure — treat as plain text
            return $this.SplitPlainText($content, $fileName)
        }

        $lastEnd = 0
        foreach ($m in $tagMatches) {
            $elementEnd = $m.Index + $m.Length
            $section = $content.Substring($lastEnd, $elementEnd - $lastEnd).Trim()

            if ($section.Length -gt 0) {
                $context = "$fileName > <$($m.Groups[1].Value)>"
                $this.ProcessSection($section, $context, $chunks)
            }
            $lastEnd = $elementEnd
        }

        # Any trailing content after last closing tag
        if ($lastEnd -lt $content.Length) {
            $trailing = $content.Substring($lastEnd).Trim()
            if ($trailing.Length -gt 0) {
                $this.ProcessSection($trailing, "$fileName > Trailing", $chunks)
            }
        }

        return $chunks.ToArray()
    }

    # --- Plain Text Chunker ---
    # Paragraph-split for .txt and unknown file types.
    [SmartChunk[]] SplitPlainText([string]$content, [string]$fileName) {
        if ([string]::IsNullOrWhiteSpace($content)) { return @() }
        $content = $content -replace "`r`n", "`n"

        $chunks = [System.Collections.Generic.List[SmartChunk]]::new()
        $this.ProcessSection($content, $fileName, $chunks)
        return $chunks.ToArray()
    }

    # --- Markdown Chunker (original, enhanced) ---
    [SmartChunk[]] SplitMarkdown([string]$text) {
        if ([string]::IsNullOrWhiteSpace($text)) {
            return @()
        }

        $text = $text -replace "`r`n", "`n"
        
        $chunks = [System.Collections.Generic.List[SmartChunk]]::new()
        
        $headerRegex = "(?m)^(#+)\s+(.*)$"
        $parts = $text -split $headerRegex
        
        $headerStack = [System.Collections.Generic.List[psobject]]::new()
        
        # Initial chunk (pre-header)
        if (-not [string]::IsNullOrWhiteSpace($parts[0])) {
            $this.ProcessSection($parts[0], "Introduction", $chunks)
        }
        
        $k = 1
        while ($k -lt $parts.Count) {
            if ($k + 2 -ge $parts.Count) { break }
             
            $hashes = $parts[$k]
            $titleText = $parts[$k + 1].Trim()
            $bodyText = $parts[$k + 2]
             
            $level = $hashes.Length
             
            # Adjust stack
            while ($headerStack.Count -gt 0) {
                $last = $headerStack[$headerStack.Count - 1]
                if ($last.Level -ge $level) {
                    $headerStack.RemoveAt($headerStack.Count - 1)
                }
                else {
                    break
                }
            }
             
            $headerStack.Add([pscustomobject]@{ Level = $level; Title = $titleText })
             
            # Build path string
            $pathStr = ($headerStack | Select-Object -ExpandProperty Title) -join " > "
             
            $finalText = "$hashes $titleText`n$bodyText"
             
            $this.ProcessSection($finalText, $pathStr, $chunks)
             
            $k += 3
        }
        
        return $chunks.ToArray()
    }

    # --- Core Section Processor (with overlap + sentence-aware splitting) ---
    [void] ProcessSection([string]$text, [string]$context, [System.Collections.Generic.List[SmartChunk]]$chunks) {
        $text = $text.Trim()
        if ([string]::IsNullOrWhiteSpace($text)) { return }
        
        # Fits in one chunk — emit directly
        if ($text.Length -le $this.MaxChunkSize) {
            $c = [SmartChunk]::new()
            $c.Text = $text
            $c.HeaderContext = $context
            $chunks.Add($c)
            return
        }

        # Section exceeds MaxChunkSize — split with sentence-awareness and overlap
        $paragraphs = $text -split "`n`n+"
        $current = [System.Text.StringBuilder]::new()
         
        foreach ($para in $paragraphs) {
            $para = $para.Trim()
            if ([string]::IsNullOrWhiteSpace($para)) { continue }

            if ($current.Length + $para.Length + 2 -gt $this.MaxChunkSize) {
                # Emit current chunk if non-empty
                if ($current.Length -gt 0) {
                    $emittedText = $current.ToString()
                    $c = [SmartChunk]::new()
                    $c.Text = $emittedText
                    $c.HeaderContext = $context
                    $chunks.Add($c)
                    $current.Clear()

                    # Overlap: carry forward last Overlap chars as prefix for next chunk
                    if ($this.Overlap -gt 0 -and $emittedText.Length -gt $this.Overlap) {
                        $overlapText = $emittedText.Substring($emittedText.Length - $this.Overlap)
                        $current.Append($overlapText) | Out-Null
                        $current.Append("`n`n") | Out-Null
                    }
                }

                # If single paragraph is still too large, sentence-split it
                if ($para.Length -gt $this.MaxChunkSize) {
                    $start = 0
                    while ($start -lt $para.Length) {
                        $remaining = $para.Length - $start
                        if ($remaining -le $this.MaxChunkSize) {
                            # Last piece fits as-is
                            if ($current.Length -gt 0) { $current.Append("`n`n") | Out-Null }
                            $current.Append($para.Substring($start)) | Out-Null
                            break
                        }

                        $splitAt = [SmartTextChunker]::FindSentenceBoundary($para, $start + $this.MaxChunkSize - 1)
                        if ($splitAt -le $start) { $splitAt = $start + $this.MaxChunkSize }

                        $sub = [SmartChunk]::new()
                        $sub.Text = $para.Substring($start, $splitAt - $start)
                        $sub.HeaderContext = $context
                        $chunks.Add($sub)

                        # Overlap for sentence-split pieces
                        $start = [Math]::Max($start + 1, $splitAt - $this.Overlap)
                    }
                    continue
                }
            }

            if ($current.Length -gt 0) { $current.Append("`n`n") | Out-Null }
            $current.Append($para) | Out-Null
        }

        if ($current.Length -gt 0) {
            $c = [SmartChunk]::new()
            $c.Text = $current.ToString()
            $c.HeaderContext = $context
            $chunks.Add($c)
        }
    }
}
