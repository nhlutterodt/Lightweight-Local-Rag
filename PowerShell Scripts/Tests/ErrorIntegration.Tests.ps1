# ErrorIntegration.Tests.ps1 - Pester tests for standardized error handling
# Run: Invoke-Pester -Path ./Tests/ErrorIntegration.Tests.ps1

BeforeAll {
    # Load the module under test
    $modulePath = Convert-Path "$PSScriptRoot/../LocalRagUtils"
    Import-Module $modulePath -Force
}

Describe "ErrorCategories" {
    
    Context "Standard Categories" {
        
        It "should have FileSystem category" {
            [ErrorCategories]::FileSystem | Should -Be "FileSystemFailures"
        }
        
        It "should have Network category" {
            [ErrorCategories]::Network | Should -Be "NetworkFailures"
        }
        
        It "should have Parsing category" {
            [ErrorCategories]::Parsing | Should -Be "ParsingFailures"
        }
        
        It "should have Validation category" {
            [ErrorCategories]::Validation | Should -Be "ValidationFailures"
        }
        
        It "should have Configuration category" {
            [ErrorCategories]::Configuration | Should -Be "ConfigurationFailures"
        }
        
        It "should have General category" {
            [ErrorCategories]::General | Should -Be "GeneralErrors"
        }
    }
}

Describe "New-IntegratedErrorHandler" {
    
    Context "Factory Function" {
        
        It "should create handler with context" {
            $handler = New-IntegratedErrorHandler -Context "FactoryTest"
            
            $handler | Should -Not -BeNullOrEmpty
            $handler.Context | Should -Be "FactoryTest"
        }
        
        It "should set ThrowOnCritical when specified" {
            $handler = New-IntegratedErrorHandler -Context "Test" -ThrowOnCritical
            
            $handler.ThrowOnCritical | Should -Be $true
        }
        
        It "should track errors via ErrorManager" {
            $handler = New-IntegratedErrorHandler -Context "ErrorTest"
            
            $handler.HasErrors() | Should -Be $false
            $handler.GetErrorCount() | Should -Be 0
        }
    }
}

Describe "IntegratedErrorHandler Error Tracking" {
    
    Context "Error Logging" {
        
        It "should log error and track count" {
            $handler = New-IntegratedErrorHandler -Context "TestContext"
            
            $handler.LogError("GeneralErrors", "TestOp", "Test error message")
            
            $handler.HasErrors() | Should -Be $true
            $handler.GetErrorCount() | Should -Be 1
        }
        
        It "should log warning via ErrorManager" {
            $handler = New-IntegratedErrorHandler -Context "TestContext"
            
            $handler.LogWarning("GeneralErrors", "TestOp", "Test warning")
            
            $handler.ErrorManager.TotalWarnings | Should -Be 1
        }
        
        It "should track multiple errors" {
            $handler = New-IntegratedErrorHandler -Context "TestContext"
            
            $handler.LogError("FileSystemFailures", "Op1", "Error 1")
            $handler.LogError("NetworkFailures", "Op2", "Error 2")
            $handler.LogError("ParsingFailures", "Op3", "Error 3")
            
            $handler.GetErrorCount() | Should -Be 3
        }
    }
    
    Context "Safe Execution" {
        
        It "should return result on success" {
            $handler = New-IntegratedErrorHandler -Context "TestContext"
            
            $result = $handler.SafeExecute({ return 42 }, "TestOp")
            
            $result | Should -Be 42
            $handler.HasErrors() | Should -Be $false
        }
        
        It "should catch and log exceptions" {
            $handler = New-IntegratedErrorHandler -Context "TestContext"
            
            $result = $handler.SafeExecute({ throw "Test exception" }, "TestOp")
            
            $result | Should -BeNullOrEmpty
            $handler.HasErrors() | Should -Be $true
        }
        
        It "SafeExecuteVoid should return true on success" {
            $handler = New-IntegratedErrorHandler -Context "TestContext"
            
            $success = $handler.SafeExecuteVoid({ "do nothing" | Out-Null }, "TestOp")
            
            $success | Should -Be $true
        }
        
        It "SafeExecuteVoid should return false on failure" {
            $handler = New-IntegratedErrorHandler -Context "TestContext"
            
            $failure = $handler.SafeExecuteVoid({ throw "error" }, "FailOp")
            
            $failure | Should -Be $false
        }
    }
}

Describe "Invoke-StandardOperation" {
    
    Context "Standard Pattern" {
        
        It "should return hashtable on success" {
            $result = Invoke-StandardOperation -Operation { return "done" } -OperationName "TestOp"
            
            $result | Should -BeOfType [hashtable]
            $result.ContainsKey("Success") | Should -Be $true
            $result["Success"] | Should -Be $true
        }
        
        It "should include Result key with return value" {
            $result = Invoke-StandardOperation -Operation { return "myvalue" } -OperationName "TestOp"
            
            $result["Result"] | Should -Be "myvalue"
        }
        
        It "should return failure when operation throws" {
            $result = Invoke-StandardOperation -Operation { throw "error" } -OperationName "FailOp"
            
            $result["Success"] | Should -Be $false
        }
    }
}
