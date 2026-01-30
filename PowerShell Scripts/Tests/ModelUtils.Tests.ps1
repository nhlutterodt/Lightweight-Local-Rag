# ModelUtils.Tests.ps1 - Pester tests for Ollama integration and version compatibility
# Run: Invoke-Pester -Path ./Tests/ModelUtils.Tests.ps1

BeforeAll {
    # Load the module under test
    $modulePath = Convert-Path "$PSScriptRoot/../LocalRagUtils"
    Import-Module $modulePath -Force
}

Describe "OllamaManager" {
    
    Context "Version Detection" {
        
        It "should have MinSupportedVersion defined" {
            [OllamaManager]::MinSupportedVersion | Should -Be "0.12.0"
        }
        
        It "should have TestedVersions array populated" {
            [OllamaManager]::TestedVersions | Should -Not -BeNullOrEmpty
            [OllamaManager]::TestedVersions.Count | Should -BeGreaterThan 0
        }
        
        It "should extract semantic version from version string" {
            $manager = [OllamaManager]::new()
            $semVer = $manager.GetSemanticVersion()
            
            # Should be either a version number or "unknown"
            $semVer | Should -Match '^(\d+\.\d+\.?\d*|unknown)$'
        }
        
        It "should return boolean from IsVersionSupported" {
            $manager = [OllamaManager]::new()
            $result = $manager.IsVersionSupported()
            
            $result | Should -BeOfType [bool]
        }
        
        It "should return boolean from IsVersionTested" {
            $manager = [OllamaManager]::new()
            $result = $manager.IsVersionTested()
            
            $result | Should -BeOfType [bool]
        }
    }
    
    Context "System Info" {
        
        It "should return hashtable from GetSystemInfo" {
            $manager = [OllamaManager]::new()
            $info = $manager.GetSystemInfo()
            
            $info | Should -BeOfType [hashtable]
            $info.ContainsKey("isAvailable") | Should -Be $true
            $info.ContainsKey("version") | Should -Be $true
        }
    }
    
    Context "Model Operations" -Tag "Integration" {
        # These tests require Ollama to be running
        
        It "should return array from GetModels" {
            $manager = [OllamaManager]::new()
            
            if ($manager.IsAvailable -and $manager.IsServiceRunning()) {
                $models = @($manager.GetModels())
                ($models -is [Array]) | Should -Be $true
                if ($models.Count -gt 0) {
                    $models[0].GetType().Name | Should -Be "ModelInfo"
                }
            }
            else {
                Set-ItResult -Skipped -Because "Ollama is not available or running"
            }
        }
    }
}

Describe "ModelInfo" {
    
    Context "Construction" {
        
        It "should extract family from model name with colon" {
            $model = [ModelInfo]::new("llama3.1:8b", "4.7 GB", "2 days ago")
            
            $model.Family | Should -Be "llama3.1"
        }
        
        It "should extract family from model name with hyphen" {
            $model = [ModelInfo]::new("codellama-7b", "3.8 GB", "1 day ago")
            
            $model.Family | Should -Be "codellama"
        }
        
        It "should convert to hashtable" {
            $model = [ModelInfo]::new("test-model:latest", "1 GB", "now")
            $hash = $model.ToHashtable()
            
            $hash | Should -BeOfType [hashtable]
            $hash["name"] | Should -Be "test-model:latest"
            $hash["family"] | Should -Be "test-model"
        }
    }
}

Describe "Utility Functions" {
    
    Context "Get-ModelSummary" {
        
        It "should return status field" {
            $summary = Get-ModelSummary
            
            $summary | Should -BeOfType [hashtable]
            $summary.ContainsKey("status") | Should -Be $true
            $summary.status | Should -BeIn @("not_installed", "not_running", "running")
        }
    }
}
