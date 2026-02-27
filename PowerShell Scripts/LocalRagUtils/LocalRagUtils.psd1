# LocalRagUtils Module Manifest
# Generated for Local RAG Project v2

@{
    # Script module file associated with this manifest
    RootModule        = 'LocalRagUtils.psm1'
    
    # Version number of this module
    ModuleVersion     = '1.0.0'
    
    # Unique ID for this module
    GUID              = 'a8b95c7d-3e2f-4a1b-9c8d-5e6f7a0b1c2d'
    
    # Author of this module
    Author            = 'Local RAG Project Team'
    
    # Company or vendor of this module
    CompanyName       = 'Local RAG Project'
    
    # Copyright statement for this module
    Copyright         = '(c) 2026 Local RAG Project. All rights reserved.'
    
    # Description of the functionality provided by this module
    Description       = 'Utility module for Local RAG Project providing path management, XML logging, schema validation, error handling, and reporting utilities.'
    
    # Minimum version of PowerShell required by this module
    PowerShellVersion = '5.1'
    
    # Scripts to process before importing the module (loads classes globally)
    ScriptsToProcess  = @(
        '../DateTimeUtils.ps1',
        '../ConsoleUtils.ps1',
        '../FileUtils.ps1',
        '../SystemUtils.ps1',
        '../PathUtils.ps1',
        '../Schemas.ps1',
        '../ValidationUtils.ps1',
        '../ErrorManager.ps1',
        '../XMLLogger.ps1',
        '../XMLParser.ps1',
        '../ErrorIntegration.ps1',
        '../OutputManager.ps1',
        '../ModelUtils.ps1',
        '../ReportUtils.ps1',
        '../DataProcessor.ps1',
        '../ExecutionContext.ps1',
        '../ScriptLoader.ps1',
        '../OllamaClient.ps1',
        '../VectorMath.ps1',
        '../VectorStore.ps1',
        '../SourceManifest.ps1',
        '../TextChunker.ps1',
        '../SmartTextChunker.ps1',
        '../PromptTemplate.ps1',
        '../ChatSession.ps1'
    )

    # Functions to export from this module - explicitly list public functions
    # Note: Since scripts are processed globally, these exports are less critical for visibility
    # but help documentation/discovery if the module wrapper aligns.
    FunctionsToExport = @(
        # PathUtils
        'Get-PathManager',
        'Get-ProjectPath',
        'Get-LogPath',
        'Get-ReportPath',
        'Get-HtmlPath',
        'New-TimestampedLogPath',
        'New-ContextualLogPath',
        'New-TimestampedReportPath',
        'New-ContextualReportPath',
        'Show-ProjectInfo',
        'Clear-OldFiles',
        'Get-ProjectConfig',
        'Invoke-LogRotation',
        
        # Schemas
        'Get-SchemaRegistry',
        
        # ErrorManager
        'New-ErrorManager',
        'Add-ErrorToManager',
        'Add-WarningToManager',
        
        # ErrorIntegration
        'New-IntegratedErrorHandler',
        'Invoke-StandardOperation',
        'Invoke-FileOperation',
        'Invoke-NetworkOperation',
        'Invoke-ParsingOperation',
        
        # XMLLogger
        'New-XMLLogger',
        
        # ValidationUtils
        'Test-FileExists',
        'Test-DirectoryExists',
        'Test-NotEmpty',
        'Invoke-SafeOperation',
        'New-ValidationHelper',
        'New-ErrorHandler',
        
        # DateTimeUtils
        'Format-DateTime',
        'Get-Duration',
        'Get-RelativeTime',
        
        # ConsoleUtils
        'Write-Section',
        'Write-KeyValuePair',
        'Write-SuccessMessage',
        'Write-ErrorMessage',
        'Write-WarningMessage',
        'Write-InfoMessage',
        
        # FileUtils
        'Get-FileHash256',
        'Test-PathAccessible',
        'Get-FormattedSize',
        
        # ModelUtils
        'Get-OllamaModels',
        'Test-OllamaConnection',
        'Get-OllamaVersion'
    )
    
    # Cmdlets to export from this module
    CmdletsToExport   = @()
    
    # Variables to export from this module
    VariablesToExport = @()
    
    # Aliases to export from this module
    AliasesToExport   = @()
    
    # Private data to pass to the module
    PrivateData       = @{
        PSData = @{
            # Tags applied to this module for module discovery
            Tags         = @('LocalRAG', 'Utility', 'Logging', 'Validation')
            
            # Project URI
            ProjectUri   = 'https://github.com/nhlutterodt/Local-RAG-Project-v2'
            
            # Release notes
            ReleaseNotes = 'Initial module release - consolidated from individual utility scripts'
        }
    }
}
