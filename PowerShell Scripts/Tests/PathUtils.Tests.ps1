# PathUtils.Tests.ps1 - Pester tests for PathUtils including config and log rotation
# Run: Invoke-Pester -Path ./Tests/PathUtils.Tests.ps1

BeforeAll {
    # Load the module under test
    $modulePath = Convert-Path "$PSScriptRoot/../LocalRagUtils"
    Import-Module $modulePath -Force
}

Describe "PathManager" {
    
    Context "Path Resolution" {
        
        It "should have ProjectRoot defined" {
            $Global:PathManager.ProjectRoot | Should -Not -BeNullOrEmpty
        }
        
        It "should have LogsFolder within ProjectRoot" {
            $Global:PathManager.LogsFolder | Should -BeLike "$($Global:PathManager.ProjectRoot)*"
        }
        
        It "should generate log path with .xml extension" {
            $path = $Global:PathManager.GetLogPath("test")
            $path | Should -Match "\.xml$"
        }
        
        It "should generate timestamped log names" {
            $name = $Global:PathManager.GenerateTimestampedLogName("test")
            $name | Should -Match "^test-\d{8}-\d{6}\.xml$"
        }
    }
    
    Context "Get-PathManager Factory" {
        
        It "should return PathManager instance" {
            $pm = Get-PathManager
            $pm | Should -Not -BeNullOrEmpty
            $pm.GetType().Name | Should -Be "PathManager"
        }
        
        It "should return same singleton instance" {
            $pm1 = Get-PathManager
            $pm2 = Get-PathManager
            [object]::ReferenceEquals($pm1, $pm2) | Should -Be $true
        }
        
        It "should be same instance as Global:PathManager (backward compatibility)" {
            $pm = Get-PathManager
            [object]::ReferenceEquals($pm, $Global:PathManager) | Should -Be $true
        }
    }
}

Describe "Get-ProjectConfig" {
    
    Context "Configuration Loading" {
        
        It "should load configuration without error" {
            { Get-ProjectConfig } | Should -Not -Throw
        }
        
        It "should return hashtable" {
            $config = Get-ProjectConfig
            $config | Should -BeOfType [hashtable]
        }
        
        It "should have Logging section" {
            $config = Get-ProjectConfig
            $config.Logging | Should -Not -BeNullOrEmpty
        }
        
        It "should have RetentionDays in Logging" {
            $config = Get-ProjectConfig
            $config.Logging.RetentionDays | Should -BeGreaterThan 0
        }
        
        It "should have Ollama section with version info" {
            $config = Get-ProjectConfig
            $config.Ollama.MinSupportedVersion | Should -Not -BeNullOrEmpty
        }
        
        It "should cache configuration on subsequent calls" {
            $config1 = Get-ProjectConfig
            $config2 = Get-ProjectConfig
            
            # Same reference means cached
            [object]::ReferenceEquals($config1, $config2) | Should -Be $true
        }
        
        It "should reload on Force" {
            $config1 = Get-ProjectConfig
            $config2 = Get-ProjectConfig -Force
            
            # Different reference after force reload
            [object]::ReferenceEquals($config1, $config2) | Should -Be $false
        }
    }
}

Describe "Invoke-LogRotation" {
    
    Context "Rotation Logic" {
        
        It "should return hashtable with DeletedCount and FreedBytes" {
            $result = Invoke-LogRotation -WhatIf
            
            $result | Should -BeOfType [hashtable]
            $result.ContainsKey("DeletedCount") | Should -Be $true
            $result.ContainsKey("FreedBytes") | Should -Be $true
        }
        
        It "should use config defaults when no parameters specified" {
            # This should not throw and should use config values
            { Invoke-LogRotation -WhatIf } | Should -Not -Throw
        }
        
        It "should accept custom RetentionDays" {
            { Invoke-LogRotation -RetentionDays 7 -WhatIf } | Should -Not -Throw
        }
    }
}

Describe "Path Convenience Functions" {
    
    Context "Get-* Functions" {
        
        It "Get-ProjectPath should return project root" {
            Get-ProjectPath | Should -Be $Global:PathManager.ProjectRoot
        }
        
        It "Get-LogPath should return path in logs folder" {
            $path = Get-LogPath -logFileName "test.xml"
            $path | Should -Match "Logs"
        }
        
        It "Get-ReportPath should return path in reports folder" {
            $path = Get-ReportPath -reportFileName "test.txt"
            $path | Should -Match "Reports"
        }
    }
    
    Context "New-* Functions" {
        
        It "New-TimestampedLogPath should create timestamped path" {
            $path = New-TimestampedLogPath -baseName "test"
            $path | Should -Match "\d{8}-\d{6}\.xml$"
        }
        
        It "New-ContextualLogPath should include operation in name" {
            $path = New-ContextualLogPath -operation "myop"
            $path | Should -Match "myop"
        }
    }
}
