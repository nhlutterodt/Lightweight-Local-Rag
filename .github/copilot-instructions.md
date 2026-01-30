# Local RAG Project - AI Assistant Guidelines

This project builds an AI system that understands a user's machine through XML-based logging and intelligent parsing. The architecture consists of PowerShell-based monitoring tools that generate structured logs for later analysis.

## Core Architecture

- **XMLLogger.ps1**: Structured XML logging with predefined schema (`PowerShellLog` → `LogEntry` elements)
- **XMLParser.ps1**: Intelligent parser that auto-detects XML schemas and provides fallback parsing
- **check-models.ps1**: Example system monitor for Ollama AI models with XML logging
- **Test-XMLParser.ps1**: Comprehensive testing and demonstration script

## Key Patterns

### XML Schema Structure
The project uses a consistent XML logging schema:
```xml
<PowerShellLog session="name" startTime="ISO8601" machine="hostname">
  <LogEntry timestamp="ISO8601" level="INFO|SUCCESS|WARNING|ERROR" category="SYSTEM|SERVICE|etc">
    <Message>Human-readable message</Message>
    <Data>
      <key>value</key>
    </Data>
  </LogEntry>
</PowerShellLog>
```

### Class-Based Architecture
- Use PowerShell classes for structured functionality
- Logger and Parser are separate concerns with clean interfaces
- Both classes support hashtable parameters for flexible data handling

### Intelligent Schema Detection
The `XMLParser` class implements fallback schema detection:
1. Attempts to match known schemas (PowerShellLog, WindowsEventLog)
2. Infers schema from document structure
3. Falls back to generic parsing
4. Always preserves raw XML for debugging

## Development Workflows

### Testing New Components
Run the complete test suite: `.\Test-XMLParser.ps1`
This demonstrates all parser capabilities and generates sample reports.

### Adding New Monitors
Follow the pattern in `check-models.ps1`:
1. Import XMLLogger: `. "$PSScriptRoot\XMLLogger.ps1"`
2. Initialize with descriptive session name
3. Use structured logging with appropriate levels and categories
4. Always call `SaveLog()` before script completion

### Parsing Custom XML
Use the `Read-XMLLog` function with filtering:
```powershell
$data = Read-XMLLog -FilePath "log.xml" -Filter @{ "level" = "ERROR" }
```

## File Conventions

- **Dot-source imports**: Use `. "$PSScriptRoot\filename.ps1"` for dependencies
- **Log files**: Name pattern `*-log.xml` for consistency
- **Reports**: Generate summary reports as `.txt` files
- **Test files**: Prefix with `Test-` and include comprehensive demonstrations

## Integration Points

- **Ollama Integration**: System monitors check for AI model availability
- **Machine Context**: All logs include machine hostname and session info
- **Time Consistency**: ISO8601 timestamps throughout for cross-system compatibility
- **Structured Data**: Use Data elements for machine-readable information, Message for human-readable content

## Error Handling Patterns

- Use try-catch blocks with XML logging for error capture
- Always log both success and failure states
- Include error details in structured Data elements
- Provide actionable suggestions in error messages (see Ollama installation prompts)

When extending this codebase, maintain the XML-first logging approach and ensure all new monitors follow the established schema patterns for consistent data analysis.