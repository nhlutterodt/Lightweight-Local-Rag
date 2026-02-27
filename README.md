# Enhanced Local RAG Project - XML Logging & AI Model Management

## Overview

This enhanced project provides a comprehensive suite of PowerShell utilities for AI model monitoring, XML-based structured logging, and automated report generation. The architecture has been significantly improved with modular utilities and centralized schema management.

## Enhanced Features

### 🚀 **New Modular Architecture**

- **Schemas.ps1**: Centralized XML schema definitions and validation
- **ModelUtils.ps1**: Specialized utilities for AI model detection and management
- **ReportUtils.ps1**: Comprehensive report generation (text, HTML, comparison)
- **Enhanced XMLParser.ps1**: Schema-aware parsing with fallback detection
- **Improved check-models.ps1**: Detailed individual model logging
- **Enhanced Test-XMLParser.ps1**: Comprehensive testing and demonstrations

### 📊 **Enhanced Model Logging**

- **Individual Model Entries**: Each AI model is logged as a separate structured entry
- **Model Families**: Automatic grouping by model family (llama, mistral, etc.)
- **Detailed Metadata**: Size, modification dates, IDs, and family classifications
- **Storage Analysis**: Total storage usage calculations and recommendations

### 🔄 **Centralized Schema Management**

- **Schema Registry**: Unified schema definitions for consistent parsing
- **Multiple Format Support**: PowerShell logs, Windows Event logs, System monitoring
- **Schema Detection**: Automatic detection with intelligent fallbacks
- **Validation**: Built-in schema validation and error handling

### 📈 **Advanced Reporting**

- **Multiple Formats**: Text reports, HTML dashboards, comparison analyses
- **Rich Analysis**: Model families, storage usage, error tracking, recommendations
- **Interactive HTML**: Beautiful web-based reports with styling and tables
- **Comparison Reports**: Before/after model state analysis

### 💬 **Chat Experience**

- **Phased Thinking Indicators**: The chat UI provides real-time phase feedback during queries:
  - 🔍 **Searching documents...** (blue) — RAG retrieval phase
  - 🧠 **Reasoning...** (purple) — Model thinking phase (thinking models only)
  - ✍️ **Writing response...** (green) — Response generation phase
- **Reasoning Disclosure**: Thinking models (e.g., `deepseek-r1`) expose their chain-of-thought in a collapsible block, allowing users to audit the model's reasoning process
- **Elapsed Timer**: A live timer displays throughout all phases so users always know the task is active
- **Smart Ingestion**: Source Manifest system tracks content hashes per collection, skipping unchanged files, detecting renames without re-embedding, and cleaning up orphaned data

## Project Structure

```
Local-RAG-Project-v2/
├── PowerShell Scripts/
│   ├── XMLLogger.ps1           # Core XML logging functionality
│   ├── XMLParser.ps1           # Enhanced schema-aware XML parsing
│   ├── Schemas.ps1             # Centralized schema definitions
│   ├── ModelUtils.ps1          # AI model detection and management
│   ├── ReportUtils.ps1         # Comprehensive report generation
│   ├── PathUtils.ps1           # Centralized path management
│   ├── ConsoleUtils.ps1        # Standardized console output (NEW)
│   ├── SystemUtils.ps1         # System information collection (NEW)
│   ├── FileUtils.ps1           # File operations management (NEW)
│   ├── DateTimeUtils.ps1       # Date/time formatting utilities (NEW)
│   ├── ValidationUtils.ps1     # Input validation & error handling (NEW)
│   ├── check-models.ps1        # Enhanced model checking with detailed logging
│   ├── Test-XMLParser.ps1      # Comprehensive testing and demonstrations
│   ├── Test-NewUtilities.ps1   # Integration test for new utilities (NEW)
│   ├── Run-Tests.ps1           # Pester test runner (NEW)
│   └── Tests/                  # Pester unit tests (NEW)
│       ├── pester.config.ps1   # Pester configuration
│       ├── XMLLogger.Tests.ps1 # XMLLogger tests
│       ├── ModelUtils.Tests.ps1# ModelUtils tests
│       └── Schemas.Tests.ps1   # Schemas tests
├── Logs/                       # Generated XML logs
│   └── Reports/                # Generated text and HTML reports
├── html_pages/                 # Interactive HTML dashboards
├── README.md                   # This documentation
├── UTILITY_ABSTRACTIONS_SUMMARY.md  # New utilities documentation (NEW)
└── Generated Files:
    ├── check-*.xml                   # Structured XML logs with individual models
    ├── model-*-report-*.txt          # Detailed text reports
    ├── model-*-report-*.html         # Interactive HTML reports
    └── comparison-report-*.txt       # Model state comparison reports
```

## Key Improvements

### 🎯 **Better Model Data Structure**

**Before**: Models were stored as concatenated strings

```xml
<LogEntry>
  <Data>
    <models>model1; model2; model3</models>
  </Data>
</LogEntry>
```

**After**: Each model gets individual structured entries

```xml
<LogEntry level="INFO" category="MODEL">
  <Message>Model details: llama3.1:8b</Message>
  <Data>
    <name>llama3.1:8b</name>
    <family>llama3.1</family>
    <size>4.9</size>
    <id>42182c407b2b</id>
    <modified>2 weeks ago</modified>
  </Data>
</LogEntry>
```

### 🔧 **Reusable Utilities**

#### **ModelUtils.ps1**

```powershell
# Simple model checking
Test-OllamaInstallation -Detailed $true

# Get models as objects or names
$models = Get-OllamaModels -AsObjects $true
$modelNames = Get-OllamaModels

# Get comprehensive summary
$summary = Get-ModelSummary
```

#### **ReportUtils.ps1**

```powershell
# Generate reports in different formats
$textReport = New-ModelReport -LogEntries $data -Format "text"
$htmlReport = New-ModelReport -LogEntries $data -Format "html"

# Compare model states over time
$comparison = Compare-ModelStates -BeforeEntries $before -AfterEntries $after
```

#### **Schemas.ps1**

```powershell
# Get schema registry and explore available schemas
$registry = Get-SchemaRegistry
$registry.PrintAllSchemas()

# Detect schema from XML document
$schema = $registry.DetectSchema($xmlDoc)
```

#### **PathUtils.ps1**

```powershell
# Centralized path management
$logPath = New-ContextualLogPath -operation "check" -context "ollama" -component "models"
$reportPath = New-ContextualReportPath -reportType "model" -context "analysis"

# File organization
Show-ProjectInfo
Clear-OldFiles -daysToKeep 30
```

### 🛠️ **New Utility Abstractions (v2.1)**

The project now includes five additional utility modules that eliminate code duplication and provide standardized functionality across all scripts:

#### **ConsoleUtils.ps1** - Standardized Console Output

```powershell
# Import console utilities
. ".\ConsoleUtils.ps1"

# Consistent formatting across all scripts
Write-Header "System Check"
Write-Section "Testing Components"
Write-SuccessMessage "All tests passed"
Write-ErrorMessage "Configuration error detected"
Write-KeyValuePair "Status" "Running" 1
Write-DetailMessage "Processing 15 files..." 2
```

**Key Features:**

- Unified color scheme across all scripts
- Consistent message formatting (headers, sections, success/error/warning)
- Proper indentation management
- Optional timestamp support
- Eliminates 50+ repetitive `Write-Host` calls

#### **SystemUtils.ps1** - System Information Collection

```powershell
# Import system utilities
. ".\SystemUtils.ps1"

# Collect system information at different detail levels
$basicInfo = Get-BasicSystemInfo
$extendedInfo = Get-ExtendedSystemInfo  # includes disk and network
$fullInfo = Get-FullSystemInfo         # includes process information

# Display formatted system information
Show-SystemInfo -Level "extended"

# Integrate with logging
Add-SystemInfoToLog -Logger $logger -Level "basic"
```

**Key Features:**

- Centralized system information collection (OS, CPU, memory, disk, network)
- Configurable detail levels (basic/extended/full)
- Safe error handling for WMI/CIM queries
- Direct integration with XMLLogger
- Eliminates duplicate system info gathering across scripts

#### **FileUtils.ps1** - File Operations Management

```powershell
# Import file utilities
. ".\FileUtils.ps1"

# Safe file operations
Write-SafeFile -FilePath $path -Content $data
$content = Read-SafeFile -FilePath $path

# File size and directory management
$sizeFormatted = Format-FileSize $bytes
$inventory = Get-FileInventory -DirectoryPath $logsDir
$stats = Get-DirectoryStats -DirectoryPath $reportsDir

# Cleanup and maintenance
Clear-OldFiles -DirectoryPath $logsDir -DaysToKeep 30
$backupPath = New-FileBackup -FilePath $importantFile
```

**Key Features:**

- Standardized file size formatting (bytes/KB/MB/GB)
- Safe file operations with proper error handling
- Directory statistics and inventory management
- Automated file cleanup utilities
- File comparison and backup functions

#### **DateTimeUtils.ps1** - Date/Time Formatting

```powershell
# Import datetime utilities
. ".\DateTimeUtils.ps1"

# Standardized timestamp formats
$xmlTimestamp = Get-XmlTimestamp        # yyyy-MM-ddTHH:mm:ss.fffZ
$filenameStamp = Get-FilenameTimestamp  # yyyyMMdd-HHmmss
$displayTime = Get-Timestamp            # yyyy-MM-dd HH:mm:ss

# Performance timing
$timer = New-PerformanceTimer -OperationName "Model Check"
$timer.AddCheckpoint("Models loaded")
$timer.Stop()
Write-Host $timer.GetSummary()

# Relative time and formatting
$relativeTime = Get-RelativeTimeString $fileDate  # "2 hours ago"
$elapsed = Format-ElapsedTime $timespan           # "5m 23s"
```

**Key Features:**

- Centralized date format definitions (eliminates 15+ format patterns)
- Performance timing utilities with checkpoint support
- Relative time calculations ("2 hours ago", "3 days ago")
- Elapsed time formatting for operations
- Consistent timestamp generation across all components

#### **ValidationUtils.ps1** - Input Validation & Error Handling

```powershell
# Import validation utilities
. ".\ValidationUtils.ps1"

# File and path validation
if (-not (Test-FileExists $configFile)) { return }
if (-not (Test-DirectoryExists $logsDir)) { return }

# Safe operation execution
$result = Invoke-SafeOperation {
    # Risky operation that might fail
    Invoke-RestMethod $apiUrl
} -Operation "API Call" -Context "Model Check"

# Comprehensive validation
$validator = New-ValidationHelper
$validator.ValidateFileExists($logFile, "Log File")
$validator.ValidatePattern($modelName, "^[a-zA-Z0-9\-\.]+$", "Model Name")
$validator.ValidateRange($timeout, 1, 300, "Timeout")

if ($validator.HasErrors()) {
    Write-Warning ($validator.GetErrors() -join "; ")
    return
}
```

**Key Features:**

- Comprehensive validation helpers (files, directories, strings, numbers, patterns)
- Centralized error collection and reporting
- Safe operation execution with automatic error handling
- Network connectivity and service validation
- XML structure validation with schema checking

### 📈 **Utility Integration Benefits**

**Code Reduction:**

- **~30% fewer lines** through elimination of duplication
- **Single source of truth** for formatting, validation, and operations
- **Centralized maintenance** - update behavior in one place

**Consistency Improvements:**

- **Unified console output** across all scripts
- **Standardized error handling** and validation patterns
- **Consistent timestamp formats** and system information collection

**Enhanced Robustness:**

- **Safe file operations** with proper error handling
- **Comprehensive validation** before operations
- **Performance monitoring** with built-in timing utilities
- **Better error messages** with contextual information

## Usage Examples

### **Enhanced Model Check with New Utilities**

```powershell
# Run the enhanced model check (now using new utilities internally)
.\check-models.ps1
```

### **Testing New Utilities Integration**

```powershell
# Test all new utilities together
.\Test-NewUtilities.ps1
```

This demonstrates:

- Console output standardization
- System information collection
- File operations management
- Date/time formatting consistency
- Input validation and error handling
- Integration with existing XMLLogger and PathUtils

### **Basic Model Check**

```powershell
.\check-models.ps1
```

Generates:

- Enhanced console output with model families
- Structured XML log with individual model entries
- Comprehensive text report
- Interactive HTML dashboard

### **Advanced XML Parsing**

```powershell
.\Test-XMLParser.ps1
```

Demonstrates:

- Schema detection across multiple formats
- Advanced filtering and analysis
- Report generation in multiple formats
- Model family grouping and analysis

### **Custom Analysis**

```powershell
# Import utilities
. ".\XMLParser.ps1"
. ".\ReportUtils.ps1"

# Parse log and generate custom report
$parser = [XMLParser]::new()
$data = $parser.ParseXMLFile("ollama-check-log.xml")

# Filter for specific analysis
$modelEntries = $parser.FilterEntries($data, @{ "category" = "MODEL" })
$errorEntries = $parser.FilterEntries($data, @{ "level" = "ERROR" })

# Generate reports
$report = New-ModelReport -LogEntries $data -Format "html"
```

## Sample Output

### **Console Output**

```
=== ENHANCED OLLAMA MODEL CHECK ===
✓ Ollama is installed: ollama version is 0.12.2
✓ Ollama is running

Available models:
  llama3.1:8b (4.9) - Modified: 2 weeks ago
  mistral:latest (4.1) - Modified: 3 days ago
  ...

Model Families:
  llama3.1: 1 models
  mistral: 1 models
  deepseek-r1: 2 models
  ...

✓ Enhanced XML log saved to: ollama-check-log.xml
✓ Detailed report saved to: model-report-20250925-115359.txt
✓ HTML report saved to: model-report-20250925-115359.html
```

### **XML Structure**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PowerShellLog session="Ollama-Enhanced-Check-YYYYMMDD-HHMMSS" startTime="2025-09-25T11:53:58Z" machine="DESKTOP-XXXXXXX">
  <LogEntry timestamp="2025-09-25T11:53:58Z" level="SUCCESS" category="INSTALLATION">
    <Message>Ollama is installed</Message>
    <Data>
      <version>ollama version is 0.12.2</version>
      <isAvailable>True</isAvailable>
      <modelCount>14</modelCount>
    </Data>
  </LogEntry>
  <LogEntry timestamp="2025-09-25T11:53:59Z" level="INFO" category="MODEL">
    <Message>Model details: llama3.1:8b</Message>
    <Data>
      <name>llama3.1:8b</name>
      <family>llama3.1</family>
      <size>4.9</size>
      <id>42182c407b2b</id>
    </Data>
  </LogEntry>
</PowerShellLog>
```

## Advanced Features

### **Schema-Aware Parsing**

- Automatic detection of log formats
- Support for PowerShell, Windows Events, System Monitoring
- Intelligent fallback parsing for unknown formats
- Schema validation and error handling

### **Comprehensive Reports**

- **Text Reports**: Detailed analysis with recommendations
- **HTML Dashboards**: Interactive web-based visualization
- **Comparison Reports**: Track changes over time
- **Model Analytics**: Family grouping, storage analysis, usage patterns

### **Error Handling & Validation**

- Robust error handling throughout the pipeline
- Schema validation with helpful error messages
- Graceful degradation for missing components
- Comprehensive logging of issues and suggestions

## Testing

### **Pester Unit Tests**

The project uses [Pester 5.x](https://pester.dev/) for automated testing. Tests are organized in the `PowerShell Scripts/Tests/` directory.

**Run all tests:**

```powershell
# Quick run
pwsh -File "PowerShell Scripts\Run-Tests.ps1"

# Or with detailed output
cd "PowerShell Scripts"
Invoke-Pester -Path ./Tests -Output Detailed
```

**Test Coverage:**
| Test File | Tests | Coverage |
|-----------|-------|----------|
| XMLLogger.Tests.ps1 | 10 | Schema versioning, XML sanitization, log levels |
| ModelUtils.Tests.ps1 | 13 | Version detection, system info, model operations |
| Schemas.Tests.ps1 | 10 | Schema registration, detection, validation |

**Tags:**

- `Integration` - Tests requiring external services (Ollama)
- Default tests run without external dependencies

### **Ollama Compatibility**

Tested Ollama versions: **0.12.0, 0.12.2, 0.13.0**  
Minimum supported version: **0.12.0**

The project will warn if you're using an untested Ollama version.

### **CI/CD Pipeline**

The project includes GitHub Actions workflows for automated testing and linting:

| Workflow | File                         | Trigger         | Purpose                 |
| -------- | ---------------------------- | --------------- | ----------------------- |
| Tests    | `.github/workflows/test.yml` | Push/PR to main | Runs Pester tests       |
| Lint     | `.github/workflows/lint.yml` | Push/PR to main | PSScriptAnalyzer checks |

**Test Results:**

- Artifacts uploaded as `test-results`
- NUnit XML format for integration with test reporters
- Excludes `Integration` and `Slow` tagged tests by default

---

## Future Enhancements

### **Planned Features**

- **Database Integration**: Store model history in SQLite/PostgreSQL
- **Performance Metrics**: Model performance tracking and benchmarking
- **Alert System**: Notifications for model changes or issues
- **Web Dashboard**: Live web interface for model management
- **API Integration**: REST API for programmatic access
- **Export Formats**: JSON, CSV, Excel export options

### **Utility Enhancements**

- **Extended ConsoleUtils**: Progress bars, interactive prompts, rich text formatting
- **Advanced SystemUtils**: Real-time monitoring, performance counters, resource alerts
- **Enhanced FileUtils**: File compression, encryption, advanced search capabilities
- **DateTimeUtils Extensions**: Timezone handling, calendar integration, scheduling utilities
- **ValidationUtils Expansion**: Network validation, complex business rules, async validation

### **Schema Extensions**

- **Performance Logging**: Model inference times and resource usage
- **Usage Analytics**: Model usage patterns and statistics
- **Health Monitoring**: Model health checks and diagnostics
- **Version Tracking**: Model version management and rollback

## Contributing

To extend this project:

1. **Add New Schemas**: Extend `Schemas.ps1` with new format definitions
2. **Create New Utilities**: Follow the modular pattern in existing utility files
3. **Enhance Reports**: Add new report formats to `ReportUtils.ps1`
4. **Add Monitors**: Create new monitoring scripts following the `check-models.ps1` pattern

## License

This project is provided as-is for educational and development purposes. Feel free to modify and extend according to your needs.
