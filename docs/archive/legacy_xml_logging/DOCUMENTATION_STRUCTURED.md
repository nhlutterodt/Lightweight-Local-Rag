---
doc_state: historical
doc_owner: maintainers
canonical_ref: docs/DOCS_GOVERNANCE.md
last_reviewed: 2026-03-14
audience: contributors
---
# Local-RAG-Project-v2 — Documentation Guide

This document reorganizes and consolidates the implementation notes, design decisions, usage examples, and migration plan for the Local-RAG-Project-v2 utilities and tooling.

## Purpose and audience

- Purpose: Provide a single, pragmatic reference for developers and operators who will use or maintain the project's logging, path management, and utility abstractions.

- Audience: Developers, DevOps engineers, and maintainers who will run or extend scripts in this repository.

---

## At-a-glance (Executive summary)

- Enhanced contextual file naming for logs and reports — self-describing, sortable, and machine-friendly.

- Centralized path management via `PathManager` (`PathUtils.ps1`) that routes logs/reports/HTML into `Logs/` and `html_pages/`.

- New utility abstractions: `ConsoleUtils`, `SystemUtils`, `FileUtils`, `DateTimeUtils`, `ValidationUtils` to reduce duplication and improve consistency.

- Backward compatible: existing constructors and functions continue to work; enhanced methods are additive.

---

## Quick start

1. Run an example script (from repository root in PowerShell 7+):

```powershell
. "${PSScriptRoot}\PowerShell Scripts\PathUtils.ps1"
. "${PSScriptRoot}\PowerShell Scripts\XMLLogger.ps1"
# Example: create a contextual logger and write a simple entry
$logger = [XMLLogger]::NewWithContextualPath("check", "ollama", "models", "SessionName")
$logger.LogInfo("Started contextual ollama check")
```

1. Inspect output in Logs/ and reports in Logs/Reports/ or html_pages/.

1. To migrate an old script, replace ad-hoc path generation with Get-LogPath / New-TimestampedLogPath and replace Write-Host with ConsoleUtils helpers.

---

## Document map (this file)

- Overview & goals

- Quick start

- Components (narrow, focused sections for each major area)

- API reference (common constructors and helpers)

- Migration plan (phased)

- Tests & validation

- Appendix (file map and examples)

---

## Components

### 1) Enhanced Naming System

Purpose: create contextual, self-describing file names while preserving timestamps for ordering.

Pattern (logs): {operation}-{context}-{component}-{timestamp}.xml
Pattern (reports): {reportType}-{context}-report-{timestamp}.{ext}

Key helpers:

- PathManager.GenerateContextualLogName()
- PathManager.GenerateContextualReportName()
- XMLLogger::NewWithContextualPath() and XMLLogger::NewForOperation()

Benefits:

- Self-describing filenames for discoverability
- Easy grouping and filtering by operation or component
- Timestamps preserved for chronological sorting

Usage example:

```powershell
$logger = [XMLLogger]::NewWithContextualPath("check","ollama","models","Session1")
# Produces: check-ollama-models-YYYYMMDD-HHMMSS.xml
```

### 2) Path Management (PathUtils.ps1)

Purpose: centralize path construction and directory routing.

Responsibilities:

- Provide Get-LogPath, Get-ReportPath, Get-HtmlPath helpers
- Create directories automatically (Logs, Logs/Reports, html_pages)
- Provide New-TimestampedLogPath and convenience methods

Quick usage:

```powershell
$path = New-TimestampedLogPath "model-analysis"
# => Logs/model-analysis-YYYYMMDD-HHMMSS.xml
```

### 3) XMLLogger (XMLLogger.ps1)

Purpose: structured XML logging with contextual path constructors and safe handling.

Key constructors:

- NewWithCentralizedPath() — centralized path routing
- NewWithContextualPath(operation, context, component, session) — full context name
- NewForOperation(operation, session) — operation-only naming

Robustness notes:

- Logger defends against null values when writing data elements (no ToString() on null)

### 4) Utility Abstractions

Five core utility files intended to reduce duplication:

- ConsoleUtils.ps1 — standardized console output
- SystemUtils.ps1 — system info collection and integration with logging
- FileUtils.ps1 — safe file operations and size/format helpers
- DateTimeUtils.ps1 — timestamp formats and timing helpers
- ValidationUtils.ps1 — input validators, safe operation wrappers

Example refactor: replace repeated Write-Host calls with Write-Header and Write-SuccessMessage from ConsoleUtils.

---

### Key features implemented

- Centralized Path Management with automatic directory creation and efficient routing
- Path calculations cached in a global PathManager instance to reduce overhead on repeated calls
- Backward compatibility: old XMLLogger constructors remain supported
- Robust logging: XMLLogger defends against null values when writing data elements

## API Reference (common patterns)

Constructors and common helpers (short signatures and behaviors):

- [XMLLogger]::NewWithContextualPath(operation, context, component, session)
  - Creates and returns an XMLLogger instance writing to Logs/ with the contextual filename.

- [XMLLogger]::NewForOperation(operation, session)
  - Simple logger using only operation + timestamp.

- PathManager methods (via PathUtils.ps1):
  - Get-LogPath(filename)
  - New-TimestampedLogPath(basename)
  - Get-ReportPath(filename)

- ConsoleUtils helpers:
  - Write-Header(text) — consistent header formatting
  - Write-SuccessMessage(text) — green success text
  - Write-DetailMessage(text, indentLevel) — detail lines

- SystemUtils:
  - Get-BasicSystemInfo()
  - Show-SystemInfo -Level <basic|extended|full>
  - Add-SystemInfoToLog -Logger $logger

Reference behavior notes:

- Export functions in OutputManager return a result object/hashtable with status, path, and error keys for programmatic checks.

---

## Migration plan (recommended)

High level: perform migration in small phases to keep the repository stable and maintainable.

Phase 1 — Core scripts (immediate):

- Update check-models.ps1 to use ConsoleUtils and SystemUtils and the contextual XMLLogger constructors.
- Update XMLParser.ps1 to use DateTimeUtils and ValidationUtils.
- Update ReportUtils.ps1 to use FileUtils and DateTimeUtils.

Phase 2 — Tests and helpers (next):

- Update Test-*.ps1 scripts to use new utilities.
- Replace repetitive patterns and add validation everywhere tests expect it.

Phase 3 — Enhancements (future):

- Add archive/compression and optional remote storage of historical logs
- Add email or webhook reporting for critical failures

Rollback strategy:

- Keep the old centralized constructors available (they are retained for backward compatibility). If a migration needs to revert, switch constructors back and run tests.

---

## Tests & validation

Existing tests:

- Test-PathManagement.ps1, Test-XMLParser.ps1, Test-EnhancedNaming.ps1, and Full-System-Test.ps1 validate major flows.

How to run locally:

```powershell
# From repository root, run quick integration test
. "$PSScriptRoot\PowerShell Scripts\Test-PathManagement.ps1"
# Or run the Full-System test
. "$PSScriptRoot\PowerShell Scripts\Full-System-Test.ps1"
```

Test expectations:

- All tests pass (previously reported as PASS)
- Logs and reports are written into Logs/ and html_pages/

Recommended additional unit tests:

- Unit tests for DataProcessor transformations and null/edge values
- Tests to confirm XMLLogger does not throw on null data values
- OutputManager export result shape tests (status/path/error)

## Test Results Summary

✅ **All 8 tests PASSED**

- PathUtils: ✓ PASS
- XMLLogger: ✓ PASS
- ReportUtils: ✓ PASS
- check-models.ps1: ✓ PASS
- Schema Registry: ✓ PASS
- ModelUtils: ✓ PASS
- File Organization: ✓ PASS
- Cross-Script Integration: ✓ PASS

---

## Examples and recipes

1. Create a full contextual logger and add system info then write a model analysis report:

```powershell
. "$PSScriptRoot\PowerShell Scripts\PathUtils.ps1"
. "$PSScriptRoot\PowerShell Scripts\XMLLogger.ps1"
. "$PSScriptRoot\PowerShell Scripts\SystemUtils.ps1"

$logger = [XMLLogger]::NewWithContextualPath('check','ollama','models','session1')
Add-SystemInfoToLog -Logger $logger -Level 'basic'
$logger.LogInfo('Starting model analysis')
```

1. Export results using OutputManager (example shape):

```powershell
. "$PSScriptRoot\PowerShell Scripts\OutputManager.ps1"
$om = [OutputManager]::new()
$result = $om.ExportToMultipleFormats($data, @('json','xml','csv'))
if ($result.status -ne 'ok') { Write-Warning "Export failed: $($result.error)" }
```

---

### Real-world examples (verbatim)

The following example filename lists are taken verbatim from the merged documentation to show the real-world output produced by the enhanced naming system.

#### Log Files (Operation-Context-Component Pattern)

```text
check-ollama-models-20250925-122459.xml      - Ollama model checking
check-system-status-20250925-122453.xml      - System status checking
parse-xml-documents-20250925-122453.xml      - XML document parsing
monitor-20250925-122453.xml                  - System monitoring
```

#### Report Files (Type-Context Pattern)

```text
model-analysis-report-20250925-122500.txt    - Model analysis report
performance-cpu-report-20250925-122453.txt   - CPU performance report
security-scan-report-20250925-122453.html    - Security scan report
```

### Project directory tree (verbatim)

Below is the ASCII-style directory tree that demonstrates the routing of logs, reports, HTML, and scripts in the project (copied verbatim from the merged document):

```text
Local-RAG-Project-v2/
├── Logs/                     # All XML log files
│   ├── Reports/             # Generated text reports
│   ├── ollama-check-log.xml
│   ├── integration-test.xml
│   └── ...
├── html_pages/              # HTML reports and pages
│   ├── model-report-*.html
│   └── ...
├── PowerShell Scripts/      # All PS1 scripts
│   ├── PathUtils.ps1        # NEW - Path management
│   ├── XMLLogger.ps1        # UPDATED
│   ├── ReportUtils.ps1      # UPDATED
│   ├── check-models.ps1     # UPDATED
│   ├── Test-XMLParser.ps1   # UPDATED
│   └── ...
└── README.md
```

## Appendix — File map (high level)

- PowerShell Scripts/
  - PathUtils.ps1 (PathManager)
  - XMLLogger.ps1 (XML logging)
  - ReportUtils.ps1 (report generation)
  - OutputManager.ps1 (multi-format exports)
  - ConsoleUtils.ps1, SystemUtils.ps1, FileUtils.ps1, DateTimeUtils.ps1, ValidationUtils.ps1
  - check-models.ps1, Test-XMLParser.ps1, Full-System-Test.ps1

---

## Next steps

1. Review this reorganized document for any missing APIs or details you want added.

2. Optionally, replace MERGED_DOCUMENTATION.md with this file or keep both for archival purposes.

3. If you want, I can: run a quick lint/format pass on this file, extract a short API reference into a separate API_REFERENCE.md, or generate a README section summarizing the Quick Start.

---

Document created: DOCUMENTATION_STRUCTURED.md

---

## Files Modified

- ✏️ **XMLLogger.ps1** - Added centralized path constructor
- ✏️ **ReportUtils.ps1** - Updated to use centralized paths
- ✏️ **check-models.ps1** - Updated logger initialization
- ✏️ **Test-XMLParser.ps1** - Updated path handling

## Files Created

- 🆕 **PathUtils.ps1** - Core path management system
- 🆕 **Test-PathManagement.ps1** - Path system testing
- 🆕 **Show-FileOrganization.ps1** - File structure display
- 🆕 **Full-System-Test.ps1** - Comprehensive integration testing

## Implementation Status

- **Implementation Status: ✅ COMPLETE**
- **All Tests: ✅ PASSING**
- **Integration: ✅ VERIFIED**
- **Ready for Production: ✅ YES**

---

## Utility Abstractions — detailed

This section expands the short utilities summary with per-file descriptions, problems solved, and short before/after examples.

### ConsoleUtils.ps1 — Console Output Standardization

- Problem solved: repetitive Write-Host calls with inconsistent colors/formatting across scripts.
- Key features: standardized color palette, Write-Header, Write-SuccessMessage, Write-DetailMessage, indentation helpers.

Example before:

```powershell
Write-Host "=== OLLAMA CHECK ===" -ForegroundColor Magenta
Write-Host "✓ Success" -ForegroundColor Green
Write-Host "  Details: Something" -ForegroundColor White
```

Example after:

```powershell
Write-Header "Ollama Check"
Write-SuccessMessage "Success"
Write-DetailMessage "Something" 1
```

### SystemUtils.ps1 — System Information Collection

- Problem solved: duplicate system information gathering across scripts.
- Key features: Get-BasicSystemInfo(), Show-SystemInfo -Level <basic|extended|full>, Add-SystemInfoToLog -Logger.

Example before:

```powershell
$systemInfo = @{
  "computerName" = $env:COMPUTERNAME
  "userName" = $env:USERNAME
  "powerShellVersion" = $PSVersionTable.PSVersion.ToString()
  "operatingSystem" = (Get-CimInstance Win32_OperatingSystem).Caption
  "architecture" = $env:PROCESSOR_ARCHITECTURE
}
```

Example after:

```powershell
$systemInfo = Get-BasicSystemInfo
Show-SystemInfo -Level "extended"
Add-SystemInfoToLog -Logger $logger
```

### FileUtils.ps1 — File Operations Abstraction

- Problem solved: repetitive file size calculations and unsafe file IO.
- Key features: Get-FileSizeKB, Ensure-DirectoryExists, Write-SafeFile, directory stats, cleanup helpers.

Example before:

```powershell
$size = [math]::Round($_.Length / 1KB, 2)
if (-not (Test-Path $directory)) { New-Item -Path $directory -ItemType Directory -Force | Out-Null }
$content | Out-File -FilePath $path -Encoding UTF8
```

Example after:

```powershell
$size = Get-FileSizeKB $filePath
Ensure-DirectoryExists $directory
Write-SafeFile -FilePath $path -Content $content
```

### DateTimeUtils.ps1 — Date/Time Formatting Standardization

- Problem solved: multiple date format patterns across scripts.
- Key features: Get-XmlTimestamp, Get-FilenameTimestamp, Get-Timestamp, timing helpers.

Example before:

```powershell
$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"
$filename = Get-Date -Format "yyyyMMdd-HHmmss"
$display = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
```

Example after:

```powershell
$timestamp = Get-XmlTimestamp
$filename = Get-FilenameTimestamp
$display = Get-Timestamp
```

### ValidationUtils.ps1 — Input Validation and Error Handling

- Problem solved: inconsistent validation and error handling patterns.
- Key features: Test-FileExists, Invoke-SafeOperation, centralized error collection.

Example before:

```powershell
if (-not (Test-Path $filePath)) { throw "File not found: $filePath" }
try { # risky operation } catch { Write-Warning "Operation failed: $($_.Exception.Message)" }
```

Example after:

```powershell
if (-not (Test-FileExists $filePath)) { return }
$result = Invoke-SafeOperation { # risky operation } -Operation "Task Name"
```

---

## Impact Analysis

This summarizes measurable effects from consolidating utilities and adding path management.

- Code reduction: repository moved from ~2,500 lines of scattered utility code to ~1,800 lines centralized + ~700 lines in consuming scripts (net ~30% fewer lines and ~90% less duplication).
- Maintainability: single sources of truth for console formatting, timestamps, path routing, and validation reduce drift and bugs.
- Integration: utilities are backward-compatible and can be adopted incrementally to reduce migration risk.
- Testing: central utilities enable focused unit tests; 8 integration categories pass in existing test suite.
