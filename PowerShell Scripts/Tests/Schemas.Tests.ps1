# Schemas.Tests.ps1 - Pester tests for Schema Registry functionality
# Run: Invoke-Pester -Path ./Tests/Schemas.Tests.ps1

BeforeAll {
    # Load the module under test
    $modulePath = Convert-Path "$PSScriptRoot/../LocalRagUtils"
    Import-Module $modulePath -Force
}

Describe "SchemaRegistry" {
    
    Context "Schema Versioning" {
        
        It "should have CurrentSchemaVersion defined" {
            [SchemaRegistry]::CurrentSchemaVersion | Should -Be "1.0.0"
        }
        
        It "should include version in PowerShellLog schema" {
            $registry = [SchemaRegistry]::new()
            $schema = $registry.GetSchema("PowerShellLog")
            
            $schema.Definition["version"] | Should -Be "1.0.0"
        }
        
        It "should include version in all default schemas" {
            $registry = [SchemaRegistry]::new()
            $schemaNames = @("PowerShellLog", "ModelLog", "GenericLog", "WindowsEventLog", "SystemMonitor", "file-item-v1")
            
            foreach ($name in $schemaNames) {
                $schema = $registry.GetSchema($name)
                $schema.Definition["version"] | Should -Not -BeNullOrEmpty -Because "$name should have version"
            }
        }
    }
    
    Context "Schema Registration" {
        
        It "should register default schemas on construction" {
            $registry = [SchemaRegistry]::new()
            $schemas = $registry.ListSchemas()
            
            $schemas | Should -Contain "PowerShellLog"
            $schemas | Should -Contain "GenericLog"
        }
        
        It "should allow custom schema registration" {
            $registry = [SchemaRegistry]::new()
            
            $registry.RegisterSchema("CustomSchema", @{
                    "rootElement" = "CustomRoot"
                    "version"     = "1.0.0"
                })
            
            $schema = $registry.GetSchema("CustomSchema")
            $schema | Should -Not -BeNullOrEmpty
            $schema.Definition["rootElement"] | Should -Be "CustomRoot"
        }
        
        It "should return null for unknown schema" {
            $registry = [SchemaRegistry]::new()
            $schema = $registry.GetSchema("NonExistentSchema")
            
            $schema | Should -BeNullOrEmpty
        }
    }
    
    Context "Schema Detection" {
        
        It "should detect PowerShellLog schema from XML" {
            $registry = [SchemaRegistry]::new()
            
            $xmlContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<PowerShellLog session="test" startTime="2026-01-29T12:00:00Z" machine="TEST">
    <LogEntry timestamp="2026-01-29T12:00:01Z" level="INFO" category="TEST">
        <Message>Test message</Message>
    </LogEntry>
</PowerShellLog>
"@
            $xmlDoc = [System.Xml.XmlDocument]::new()
            $xmlDoc.LoadXml($xmlContent)
            
            $detected = $registry.DetectSchema($xmlDoc)
            
            $detected.Name | Should -Be "PowerShellLog"
        }
        
        It "should fallback to GenericLog for unknown formats" {
            $registry = [SchemaRegistry]::new()
            
            $xmlContent = @"
<?xml version="1.0"?>
<UnknownRoot>
    <Item>content</Item>
</UnknownRoot>
"@
            $xmlDoc = [System.Xml.XmlDocument]::new()
            $xmlDoc.LoadXml($xmlContent)
            
            $detected = $registry.DetectSchema($xmlDoc)
            
            # Should either infer or use GenericLog
            $detected | Should -Not -BeNullOrEmpty
        }
    }
}

Describe "SchemaDefinition" {
    
    Context "Validation" {
        
        It "should validate matching root element" {
            $schema = [SchemaDefinition]::new("TestSchema", @{
                    "rootElement" = "TestRoot"
                })
            
            $xmlContent = "<TestRoot><Child/></TestRoot>"
            $xmlDoc = [System.Xml.XmlDocument]::new()
            $xmlDoc.LoadXml($xmlContent)
            
            $schema.ValidateSchema($xmlDoc) | Should -Be $true
        }
        
        It "should reject non-matching root element" {
            $schema = [SchemaDefinition]::new("TestSchema", @{
                    "rootElement" = "ExpectedRoot"
                })
            
            $xmlContent = "<WrongRoot><Child/></WrongRoot>"
            $xmlDoc = [System.Xml.XmlDocument]::new()
            $xmlDoc.LoadXml($xmlContent)
            
            $schema.ValidateSchema($xmlDoc) | Should -Be $false
        }
        
        It "should accept any root when using wildcard" {
            $schema = [SchemaDefinition]::new("WildcardSchema", @{
                    "rootElement" = "*"
                })
            
            $xmlContent = "<AnyRoot><Child/></AnyRoot>"
            $xmlDoc = [System.Xml.XmlDocument]::new()
            $xmlDoc.LoadXml($xmlContent)
            
            $schema.ValidateSchema($xmlDoc) | Should -Be $true
        }
    }
}
