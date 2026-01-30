$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$docDir = Join-Path $scriptDir "..\docs"
$docPath = Join-Path $docDir "test_smart.md"

if (-not (Test-Path $docDir)) { New-Item $docDir -ItemType Directory -Force }

# 1. Create Test File
@"
# Main Title
Intro text.

## Subsection A
Deep knowledge here.
"@ | Set-Content $docPath

# 2. Run Ingestion
Write-Host "Ingesting..."
& "$scriptDir\Ingest-Documents.ps1" -SourcePath $docDir -CollectionName "SmartTest" -ForceRebuild

# 3. Verify Metadata
$dataDir = Join-Path $scriptDir "Data"
$metaPath = Join-Path $dataDir "SmartTest.metadata.json"

if (Test-Path $metaPath) {
    $json = Get-Content $metaPath -Raw | ConvertFrom-Json
    
    $found = $false
    foreach ($item in $json) {
        if ($item.Metadata.HeaderContext) {
            Write-Host "Found Metadata: $($item.Metadata.HeaderContext)"
            $found = $true
        }
    }
    
    if ($found) {
        Write-Host "SUCCESS: Smart Chunking Metadata Verified!" -ForegroundColor Green
    }
    else {
        Write-Error "FAILURE: No HeaderContext found in metadata."
    }
}
else {
    Write-Error "FAILURE: Metadata file not found."
}
