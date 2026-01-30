# XMLLogger.ps1 - Simple XML logging utility for PowerShell scripts

# Import path utilities
# Import path utilities (if not already loaded via module)
if (-not (Get-Command Get-PathManager -ErrorAction SilentlyContinue)) {
    . "$PSScriptRoot\PathUtils.ps1"
}

# Define the XML schema structure
class LogEntry {
    [string]$Timestamp
    [string]$Level
    [string]$Category
    [string]$Message
    [hashtable]$Data
    
    LogEntry([string]$level, [string]$category, [string]$message, [hashtable]$data = @{}) {
        $this.Timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")
        $this.Level = $level
        $this.Category = $category
        $this.Message = $message
        $this.Data = $data
    }
}

class XMLLogger {
    [string]$LogFile
    [System.Xml.XmlDocument]$XmlDoc
    [System.Xml.XmlElement]$RootNode
    
    XMLLogger([string]$logFile, [string]$sessionName = "PowerShell-Session") {
        $this.LogFile = $logFile
        $this.InitializeLogger($sessionName)
    }
    
    # Constructor that uses centralized path management
    XMLLogger([string]$logBaseName, [string]$sessionName, [bool]$useCentralizedPath) {
        if ($useCentralizedPath) {
            $this.LogFile = Get-LogPath -logFileName ($logBaseName + ".xml")
        }
        else {
            $this.LogFile = $logBaseName
        }
        $this.InitializeLogger($sessionName)
    }
    
    # Static method to create logger with centralized path
    static [XMLLogger] NewWithCentralizedPath([string]$logBaseName, [string]$sessionName) {
        return [XMLLogger]::new($logBaseName, $sessionName, $true)
    }
    
    # Enhanced static method to create logger with contextual naming
    static [XMLLogger] NewWithContextualPath([string]$operation, [string]$context, [string]$component, [string]$sessionName) {
        $logPath = New-ContextualLogPath -operation $operation -context $context -component $component
        return [XMLLogger]::new($logPath, $sessionName)
    }
    
    # Simplified contextual logger creation
    static [XMLLogger] NewForOperation([string]$operation, [string]$sessionName) {
        $logPath = New-ContextualLogPath -operation $operation
        return [XMLLogger]::new($logPath, $sessionName)
    }

    # Static method to append to an existing log or create new
    static [XMLLogger] GetPersistentLogger([string]$logBaseName, [string]$sessionName) {
        $logPath = Get-LogPath -logFileName ($logBaseName + ".xml")
        $logger = [XMLLogger]::new($logPath, $sessionName)
        if (Test-Path $logPath) {
            try {
                $logger.XmlDoc.Load($logPath)
                $logger.RootNode = $logger.XmlDoc.DocumentElement
            }
            catch {
                # Fallback to fresh if corrupted
            }
        }
        return $logger
    }
    
    [void] InitializeLogger([string]$sessionName) {
        $this.XmlDoc = New-Object System.Xml.XmlDocument
        
        # Create XML declaration
        $xmlDeclaration = $this.XmlDoc.CreateXmlDeclaration("1.0", "UTF-8", $null)
        $this.XmlDoc.AppendChild($xmlDeclaration) | Out-Null
        
        # Create root element with schema version for forward compatibility
        $this.RootNode = $this.XmlDoc.CreateElement("PowerShellLog")
        $this.RootNode.SetAttribute("schemaVersion", "1.0.0")
        $this.RootNode.SetAttribute("session", $sessionName)
        $this.RootNode.SetAttribute("startTime", (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"))
        $this.RootNode.SetAttribute("machine", $env:COMPUTERNAME)
        $this.XmlDoc.AppendChild($this.RootNode) | Out-Null
    }
    
    [void] LogInfo([string]$category, [string]$message) {
        $this.AddLogEntry("INFO", $category, $message, @{})
    }
    
    [void] LogInfo([string]$category, [string]$message, [hashtable]$data) {
        $this.AddLogEntry("INFO", $category, $message, $data)
    }
    
    [void] LogWarning([string]$category, [string]$message) {
        $this.AddLogEntry("WARNING", $category, $message, @{})
    }
    
    [void] LogWarning([string]$category, [string]$message, [hashtable]$data) {
        $this.AddLogEntry("WARNING", $category, $message, $data)
    }
    
    [void] LogError([string]$category, [string]$message) {
        $this.AddLogEntry("ERROR", $category, $message, @{})
    }
    
    [void] LogError([string]$category, [string]$message, [hashtable]$data) {
        $this.AddLogEntry("ERROR", $category, $message, $data)
    }
    
    [void] LogSuccess([string]$category, [string]$message) {
        $this.AddLogEntry("SUCCESS", $category, $message, @{})
    }
    
    [void] LogSuccess([string]$category, [string]$message, [hashtable]$data) {
        $this.AddLogEntry("SUCCESS", $category, $message, $data)
    }
    
    [void] AddLogEntry([string]$level, [string]$category, [string]$message, [hashtable]$data) {
        $entryElement = $this.XmlDoc.CreateElement("LogEntry")
        $entryElement.SetAttribute("timestamp", (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"))
        $entryElement.SetAttribute("level", $level)
        $entryElement.SetAttribute("category", $category)
        
        # Add message element
        $messageElement = $this.XmlDoc.CreateElement("Message")
        $messageElement.InnerText = $message
        $entryElement.AppendChild($messageElement) | Out-Null
        
        # Add data elements if provided
        if ($data.Count -gt 0) {
            $dataElement = $this.XmlDoc.CreateElement("Data")
            foreach ($key in $data.Keys) {
                # Sanitize element name - hashtable keys may contain invalid XML chars
                $safeKey = [System.Xml.XmlConvert]::EncodeName($key)
                $dataItem = $this.XmlDoc.CreateElement($safeKey)
                # Handle null values safely (InnerText handles XML escaping automatically)
                if ($null -ne $data[$key]) {
                    $dataItem.InnerText = $data[$key].ToString()
                }
                else {
                    $dataItem.InnerText = "[null]"
                }
                $dataElement.AppendChild($dataItem) | Out-Null
            }
            $entryElement.AppendChild($dataElement) | Out-Null
        }
        
        $this.RootNode.AppendChild($entryElement) | Out-Null
    }
    
    [void] SaveLog() {
        $this.XmlDoc.Save($this.LogFile)
    }
    
    [string] GetXmlString() {
        $stringWriter = New-Object System.IO.StringWriter
        $xmlWriter = New-Object System.Xml.XmlTextWriter($stringWriter)
        $xmlWriter.Formatting = [System.Xml.Formatting]::Indented
        $xmlWriter.Indentation = 2
        $this.XmlDoc.WriteContentTo($xmlWriter)
        return $stringWriter.ToString()
    }
    
    [void] OutputToConsole() {
        Write-Host $this.GetXmlString() -ForegroundColor Cyan
    }
}

# Utility function for Reveal-FolderContents.ps1 integration
function Write-XmlLog {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Items,
        
        [Parameter(Mandatory = $true)]
        [string]$OutFile,
        
        [string]$RootName = "RevealResults",
        [string]$ItemName = "Item"
    )
    
    try {
        $xml = New-Object System.Xml.XmlDocument
        $declaration = $xml.CreateXmlDeclaration("1.0", "UTF-8", $null)
        $xml.AppendChild($declaration) | Out-Null
        
        $rootNode = $xml.CreateElement($RootName)
        $rootNode.SetAttribute("timestamp", (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"))
        $rootNode.SetAttribute("itemCount", $Items.Count.ToString())
        $xml.AppendChild($rootNode) | Out-Null

        foreach ($item in $Items) {
            $node = $xml.CreateElement($ItemName)
            foreach ($prop in $item.PSObject.Properties) {
                if ($prop.Name -notlike "__*") {
                    # Skip internal properties
                    $pnode = $xml.CreateElement([System.Xml.XmlConvert]::EncodeName($prop.Name))
                    
                    if ($prop.Value -is [System.Array]) {
                        $pnode.InnerText = ($prop.Value -join ",")
                    }
                    elseif ($prop.Value -is [hashtable]) {
                        # Handle hashtables (like Tags, Extra)
                        foreach ($key in $prop.Value.Keys) {
                            $subnode = $xml.CreateElement([System.Xml.XmlConvert]::EncodeName($key))
                            $subnode.InnerText = $prop.Value[$key] -as [string]
                            $pnode.AppendChild($subnode) | Out-Null
                        }
                    }
                    else {
                        $pnode.InnerText = ($prop.Value -as [string])
                    }
                    
                    $node.AppendChild($pnode) | Out-Null
                }
            }
            $rootNode.AppendChild($node) | Out-Null
        }
        
        # Ensure the output directory exists
        $outDir = Split-Path -Path $OutFile -Parent
        if ($outDir -and !(Test-Path $outDir)) {
            New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        }
        
        $xml.Save($OutFile)
        return $true
        
    }
    catch {
        Write-Warning "Write-XmlLog failed: $($_.Exception.Message)"
        return $false
    }
}

# Factory function for module compatibility
function New-XMLLogger {
    param(
        [string]$LogFile,
        [string]$SessionName = "PowerShell-Session"
    )
    return [XMLLogger]::new($LogFile, $SessionName)
}