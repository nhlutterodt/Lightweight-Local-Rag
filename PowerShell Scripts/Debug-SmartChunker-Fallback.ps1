$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$utilsModule = Join-Path $scriptDir "LocalRagUtils\LocalRagUtils.psd1"
Import-Module $utilsModule -Force

try {
    Write-Host "Instantiating SmartTextChunker (Size=20)..."
    $chunker = [SmartTextChunker]::new(20)
    
    $markdown = @"
# Big Section
This is a very long paragraph that should certainly exceed the twenty character limit we set.

Short Para.
"@

    Write-Host "Running SplitMarkdown..."
    $chunks = $chunker.SplitMarkdown($markdown)
    
    Write-Host "Chunks Count: $($chunks.Count)"
    foreach ($c in $chunks) {
        Write-Host "Chunk: [$($c.HeaderContext)]"
        Write-Host "Text: '$($c.Text)'"
        Write-Host "---"
    }
}
catch {
    Write-Error "Detailed Error: $_"
    Write-Error "Line: $($_.InvocationInfo.ScriptLineNumber)"
    Write-Error "Offset: $($_.InvocationInfo.OffsetInLine)"
    Write-Error "StackTrace: $($_.ScriptStackTrace)"
}
