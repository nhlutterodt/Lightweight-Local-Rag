# VectorMetrics.Tests.ps1 - Pester tests for Get-VectorMetrics.ps1
# Run: Invoke-Pester -Path ./Tests/VectorMetrics.Tests.ps1

BeforeAll {
    $script:scriptsDir = Convert-Path "$PSScriptRoot/.."
    $script:testDataDir = Join-Path $PSScriptRoot "TempMetricsData"
    if (Test-Path $script:testDataDir) { Remove-Item $script:testDataDir -Recurse -Force }
    New-Item $script:testDataDir -ItemType Directory | Out-Null
}

AfterAll {
    if (Test-Path $script:testDataDir) { Remove-Item $script:testDataDir -Recurse -Force }
}

Describe "Vector Index Metrics" {

    Context "Header Extraction" {
        It "should correctly parse binary headers from multiple collections" {
            # Arrange - Create a dummy vector binary file
            $collectionName = "test_metrics"
            $binPath = Join-Path $script:testDataDir "$collectionName.vectors.bin"
            
            $fs = [System.IO.File]::Create($binPath)
            $bw = [System.IO.BinaryWriter]::new($fs)
            $bw.Write([int]100) # Count
            $bw.Write([int]768) # Dimension
            $bw.Close()
            $fs.Dispose()

            # Act
            $output = pwsh -NoProfile -ExecutionPolicy Bypass -File "$script:scriptsDir/Get-VectorMetrics.ps1" -DataPath $script:testDataDir
            
            # Assert
            $output | Should -Not -BeNullOrEmpty
            $metrics = $output | ConvertFrom-Json
            
            # Ensure it's an array and check properties
            $metrics = if ($metrics -is [Array]) { $metrics } else { @($metrics) }
            
            $metrics.Count | Should -Be 1
            $target = $metrics[0]
            $target.name | Should -Be $collectionName
            $target.vectorCount | Should -Be 100
            $target.dimension | Should -Be 768
            $target.health | Should -Be "OK"
            $target.estimatedMemoryFootprintBytes | Should -Be (100 * 768 * 4)
        }

        It "should report CORRUPT for empty or too-small files" {
            # Arrange
            $badPath = Join-Path $script:testDataDir "corrupt.vectors.bin"
            "junk" | Set-Content $badPath
            
            # Act
            $output = pwsh -NoProfile -ExecutionPolicy Bypass -File "$script:scriptsDir/Get-VectorMetrics.ps1" -DataPath $script:testDataDir
            $metrics = $output | ConvertFrom-Json
            $metrics = if ($metrics -is [Array]) { $metrics } else { @($metrics) }
            
            # Assert
            $corrupt = $metrics | Where-Object { $_.name -eq "corrupt" }
            $corrupt.health | Should -Be "CORRUPT"
        }
    }
}
