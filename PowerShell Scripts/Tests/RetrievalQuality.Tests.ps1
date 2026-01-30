$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$utilsModule = Join-Path $scriptDir "..\LocalRagUtils\LocalRagUtils.psd1"
Import-Module $utilsModule -Force

# Validating paths and setup at Global Scope (nuclear option for Pester 5)
$Global:scriptDir = $PSScriptRoot
$Global:testDir = Join-Path $Global:scriptDir "Data"
$Global:goldenSetDir = Join-Path $Global:testDir "GoldenSet"
$Global:collectionName = "GoldenTest"
$Global:queryScript = Join-Path $Global:scriptDir "..\Query-Rag.ps1"
$Global:ingestScript = Join-Path $Global:scriptDir "..\Ingest-Documents.ps1"

Write-Host "Setting up Golden Set at $Global:goldenSetDir..."
if (-not (Test-Path $Global:testDir)) {
    New-Item $Global:testDir -ItemType Directory -Force | Out-Null
}
if (Test-Path $Global:goldenSetDir) { Remove-Item $Global:goldenSetDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item $Global:goldenSetDir -ItemType Directory -Force | Out-Null
    
Set-Content -Path "$Global:goldenSetDir\fact_mars.txt" -Value "The capital city of Mars is Olympus City. It is located near the volcano on the Red Planet."
Set-Content -Path "$Global:goldenSetDir\fact_code.txt" -Value "The secret code for the vault is 884422."
Set-Content -Path "$Global:goldenSetDir\distractor.txt" -Value "Earth has many cities. The moon has none."
Write-Host "Golden Set Setup Complete."

Describe "Integration: Retrieval Quality (Golden Set)" {
    
    Context "Ingestion" {
        It "Should ingest the Golden Set without errors" {
            # Run Ingestion
            $output = & $Global:ingestScript -SourcePath $Global:goldenSetDir -CollectionName $Global:collectionName -ForceRebuild -Signal 2>&1
            $outputString = $output | Out-String
            
            # Check for JSON success success
            $outputString | Should -Match '"errors":0' -Because $outputString
            $outputString | Should -Match '"status":"complete"'
        }
    }

    Context "Retrieval Accuracy" {
        It "Should retrieve 'Olympus City' when querying for Mars capital" {
            $results = & $Global:queryScript -Query "What is the capital of Mars?" -CollectionName $Global:collectionName -Json
            
            # Parse JSON output (filter for non-status objects if needed, but Query-Rag -Json usually outputs clean signals or result objects)
            # The script outputs stream of JSON objects. The final one usually is the result set? 
            # Or we look for type='status' vs default.
            
            # Let's filter for text containing "Olympus City" in the output stream to be robust against stream formatting
            $combinedOutput = $results | Out-String
            $combinedOutput | Should -Match "Olympus City"
            $combinedOutput | Should -Match "fact_mars.txt"
        }

        It "Should retrieve '884422' when querying for the vault code" {
            $results = & $Global:queryScript -Query "What is the vault code?" -CollectionName $Global:collectionName -Json
            
            $combinedOutput = $results | Out-String
            $combinedOutput | Should -Match "884422"
            $combinedOutput | Should -Match "fact_code.txt"
        }
        
        It "Should retrieve 'fact_mars' (and not fact_code) when querying 'Olympus'" {
            $results = & $Global:queryScript -Query "Olympus" -CollectionName $Global:collectionName -Json
             
            $combinedOutput = $results | Out-String
            $combinedOutput | Should -Match "fact_mars.txt"
            $combinedOutput | Should -Not -Match "fact_code.txt"
        }
    }
    
    AfterAll {
        # Cleanup
        if (Test-Path $Global:goldenSetDir) { Remove-Item $Global:goldenSetDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
