$ErrorActionPreference = "Stop"
try {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    Write-Host "ScriptDir: $scriptDir"
    
    $testDir = Join-Path $scriptDir "Tests\Data"
    # Ensure intermediate Tests\Data exists
    if (-not (Test-Path $testDir)) {
        Write-Host "Creating $testDir"
        New-Item $testDir -ItemType Directory -Force
    }

    $goldenSetDir = Join-Path $testDir "GoldenSet"
    Write-Host "GoldenSetDir: $goldenSetDir"
    
    if (Test-Path $goldenSetDir) { 
        Write-Host "Removing old dir..."
        Remove-Item $goldenSetDir -Recurse -Force 
    }
    
    Write-Host "Creating new dir..."
    New-Item $goldenSetDir -ItemType Directory -Force | Out-Null
    
    Write-Host "Writing facts..."
    Set-Content -Path "$goldenSetDir\fact_mars.txt" -Value "The capital city of Mars is Olympus City. It is located near the volcano."
    Set-Content -Path "$goldenSetDir\fact_code.txt" -Value "The secret code for the vault is 884422."
    
    Write-Host "Setup Complete."
}
catch {
    Write-Error "Setup Failed: $_"
    Write-Error "Stack: $($_.ScriptStackTrace)"
}
