# ErrorIntegration.ps1 - Bridges ErrorManager with XMLLogger for unified error tracking
# This file standardizes error handling patterns across the project

# ===== Standard Error Categories =====
# Use these standardized categories for consistency across the project
class ErrorCategories {
    static [string] $FileSystem = "FileSystemFailures"
    static [string] $Network = "NetworkFailures"
    static [string] $Parsing = "ParsingFailures"
    static [string] $Validation = "ValidationFailures"
    static [string] $Configuration = "ConfigurationFailures"
    static [string] $Service = "ServiceFailures"
    static [string] $General = "GeneralErrors"
    static [string] $Hash = "HashFailures"
    static [string] $Acl = "AclFailures"
    static [string] $Enumeration = "EnumerationFailures"
}

# ===== Integrated Error Handler =====
# Combines ErrorManager + XMLLogger for comprehensive error tracking
class IntegratedErrorHandler {
    # Note: Using [object] instead of [ErrorManager] for module load compatibility
    # (PowerShell classes parse types at compile time before dependencies load)
    [object]$ErrorManager  # Actually an ErrorManager instance
    [object]$Logger  # XMLLogger instance (optional)
    [bool]$LogToXml = $false
    [bool]$ThrowOnCritical = $false
    [string]$Context = "General"
    
    # Create with ErrorManager only
    IntegratedErrorHandler([string]$context) {
        $this.Context = $context
        $this.ErrorManager = New-ErrorManager
    }
    
    # Create with both ErrorManager and XMLLogger
    IntegratedErrorHandler([string]$context, [object]$logger) {
        $this.Context = $context
        $this.ErrorManager = New-ErrorManager
        $this.Logger = $logger
        $this.LogToXml = $true
    }
    
    # ===== Standardized Error Logging =====
    
    # Overload: 3 parameters (no data)
    [void] LogError([string]$category, [string]$operation, [string]$message) {
        $this.LogError($category, $operation, $message, @{})
    }
    
    # Overload: 4 parameters (with data)
    [void] LogError([string]$category, [string]$operation, [string]$message, [hashtable]$data) {
        # Add to ErrorManager
        $this.ErrorManager.AddError($category, $this.Context, $message, $operation, $data)
        
        # Also log to XML if logger is available
        if ($this.LogToXml -and $this.Logger) {
            $this.Logger.LogError($category, "$operation`: $message", $data)
        }
    }
    
    # Overload: 3 parameters (no data)
    [void] LogWarning([string]$category, [string]$operation, [string]$message) {
        $this.LogWarning($category, $operation, $message, @{})
    }
    
    # Overload: 4 parameters (with data)
    [void] LogWarning([string]$category, [string]$operation, [string]$message, [hashtable]$data) {
        # Add to ErrorManager
        $this.ErrorManager.AddWarning($category, $this.Context, $message, $operation, $data)
        
        # Also log to XML if logger is available
        if ($this.LogToXml -and $this.Logger) {
            $this.Logger.LogWarning($category, "$operation`: $message", $data)
        }
    }
    
    # Overload: 3 parameters (no data)
    [void] LogCritical([string]$category, [string]$operation, [string]$message) {
        $this.LogCritical($category, $operation, $message, @{})
    }
    
    # Overload: 4 parameters (with data)
    [void] LogCritical([string]$category, [string]$operation, [string]$message, [hashtable]$data) {
        # Log as error with critical severity indicator
        $data["severity"] = "CRITICAL"
        $this.LogError($category, $operation, "CRITICAL: $message", $data)
        
        if ($this.ThrowOnCritical) {
            throw "Critical error in $operation`: $message"
        }
    }
    
    # ===== Safe Execution Pattern =====
    
    # Overload: 2 parameters (default category)
    [object] SafeExecute([scriptblock]$scriptBlock, [string]$operation) {
        return $this.SafeExecute($scriptBlock, $operation, "GeneralErrors")
    }
    
    # Overload: 3 parameters (with category)
    [object] SafeExecute([scriptblock]$scriptBlock, [string]$operation, [string]$category) {
        try {
            return & $scriptBlock
        }
        catch {
            $this.LogError($category, $operation, $_.Exception.Message, @{
                    "exceptionType" = $_.Exception.GetType().Name
                    "stackTrace"    = $_.ScriptStackTrace
                })
            return $null
        }
    }
    
    # Overload: 2 parameters (default category)
    [bool] SafeExecuteVoid([scriptblock]$scriptBlock, [string]$operation) {
        return $this.SafeExecuteVoid($scriptBlock, $operation, "GeneralErrors")
    }
    
    # Overload: 3 parameters (with category)
    [bool] SafeExecuteVoid([scriptblock]$scriptBlock, [string]$operation, [string]$category) {
        try {
            & $scriptBlock
            return $true
        }
        catch {
            $this.LogError($category, $operation, $_.Exception.Message, @{
                    "exceptionType" = $_.Exception.GetType().Name
                    "stackTrace"    = $_.ScriptStackTrace
                })
            return $false
        }
    }
    
    # ===== Convenience Methods =====
    
    [bool] HasErrors() {
        return $this.ErrorManager.HasErrors()
    }
    
    [int] GetErrorCount() {
        return $this.ErrorManager.TotalErrors
    }
    
    [void] PrintSummary() {
        $this.ErrorManager.PrintSummary()
    }
    
    [hashtable] GetReport() {
        return $this.ErrorManager.GetErrorReport()
    }
}

# ===== Factory Functions =====

function New-IntegratedErrorHandler {
    <#
    .SYNOPSIS
        Creates a new IntegratedErrorHandler with optional XMLLogger integration
    .PARAMETER Context
        Name of the context/operation being performed
    .PARAMETER Logger
        Optional XMLLogger instance for XML error logging
    .PARAMETER ThrowOnCritical
        If true, throws exceptions on critical errors
    .EXAMPLE
        $handler = New-IntegratedErrorHandler -Context "ModelCheck"
    .EXAMPLE
        $handler = New-IntegratedErrorHandler -Context "ModelCheck" -Logger $logger
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Context,
        [object]$Logger = $null,
        [switch]$ThrowOnCritical
    )
    
    if ($Logger) {
        $handler = [IntegratedErrorHandler]::new($Context, $Logger)
    }
    else {
        $handler = [IntegratedErrorHandler]::new($Context)
    }
    
    $handler.ThrowOnCritical = $ThrowOnCritical.IsPresent
    return $handler
}

# ===== Standard Error Handling Pattern =====
# Template function showing the recommended error handling pattern

function Invoke-StandardOperation {
    <#
    .SYNOPSIS
        Template showing the standardized error handling pattern for this project
    .DESCRIPTION
        This function demonstrates how to use IntegratedErrorHandler with the
        standard error categories and logging patterns.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Operation,
        [string]$OperationName = "Unknown",
        [string]$Category = "GeneralErrors",
        [object]$Logger = $null,
        [switch]$ContinueOnError
    )
    
    # Create integrated handler
    $handler = New-IntegratedErrorHandler -Context $OperationName -Logger $Logger
    
    # Execute with error handling
    $result = $handler.SafeExecute($Operation, $OperationName, $Category)
    
    # Return result with error status
    return @{
        Success     = -not $handler.HasErrors()
        Result      = $result
        ErrorCount  = $handler.GetErrorCount()
        ErrorReport = $handler.GetReport()
    }
}

# ===== Convenience Wrappers for Common Patterns =====

function Invoke-FileOperation {
    <#
    .SYNOPSIS
        Execute a file system operation with standardized error handling
    #>
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Operation,
        [string]$FilePath,
        [string]$OperationName = "FileOperation"
    )
    
    return Invoke-StandardOperation -Operation $Operation `
        -OperationName "$OperationName`: $FilePath" `
        -Category ([ErrorCategories]::FileSystem)
}

function Invoke-NetworkOperation {
    <#
    .SYNOPSIS
        Execute a network operation with standardized error handling
    #>
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Operation,
        [string]$Endpoint,
        [string]$OperationName = "NetworkOperation"
    )
    
    return Invoke-StandardOperation -Operation $Operation `
        -OperationName "$OperationName`: $Endpoint" `
        -Category ([ErrorCategories]::Network)
}

function Invoke-ParsingOperation {
    <#
    .SYNOPSIS
        Execute a parsing operation with standardized error handling
    #>
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Operation,
        [string]$InputSource,
        [string]$OperationName = "ParseOperation"
    )
    
    return Invoke-StandardOperation -Operation $Operation `
        -OperationName "$OperationName`: $InputSource" `
        -Category ([ErrorCategories]::Parsing)
}

# ===== Export =====
# Export-ModuleMember -Function New-IntegratedErrorHandler, Invoke-StandardOperation, Invoke-FileOperation, Invoke-NetworkOperation, Invoke-ParsingOperation
