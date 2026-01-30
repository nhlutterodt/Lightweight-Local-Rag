$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$utilsModule = Join-Path $scriptDir "LocalRagUtils\LocalRagUtils.psd1"
Import-Module $utilsModule -Force

try {
    Write-Host "Instantiating SmartTextChunker..."
    $chunker = [SmartTextChunker]::new(1000)
    
    $markdown = @"
# Header 1
Content 1
# Header 2
Content 2
"@

    Write-Host "Running SplitMarkdown..."
    $chunks = $chunker.SplitMarkdown($markdown)
    
    Write-Host "Chunks Count: $($chunks.Count)"
    foreach ($c in $chunks) {
        Write-Host "Chunk: [$($c.HeaderContext)]"
        Write-Host "Text: $($c.Text)"
        Write-Host "---"
    }
}
catch {
    Write-Error "Detailed Error: $_"
    Write-Error "Line: $($_.InvocationInfo.ScriptLineNumber)"
    Write-Error "Offset: $($_.InvocationInfo.OffsetInLine)"
    Write-Error "StackTrace: $($_.ScriptStackTrace)"
}
