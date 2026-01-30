# XMLLogger.Tests.ps1 - Pester tests for XMLLogger functionality
# Run: Invoke-Pester -Path ./Tests/XMLLogger.Tests.ps1

BeforeAll {
    # Load the module under test
    $modulePath = Convert-Path "$PSScriptRoot/../LocalRagUtils"
    Import-Module $modulePath -Force
}

Describe "XMLLogger" {
    
    Context "Log File Creation" {
        
        It "should create a valid XML log file" {
            # Arrange
            $logger = [XMLLogger]::NewForOperation("pester-test", "UnitTest")
            
            # Act
            $logger.LogInfo("TEST", "Test message")
            $logger.SaveLog()
            
            # Assert
            Test-Path $logger.LogFile | Should -Be $true
            
            # Cleanup
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
        
        It "should produce parseable XML" {
            # Arrange
            $logger = [XMLLogger]::NewForOperation("pester-test", "ParseTest")
            $logger.LogInfo("TEST", "Parse test message")
            $logger.SaveLog()
            
            # Act & Assert
            { [xml](Get-Content $logger.LogFile) } | Should -Not -Throw
            
            # Cleanup
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
    }
    
    Context "Schema Versioning" {
        
        It "should include schemaVersion attribute on root element" {
            # Arrange
            $logger = [XMLLogger]::NewForOperation("pester-test", "VersionTest")
            $logger.LogInfo("TEST", "Version test")
            $logger.SaveLog()
            
            # Act
            $xml = [xml](Get-Content $logger.LogFile)
            
            # Assert
            $xml.PowerShellLog.schemaVersion | Should -Be "1.0.0"
            
            # Cleanup
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
        
        It "should include required root attributes" {
            # Arrange
            $logger = [XMLLogger]::NewForOperation("pester-test", "AttributeTest")
            $logger.LogInfo("TEST", "Attribute test")
            $logger.SaveLog()
            
            # Act
            $xml = [xml](Get-Content $logger.LogFile)
            
            # Assert
            $xml.PowerShellLog.session | Should -Be "AttributeTest"
            $xml.PowerShellLog.startTime | Should -Not -BeNullOrEmpty
            $xml.PowerShellLog.machine | Should -Not -BeNullOrEmpty
            
            # Cleanup
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
    }
    
    Context "XML Sanitization" {
        
        It "should handle special XML characters in messages" {
            # Arrange
            $logger = [XMLLogger]::NewForOperation("pester-test", "SanitizeTest")
            $dangerousMessage = "Test <script>alert('xss')</script> & special chars"
            
            # Act
            $logger.LogInfo("TEST", $dangerousMessage)
            $logger.SaveLog()
            
            # Assert - should not throw when parsing
            { [xml](Get-Content $logger.LogFile) } | Should -Not -Throw
            
            # Cleanup
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
        
        It "should handle special characters in hashtable keys" {
            # Arrange
            $logger = [XMLLogger]::NewForOperation("pester-test", "KeySanitizeTest")
            
            # Act - keys with spaces and special chars
            $logger.LogInfo("TEST", "Key sanitization test", @{
                    "key with spaces" = "value1"
                    "key-with-dashes" = "value2"
                    "normalKey"       = "value3"
                })
            $logger.SaveLog()
            
            # Assert - should produce valid XML
            { [xml](Get-Content $logger.LogFile) } | Should -Not -Throw
            
            # Cleanup
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
        
        It "should handle special characters in hashtable values" {
            # Arrange
            $logger = [XMLLogger]::NewForOperation("pester-test", "ValueSanitizeTest")
            
            # Act
            $logger.LogInfo("TEST", "Value sanitization test", @{
                    "testKey" = "<dangerous>value & more</dangerous>"
                })
            $logger.SaveLog()
            
            # Assert
            $xml = [xml](Get-Content $logger.LogFile)
            $xml | Should -Not -BeNullOrEmpty
            
            # Cleanup
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
    }
    
    Context "Log Levels" {
        
        It "should support INFO level" {
            $logger = [XMLLogger]::NewForOperation("pester-test", "LevelTest")
            $logger.LogInfo("TEST", "Info message")
            $logger.SaveLog()
            
            $xml = [xml](Get-Content $logger.LogFile)
            $xml.PowerShellLog.LogEntry.level | Should -Be "INFO"
            
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
        
        It "should support WARNING level" {
            $logger = [XMLLogger]::NewForOperation("pester-test", "LevelTest")
            $logger.LogWarning("TEST", "Warning message")
            $logger.SaveLog()
            
            $xml = [xml](Get-Content $logger.LogFile)
            $xml.PowerShellLog.LogEntry.level | Should -Be "WARNING"
            
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
        
        It "should support ERROR level" {
            $logger = [XMLLogger]::NewForOperation("pester-test", "LevelTest")
            $logger.LogError("TEST", "Error message")
            $logger.SaveLog()
            
            $xml = [xml](Get-Content $logger.LogFile)
            $xml.PowerShellLog.LogEntry.level | Should -Be "ERROR"
            
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
        
        It "should support SUCCESS level" {
            $logger = [XMLLogger]::NewForOperation("pester-test", "LevelTest")
            $logger.LogSuccess("TEST", "Success message")
            $logger.SaveLog()
            
            $xml = [xml](Get-Content $logger.LogFile)
            $xml.PowerShellLog.LogEntry.level | Should -Be "SUCCESS"
            
            Remove-Item $logger.LogFile -Force -ErrorAction SilentlyContinue
        }
    }

    Context "Persistence" {
        
        It "should append to an existing log file using GetPersistentLogger" {
            # Arrange
            $logBaseName = "persistence-test-log"
            # Ensure PathUtils is available for this scope
            if (-not (Get-Command Get-PathManager -ErrorAction SilentlyContinue)) {
                . "$PSScriptRoot/../PathUtils.ps1"
            }
            $logPath = Get-LogPath -logFileName ($logBaseName + ".xml")
            if (Test-Path $logPath) { Remove-Item $logPath -Force }
            
            # First write
            $logger1 = [XMLLogger]::GetPersistentLogger($logBaseName, "Session1")
            $logger1.LogInfo("TEST", "First entry")
            $logger1.SaveLog()
            
            # Act - Second write with same base name
            $logger2 = [XMLLogger]::GetPersistentLogger($logBaseName, "Session2")
            $logger2.LogInfo("TEST", "Second entry")
            $logger2.SaveLog()
            
            # Assert
            $xml = [xml](Get-Content $logPath)
            $xml.PowerShellLog.LogEntry.Count | Should -Be 2
            
            # Cleanup
            Remove-Item $logPath -Force -ErrorAction SilentlyContinue
        }
    }
}
