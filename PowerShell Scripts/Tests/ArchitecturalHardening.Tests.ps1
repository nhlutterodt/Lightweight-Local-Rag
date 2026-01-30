# ArchitecturalHardening.Tests.ps1 - Pester tests for new architectural utilities
# Run: Invoke-Pester -Path ./Tests/ArchitecturalHardening.Tests.ps1

Describe "Architectural Utilities" {
    
    BeforeAll {
        $script:scriptsDir = Convert-Path "$PSScriptRoot/.."
        $script:modulePath = "$script:scriptsDir/LocalRagUtils/LocalRagUtils.psd1"
        $script:configPath = "$script:scriptsDir/../config/project-config.psd1"
    }

    Context "Get-ProjectConfig.ps1" {
        It "should return valid JSON configuration" {
            # Act
            $output = pwsh -NoProfile -ExecutionPolicy Bypass -File "$script:scriptsDir/Get-ProjectConfig.ps1"
            
            # Assert
            $output | Should -Not -BeNullOrEmpty
            $config = $output | ConvertFrom-Json
            $config.Paths | Should -Not -BeNullOrEmpty
            $config.Logging | Should -Not -BeNullOrEmpty
        }
    }

    Context "Append-LogEntry.ps1" {
        It "should successfully append log entries via CLI" {
            # Arrange
            $logName = "cli-test-log"
            $message = "CLI Test Message $(Get-Date -UFormat %s)"
            
            # Load path utils to find log file
            . "$script:scriptsDir/PathUtils.ps1"
            $logPath = Get-LogPath -logFileName ($logName + ".xml")
            if (Test-Path $logPath) { Remove-Item $logPath -Force }

            # Act
            pwsh -NoProfile -ExecutionPolicy Bypass -File "$script:scriptsDir/Append-LogEntry.ps1" `
                -Message $message `
                -Level "SUCCESS" `
                -Category "TEST" `
                -LogName $logName
            
            # Assert
            Test-Path $logPath | Should -Be $true
            $xml = [xml](Get-Content $logPath)
            $xml.PowerShellLog.LogEntry.Message | Should -Be $message

            # Cleanup
            Remove-Item $logPath -Force -ErrorAction SilentlyContinue
        }
    }

    Context "Invoke-SystemHealth.ps1" {
        It "should return valid diagnostic JSON" {
            # Act
            $output = pwsh -NoProfile -ExecutionPolicy Bypass -File "$script:scriptsDir/Invoke-SystemHealth.ps1"
            
            # Assert
            $output | Should -Not -BeNullOrEmpty
            $health = $output | Join-String | ConvertFrom-Json
            $health.status | Should -Match "healthy|warning|error"
            $health.checks.Count | Should -BeGreaterThan 0
        }
    }

    Context "IPC Protocol (JSON Signals)" {
        It "should emit valid JSON status objects in Query-Rag.ps1" {
            # Act
            $output = pwsh -NoProfile -ExecutionPolicy Bypass -File "$script:scriptsDir/Query-Rag.ps1" `
                -Query "What is RAG?" -CollectionName "TestIngest" -Json
            
            # Assert
            $jsonLines = $output | Where-Object { $_ -match "\{.*\}" }
            $jsonLines.Count | Should -BeGreaterThan 0
            
            $firstSignal = $jsonLines[0] | ConvertFrom-Json
            $firstSignal.type | Should -Be "status"
        }

        It "should emit valid JSON status objects in Ingest-Documents.ps1" {
            # Act
            $output = pwsh -NoProfile -ExecutionPolicy Bypass -File "$script:scriptsDir/Ingest-Documents.ps1" `
                -SourcePath "$script:scriptsDir/../docs" -CollectionName "TestIPC" -Signal
            
            # Assert
            $jsonLines = $output | Where-Object { $_ -match "\{.*\}" }
            $jsonLines.Count | Should -BeGreaterThan 0
            
            $firstSignal = $jsonLines[0] | ConvertFrom-Json
            $firstSignal.message | Should -Not -BeNullOrEmpty
        }
    }
}
