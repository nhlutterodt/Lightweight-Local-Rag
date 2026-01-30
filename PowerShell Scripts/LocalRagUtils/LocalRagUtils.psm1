# LocalRagUtils.psm1 - Root module file
# Loads all utility scripts and exports public functions

# Module-level variables
$script:ModuleRoot = $PSScriptRoot
$script:ParentScriptsDir = Split-Path -Parent $PSScriptRoot

# ===== Load Order Matters =====
# Dependencies must be loaded before dependents

# Tier 1: Base utilities with no internal dependencies
$Tier1Scripts = @(
    'DateTimeUtils.ps1',
    'ConsoleUtils.ps1',
    'FileUtils.ps1',
    'SystemUtils.ps1'
)

# Tier 2: Core utilities that may depend on Tier 1
$Tier2Scripts = @(
    'PathUtils.ps1',
    'Schemas.ps1',
    'ValidationUtils.ps1',
    'ErrorManager.ps1'
)

# Tier 3: Utilities that depend on Tier 1 and Tier 2
$Tier3Scripts = @(
    'XMLLogger.ps1',
    'XMLParser.ps1',
    'ErrorIntegration.ps1',
    'OutputManager.ps1'
)

# Tier 4: Higher-level utilities
$Tier4Scripts = @(
    'ModelUtils.ps1',
    'ReportUtils.ps1',
    'DataProcessor.ps1'
)

# Optional scripts that may not always be present
$OptionalScripts = @(
    'ExecutionContext.ps1',
    'ScriptLoader.ps1'
)

# ===== Load Scripts =====

# ===== Load Scripts =====
# Note: We load scripts directly in the module scope (dot-sourcing inside a function would limit scope)

Write-Verbose "Loading LocalRagUtils module..."
Write-Verbose "Parent scripts directory: $script:ParentScriptsDir"

# Helper block for loading
$LoadScript = {
    param([string]$ScriptName, [bool]$Required = $true)
    
    $scriptPath = Join-Path $script:ParentScriptsDir $ScriptName
    
    if (Test-Path $scriptPath) {
        try {
            Write-Verbose "  Loading: $ScriptName"
            . $scriptPath
        }
        catch {
            if ($Required) {
                Write-Error "Failed to load required script: $ScriptName - $($_.Exception.Message)"
                throw
            }
            else {
                Write-Warning "Failed to load optional script: $ScriptName - $($_.Exception.Message)"
            }
        }
    }
    elseif ($Required) {
        Write-Error "Required script not found: $scriptPath"
        throw "Required script not found: $ScriptName"
    }
    else {
        Write-Verbose "  Optional script not found: $ScriptName"
    }
}

# Loading logic handled by ScriptsToProcess in manifest to ensure classes are globally visible
# Write-Verbose "Loading Tier 1 scripts..."
# foreach ($script in $Tier1Scripts) {
#     . $LoadScript -ScriptName $script
# }
# ... (Loading loops commented out) ...


# ===== Module Initialization =====

# Ensure singletons are initialized (these should now be defined)
try {
    # Initialize PathManager if available
    try {
        $null = Get-PathManager
        Write-Verbose "PathManager singleton initialized"
    }
    catch {
        Write-Verbose "Get-PathManager not available or failed to initialize - PathUtils.ps1 may not have loaded"
    }
    
    # Initialize SchemaRegistry if available
    try {
        $null = Get-SchemaRegistry
        Write-Verbose "SchemaRegistry singleton initialized"
    }
    catch {
        Write-Verbose "Get-SchemaRegistry not available or failed to initialize - Schemas.ps1 may not have loaded"
    }
}
catch {
    Write-Warning "Error initializing singletons: $($_.Exception.Message)"
}

Write-Verbose "LocalRagUtils module loaded successfully."

# ===== Exported Functions =====
# Explicitly export public functions (required for dot-sourced scripts)
Export-ModuleMember -Function @(
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
    
    # ErrorIntegration
    'New-IntegratedErrorHandler',
    'Invoke-StandardOperation',
    'Invoke-FileOperation',
    'Invoke-NetworkOperation',
    'Invoke-ParsingOperation',
    
    # ValidationUtils
    'Test-FileExists',
    'Test-DirectoryExists',
    'Test-NotEmpty',
    'Invoke-SafeOperation',
    'New-ValidationHelper',
    
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
    'Get-OllamaVersion',
    
    # XMLLogger
    'New-XMLLogger',
    
    # ReportUtils
    'New-ModelReport',
    'Compare-ModelStates',
    'Publish-Report',
    
    # DataProcessor
    'New-DataProcessor',
    'Invoke-DataProcessing',
    'Invoke-DataPipeline',
    'Test-DataSchema'
)

# ===== Cleanup on Module Removal =====
$ExecutionContext.SessionState.Module.OnRemove = {
    # Clean up any module-level resources if needed
    Write-Verbose "LocalRagUtils module unloaded."
}
