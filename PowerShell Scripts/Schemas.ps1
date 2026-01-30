# Schemas.ps1 - Centralized XML schema definitions for consistent parsing

class SchemaDefinition {
    [string]$Name
    [hashtable]$Definition
    [string[]]$ValidationRules
    
    SchemaDefinition([string]$name, [hashtable]$definition) {
        $this.Name = $name
        $this.Definition = $definition
        $this.ValidationRules = @()
    }
    
    [bool] ValidateSchema([System.Xml.XmlDocument]$xmlDoc) {
        $root = $xmlDoc.DocumentElement
        if ($this.Definition["rootElement"] -ne "*" -and $root.Name -ne $this.Definition["rootElement"]) {
            return $false
        }
        return $true
    }
}

class SchemaRegistry {
    [hashtable]$Schemas = @{}
    
    # Current schema version - increment when making breaking changes
    static [string] $CurrentSchemaVersion = "1.0.0"
    
    SchemaRegistry() {
        $this.InitializeDefaultSchemas()
    }
    
    [void] InitializeDefaultSchemas() {
        # PowerShell XMLLogger schema (our primary standard)
        $this.RegisterSchema("PowerShellLog", @{
                "rootElement"       = "PowerShellLog"
                "sessionAttributes" = @("session", "startTime", "machine")
                "entryElement"      = "LogEntry"
                "entryAttributes"   = @("timestamp", "level", "category")
                "messageElement"    = "Message"
                "dataElement"       = "Data"
                "description"       = "Standard PowerShell logging format with structured entries"
                "version"           = "1.0.0"
            })
        
        # Extended schema for model information
        $this.RegisterSchema("ModelLog", @{
                "rootElement"       = "PowerShellLog"
                "sessionAttributes" = @("session", "startTime", "machine")
                "entryElement"      = "LogEntry"
                "entryAttributes"   = @("timestamp", "level", "category", "modelName", "modelSize")
                "messageElement"    = "Message"
                "dataElement"       = "Data"
                "description"       = "Extended logging format for AI model information"
                "version"           = "1.0.0"
            })
        
        # Generic fallback schema
        $this.RegisterSchema("GenericLog", @{
                "rootElement"     = "*"
                "entryElement"    = "*"
                "entryAttributes" = @("timestamp", "level")
                "messageElement"  = "Message"
                "dataElement"     = "Data"
                "description"     = "Generic fallback schema for unknown formats"
                "version"         = "1.0.0"
            })
        
        # Windows Event Log style schema
        $this.RegisterSchema("WindowsEventLog", @{
                "rootElement"     = "Events"
                "entryElement"    = "Event"
                "entryAttributes" = @("TimeCreated", "Level", "Source")
                "messageElement"  = "EventData"
                "dataElement"     = "Data"
                "description"     = "Windows Event Log format"
                "version"         = "1.0.0"
            })
        
        # System monitoring schema
        $this.RegisterSchema("SystemMonitor", @{
                "rootElement"       = "SystemLog"
                "sessionAttributes" = @("session", "startTime", "machine", "monitorType")
                "entryElement"      = "MonitorEntry"
                "entryAttributes"   = @("timestamp", "level", "component", "metric")
                "messageElement"    = "Description"
                "dataElement"       = "Metrics"
                "description"       = "System monitoring and metrics logging format"
                "version"           = "1.0.0"
            })
        
        # File system item schema for Reveal-FolderContents.ps1
        $this.RegisterSchema("file-item-v1", @{
                "rootElement"     = "RevealResults"
                "entryElement"    = "Item"
                "entryAttributes" = @("Name", "FullPath", "RelativePath", "ItemType", "SizeBytes", "Extension", "MimeHint", "CreatedUtc", "ModifiedUtc", "AccessedUtc")
                "requiredFields"  = @("Name", "FullPath", "ItemType")
                "optionalFields"  = @("HashSha256", "Owner", "AclSummary", "Attributes", "Tags", "Extra")
                "description"     = "File system enumeration schema for folder contents analysis"
                "version"         = "1.0"
            })
    }
    
    [void] RegisterSchema([string]$name, [hashtable]$definition) {
        $schema = [SchemaDefinition]::new($name, $definition)
        $this.Schemas[$name] = $schema
    }
    
    [SchemaDefinition] GetSchema([string]$name) {
        if ($this.Schemas.ContainsKey($name)) {
            return $this.Schemas[$name]
        }
        return $null
    }
    
    [SchemaDefinition] DetectSchema([System.Xml.XmlDocument]$xmlDoc) {
        $rootElement = $xmlDoc.DocumentElement
        $rootName = $rootElement.Name
        
        # Check for exact matches first
        foreach ($schemaName in $this.Schemas.Keys) {
            $schema = $this.Schemas[$schemaName]
            if ($schema.ValidateSchema($xmlDoc)) {
                # Additional validation for PowerShell logs
                if ($rootName -eq "PowerShellLog") {
                    # Check if it has model-specific attributes
                    $firstEntry = $rootElement.SelectSingleNode("LogEntry")
                    if ($firstEntry -and ($firstEntry.GetAttribute("modelName") -or $firstEntry.GetAttribute("modelSize"))) {
                        return $this.GetSchema("ModelLog")
                    }
                    return $this.GetSchema("PowerShellLog")
                }
                
                # Check for Windows Event Log
                if ($rootName -eq "Events" -or $rootName -eq "Event") {
                    return $this.GetSchema("WindowsEventLog")
                }
                
                # Check for System Monitor
                if ($rootName -eq "SystemLog") {
                    return $this.GetSchema("SystemMonitor")
                }
            }
        }
        
        # If no exact match, try to infer
        $inferredSchema = $this.InferSchemaFromStructure($xmlDoc)
        if ($inferredSchema) {
            return $inferredSchema
        }
        
        # Use generic fallback
        return $this.GetSchema("GenericLog")
    }
    
    [SchemaDefinition] InferSchemaFromStructure([System.Xml.XmlDocument]$xmlDoc) {
        $root = $xmlDoc.DocumentElement
        $firstChild = $root.FirstChild
        
        if (-not $firstChild -or $firstChild.NodeType -ne [System.Xml.XmlNodeType]::Element) {
            return $null
        }
        
        $inferredDef = @{
            "rootElement"     = $root.Name
            "entryElement"    = $firstChild.Name
            "entryAttributes" = @()
            "messageElement"  = "Message"
            "dataElement"     = "Data"
            "description"     = "Inferred schema from document structure"
        }
        
        # Extract attributes from first child
        foreach ($attr in $firstChild.Attributes) {
            $inferredDef["entryAttributes"] += $attr.Name
        }
        
        # Look for message-like elements
        foreach ($child in $firstChild.ChildNodes) {
            if ($child.NodeType -eq [System.Xml.XmlNodeType]::Element) {
                $childName = $child.Name.ToLower()
                if ($childName -match "message|description|text|content") {
                    $inferredDef["messageElement"] = $child.Name
                }
                elseif ($childName -match "data|properties|details|metadata") {
                    $inferredDef["dataElement"] = $child.Name
                }
            }
        }
        
        $tempSchema = [SchemaDefinition]::new("Inferred", $inferredDef)
        return $tempSchema
    }
    
    [string[]] ListSchemas() {
        return $this.Schemas.Keys | Sort-Object
    }
    
    [void] PrintSchemaInfo([string]$schemaName) {
        $schema = $this.GetSchema($schemaName)
        if ($schema) {
            Write-Host "Schema: $($schema.Name)" -ForegroundColor Cyan
            Write-Host "Description: $($schema.Definition['description'])" -ForegroundColor Gray
            Write-Host "Root Element: $($schema.Definition['rootElement'])" -ForegroundColor White
            Write-Host "Entry Element: $($schema.Definition['entryElement'])" -ForegroundColor White
            
            if ($schema.Definition["entryAttributes"]) {
                Write-Host "Entry Attributes: $($schema.Definition['entryAttributes'] -join ', ')" -ForegroundColor Yellow
            }
            
            Write-Host ""
        }
        else {
            Write-Host "Schema '$schemaName' not found" -ForegroundColor Red
        }
    }
    
    [void] PrintAllSchemas() {
        Write-Host "=== REGISTERED SCHEMAS ===" -ForegroundColor Magenta
        foreach ($schemaName in $this.ListSchemas()) {
            $this.PrintSchemaInfo($schemaName)
        }
    }
}

# ===== Singleton Pattern with Script Scope =====
# Using script-scope for module-internal singleton, with backward-compatible $Global alias

# Script-scope singleton instance
$script:SchemaRegistryInstance = $null

function Get-SchemaRegistry {
    <#
    .SYNOPSIS
        Returns the SchemaRegistry singleton instance. Preferred over $Global:SchemaRegistry.
    .DESCRIPTION
        This factory function provides access to the SchemaRegistry singleton.
        Use this for explicit dependency injection in new code.
    .EXAMPLE
        $registry = Get-SchemaRegistry
        $schema = $registry.GetSchema("PowerShellLog")
    #>
    if ($null -eq $script:SchemaRegistryInstance) {
        $script:SchemaRegistryInstance = [SchemaRegistry]::new()
    }
    return $script:SchemaRegistryInstance
}

# Initialize the singleton
$script:SchemaRegistryInstance = [SchemaRegistry]::new()

# DEPRECATED: Backward-compatible global alias for existing scripts
# New code should use: Get-SchemaRegistry or dependency injection
$Global:SchemaRegistry = $script:SchemaRegistryInstance

# Export the main functions
# (In a module, you would use Export-ModuleMember)