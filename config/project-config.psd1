# Project Configuration for Local-RAG-Project-v2
# This file centralizes all configurable settings for the project.
# Load with: $config = Import-PowerShellDataFile "$PSScriptRoot/../config/project-config.psd1"

@{
    # ===== Path Configuration =====
    Paths    = @{
        # Relative to project root
        LogsDirectory    = "Logs"
        ReportsDirectory = "Logs/Reports"
        HtmlDirectory    = "html_pages"
        ScriptsDirectory = "PowerShell Scripts"
        TestsDirectory   = "PowerShell Scripts/Tests"
        ConfigDirectory  = "config"
        DocsDirectory    = "docs"
    }
    
    # ===== Logging Configuration =====
    Logging  = @{
        # Default log level: DEBUG, INFO, WARNING, ERROR
        DefaultLevel   = "INFO"
        
        # Maximum log file size before rotation (in bytes)
        MaxFileSize    = 10485760  # 10MB
        
        # Number of days to keep log files
        RetentionDays  = 30
        
        # Maximum total size of logs directory (in bytes)
        MaxTotalSize   = 104857600  # 100MB
        
        # Include timestamps in console output
        ShowTimestamps = $true
        
        # Enable verbose debugging output
        VerboseMode    = $false
    }
    
    # ===== Schema Configuration =====
    Schemas  = @{
        # Current schema version for XML logs
        CurrentVersion      = "1.0.0"
        
        # Minimum supported version for reading old logs
        MinSupportedVersion = "1.0.0"
        
        # Default root element for PowerShell logs
        DefaultRootElement  = "PowerShellLog"
    }
    
    # ===== Ollama Configuration =====
    Ollama   = @{
        # Minimum supported Ollama version
        MinSupportedVersion = "0.12.0"
        
        # Tested versions (used for compatibility warnings)
        TestedVersions      = @("0.12.0", "0.12.2", "0.13.0", "0.14.0")
        
        # Ollama Service URL
        ServiceUrl          = "http://localhost:11434"

        # Service startup timeout (seconds)
        ServiceTimeout      = 30
        
        # Default model family for new installations
        DefaultModelFamily  = "llama"
    }
    
    # ===== Report Configuration =====
    Reports  = @{
        # Default report format: text, html, both
        DefaultFormat      = "both"
        
        # Include system information in reports
        IncludeSystemInfo  = $true
        
        # Include timestamp in report filenames
        TimestampFilenames = $true
        
        # HTML report theme: light, dark, auto
        HtmlTheme          = "auto"
    }
    
    # ===== Testing Configuration =====
    Testing  = @{
        # Tags to exclude from default test runs
        ExcludeTags         = @("Integration", "Slow")
        
        # Output format for CI/CD: NUnitXml, JUnitXml
        CIOutputFormat      = "NUnitXml"
        
        # Generate test result file
        GenerateTestResults = $true
        
        # Test result output path (relative to Scripts)
        TestResultPath      = "../Logs/TestResults.xml"
    }
    
    # ===== Console Output Configuration =====
    Console  = @{
        # Color scheme for console output
        Colors         = @{
            Success = "Green"
            Error   = "Red"
            Warning = "Yellow"
            Info    = "Cyan"
            Muted   = "Gray"
            Header  = "Magenta"
        }
        
        # Default indentation size (spaces)
        IndentSize     = 2
        
        # Show section separators
        ShowSeparators = $true
    }
    
    # ===== Metadata =====
    Metadata = @{
        ConfigVersion = "1.0.0"
        LastModified  = "2026-01-29"
        ProjectName   = "Local-RAG-Project-v2"
        Author        = "Local RAG Team"
    }
}
