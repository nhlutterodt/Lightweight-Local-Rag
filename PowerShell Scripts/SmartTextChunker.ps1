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
        $this.Overlap = 0 # Strict semantic boundaries usually don't need overlap
    }

    [SmartChunk[]] SplitMarkdown([string]$text) {
        if ([string]::IsNullOrWhiteSpace($text)) {
            return @()
        }

        # Normalize line endings
        $text = $text -replace "`r`n", "`n"
        
        $chunks = [System.Collections.Generic.List[SmartChunk]]::new()
        
        # Regex to find headers
        # Matches: # Header
        # Group 1: hashes
        # Group 2: title
        $headerRegex = "(?m)^(#+)\s+(.*)$"
        
        # Split text by regex but keep delimiters? PowerShel -split with capture groups keeps delimiters!
        # When result of split contains capture groups, they are included in the array.
        $parts = $text -split $headerRegex
        
        # Structure of $parts:
        # [0] Pre-header text (introduction)
        # [1] Header hashes (delimiter)
        # [2] Header title (capture)
        # [3] Body text
        
        $headerStack = [System.Collections.Generic.List[psobject]]::new()
        
        # Initial chunk (pre-header)
        if (-not [string]::IsNullOrWhiteSpace($parts[0])) {
            $this.ProcessSection($parts[0], "Introduction", $chunks)
        }
        
        $k = 1
        while ($k -lt $parts.Count) {
            # -split might produce empty trailing entries
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
            $path = ($headerStack | Select-Object -ExpandProperty Title) -join " > "
             
            # Append title to body text for embedding context? 
            # Or keep distinct? 
            # Usually appending title is good: "# Title\nBody"
            $finalText = "$hashes $titleText`n$bodyText"
             
            $this.ProcessSection($finalText, $path, $chunks)
             
            $k += 3
        }
        
        return $chunks.ToArray()
    }

    [void] ProcessSection([string]$text, [string]$context, [System.Collections.Generic.List[SmartChunk]]$chunks) {
        $text = $text.Trim()
        if ([string]::IsNullOrWhiteSpace($text)) { return }
        
        # Recursion/Fallback: If text is huge, use Paragraph splitting
        if ($text.Length -gt $this.MaxChunkSize) {
            # Fallback to paragraph splitting within this section
            # We can reuse basic logic.
            $paragraphs = $text -split "`n`n+"
            $current = [System.Text.StringBuilder]::new()
             
            foreach ($para in $paragraphs) {
                if ($current.Length + $para.Length + 2 -gt $this.MaxChunkSize) {
                    if ($current.Length -gt 0) {
                        $c = [SmartChunk]::new()
                        $c.Text = $current.ToString()
                        $c.HeaderContext = $context
                        $chunks.Add($c)
                        $current.Clear()
                    }
                    # If single para is huge, slice it
                    if ($para.Length -gt $this.MaxChunkSize) {
                        $start = 0
                        while ($start -lt $para.Length) {
                            $len = [Math]::Min($this.MaxChunkSize, $para.Length - $start)
                            $sub = [SmartChunk]::new()
                            $sub.Text = $para.Substring($start, $len)
                            $sub.HeaderContext = $context
                            $chunks.Add($sub)
                            $start += $len
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
        else {
            # Fits in one chunk
            $c = [SmartChunk]::new()
            $c.Text = $text
            $c.HeaderContext = $context
            $chunks.Add($c)
        }
    }
}
