# ValidationUtils.ps1 - Input validation and error handling utilities

class ValidationHelper {
    [hashtable]$ValidationRules
    [string[]]$ErrorMessages
    
    ValidationHelper() {
        $this.ValidationRules = @{}
        $this.ErrorMessages = @()
    }
    
    [void] ClearErrors() {
        $this.ErrorMessages = @()
    }
    
    [bool] HasErrors() {
        return $this.ErrorMessages.Count -gt 0
    }
    
    [string[]] GetErrors() {
        return $this.ErrorMessages
    }
    
    [void] AddError([string]$message) {
        $this.ErrorMessages += $message
    }
    
    # File and path validation
    [bool] ValidateFileExists([string]$filePath, [string]$parameterName = "File") {
        if ([string]::IsNullOrWhiteSpace($filePath)) {
            $this.AddError("$parameterName path cannot be null or empty")
            return $false
        }
        
        if (-not (Test-Path $filePath -PathType Leaf)) {
            $this.AddError("$parameterName does not exist: $filePath")
            return $false
        }
        
        return $true
    }
    
    [bool] ValidateDirectoryExists([string]$directoryPath, [string]$parameterName = "Directory") {
        if ([string]::IsNullOrWhiteSpace($directoryPath)) {
            $this.AddError("$parameterName path cannot be null or empty")
            return $false
        }
        
        if (-not (Test-Path $directoryPath -PathType Container)) {
            $this.AddError("$parameterName does not exist: $directoryPath")
            return $false
        }
        
        return $true
    }
    
    [bool] ValidateFileExtension([string]$filePath, [string[]]$validExtensions, [string]$parameterName = "File") {
        if (-not $this.ValidateFileExists($filePath, $parameterName)) {
            return $false
        }
        
        $extension = [System.IO.Path]::GetExtension($filePath)
        if ($extension -notin $validExtensions) {
            $this.AddError("$parameterName must have one of these extensions: $($validExtensions -join ', '). Found: $extension")
            return $false
        }
        
        return $true
    }
    
    # String validation
    [bool] ValidateNotEmpty([string]$value, [string]$parameterName = "Value") {
        if ([string]::IsNullOrWhiteSpace($value)) {
            $this.AddError("$parameterName cannot be null, empty, or whitespace")
            return $false
        }
        return $true
    }
    
    [bool] ValidateStringLength([string]$value, [int]$minLength, [int]$maxLength, [string]$parameterName = "Value") {
        if (-not $this.ValidateNotEmpty($value, $parameterName)) {
            return $false
        }
        
        if ($value.Length -lt $minLength) {
            $this.AddError("$parameterName must be at least $minLength characters long")
            return $false
        }
        
        if ($value.Length -gt $maxLength) {
            $this.AddError("$parameterName must be no more than $maxLength characters long")
            return $false
        }
        
        return $true
    }
    
    [bool] ValidatePattern([string]$value, [string]$pattern, [string]$parameterName = "Value") {
        if (-not $this.ValidateNotEmpty($value, $parameterName)) {
            return $false
        }
        
        if ($value -notmatch $pattern) {
            $this.AddError("$parameterName does not match the required pattern: $pattern")
            return $false
        }
        
        return $true
    }
    
    # Numeric validation
    [bool] ValidateRange([int]$value, [int]$min, [int]$max, [string]$parameterName = "Value") {
        if ($value -lt $min -or $value -gt $max) {
            $this.AddError("$parameterName must be between $min and $max. Found: $value")
            return $false
        }
        return $true
    }
    
    [bool] ValidatePositive([int]$value, [string]$parameterName = "Value") {
        if ($value -le 0) {
            $this.AddError("$parameterName must be a positive number. Found: $value")
            return $false
        }
        return $true
    }
    
    # Collection validation
    [bool] ValidateNotEmpty([array]$collection, [string]$parameterName = "Collection") {
        if (-not $collection -or $collection.Count -eq 0) {
            $this.AddError("$parameterName cannot be null or empty")
            return $false
        }
        return $true
    }
    
    [bool] ValidateContains([array]$collection, [object]$value, [string]$parameterName = "Collection") {
        if (-not $this.ValidateNotEmpty($collection, $parameterName)) {
            return $false
        }
        
        if ($value -notin $collection) {
            $this.AddError("$parameterName must contain value: $value")
            return $false
        }
        
        return $true
    }
    
    # XML validation
    [bool] ValidateXmlStructure([string]$xmlPath, [string]$expectedRootElement = $null) {
        if (-not $this.ValidateFileExists($xmlPath, "XML file")) {
            return $false
        }
        
        try {
            [xml]$xmlDoc = Get-Content $xmlPath -Raw
            
            if ($expectedRootElement -and $xmlDoc.DocumentElement.Name -ne $expectedRootElement) {
                $this.AddError("XML root element should be '$expectedRootElement', found '$($xmlDoc.DocumentElement.Name)'")
                return $false
            }
            
            return $true
            
        }
        catch {
            $this.AddError("Invalid XML structure: $($_.Exception.Message)")
            return $false
        }
    }
    
    # Service/Process validation
    [bool] ValidateServiceRunning([string]$serviceName, [string]$parameterName = "Service") {
        try {
            $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
            if (-not $service) {
                $this.AddError("$parameterName '$serviceName' not found")
                return $false
            }
            
            if ($service.Status -ne 'Running') {
                $this.AddError("$parameterName '$serviceName' is not running (Status: $($service.Status))")
                return $false
            }
            
            return $true
            
        }
        catch {
            $this.AddError("Failed to check $parameterName '$serviceName': $($_.Exception.Message)")
            return $false
        }
    }
    
    [bool] ValidateProcessRunning([string]$processName, [string]$parameterName = "Process") {
        $processes = Get-Process -Name $processName -ErrorAction SilentlyContinue
        if (-not $processes) {
            $this.AddError("$parameterName '$processName' is not running")
            return $false
        }
        return $true
    }
    
    # Network validation
    [bool] ValidatePortOpen([string]$hostname, [int]$port, [int]$timeoutMs = 5000) {
        try {
            $tcpClient = New-Object System.Net.Sockets.TcpClient
            $connectTask = $tcpClient.ConnectAsync($hostname, $port)
            
            if ($connectTask.Wait($timeoutMs)) {
                $tcpClient.Close()
                return $true
            }
            else {
                $this.AddError("Port $port on $hostname is not accessible (timeout after ${timeoutMs}ms)")
                $tcpClient.Close()
                return $false
            }
            
        }
        catch {
            $this.AddError("Failed to connect to ${hostname}:${port}: $($_.Exception.Message)")
            return $false
        }
    }
    
    # Aggregate validation method
    [bool] ValidateAll([hashtable]$validationRules) {
        $this.ClearErrors()
        $allValid = $true
        
        foreach ($ruleName in $validationRules.Keys) {
            $rule = $validationRules[$ruleName]
            $result = $true
            
            switch ($rule.Type) {
                "FileExists" { 
                    $result = $this.ValidateFileExists($rule.Value, $ruleName) 
                }
                "DirectoryExists" { 
                    $result = $this.ValidateDirectoryExists($rule.Value, $ruleName) 
                }
                "NotEmpty" { 
                    $result = $this.ValidateNotEmpty($rule.Value, $ruleName) 
                }
                "Range" { 
                    $result = $this.ValidateRange($rule.Value, $rule.Min, $rule.Max, $ruleName) 
                }
                "Pattern" { 
                    $result = $this.ValidatePattern($rule.Value, $rule.Pattern, $ruleName) 
                }
                default {
                    $this.AddError("Unknown validation rule type: $($rule.Type)")
                    $result = $false
                }
            }
            
            if (-not $result) {
                $allValid = $false
            }
        }
        
        return $allValid
    }
    
    [void] ThrowIfErrors() {
        if ($this.HasErrors()) {
            throw "Validation failed:`n" + ($this.GetErrors() -join "`n")
        }
    }
}

# Error handling utilities
class ErrorHandler {
    [string]$Context
    [string[]]$ErrorLog
    
    ErrorHandler([string]$context = "General") {
        $this.Context = $context
        $this.ErrorLog = @()
    }
    
    [object] SafeExecute([ScriptBlock]$scriptBlock, [string]$operation = "Operation") {
        try {
            return & $scriptBlock
        }
        catch {
            $errorMsg = "[$($this.Context)] $operation failed: $($_.Exception.Message)"
            $this.ErrorLog += $errorMsg
            
            # Import console utilities if available
            if (Get-Command Write-ErrorMessage -ErrorAction SilentlyContinue) {
                Write-ErrorMessage $errorMsg
            }
            elseif (Test-Path "$PSScriptRoot\ConsoleUtils.ps1") {
                . "$PSScriptRoot\ConsoleUtils.ps1"
                Write-ErrorMessage $errorMsg
            }
            else {
                Write-Warning $errorMsg
            }
            
            return $null
        }
    }
    
    [void] SafeExecuteVoid([ScriptBlock]$scriptBlock, [string]$operation = "Operation") {
        $this.SafeExecute($scriptBlock, $operation) | Out-Null
    }
    
    [string[]] GetErrorLog() {
        return $this.ErrorLog
    }
    
    [void] ClearErrorLog() {
        $this.ErrorLog = @()
    }
}

# Convenience functions
function Test-FileExists {
    param([string]$FilePath, [string]$ParameterName = "File")
    $validator = [ValidationHelper]::new()
    $result = $validator.ValidateFileExists($FilePath, $ParameterName)
    if (-not $result) {
        Write-Warning ($validator.GetErrors() -join "; ")
    }
    return $result
}

function Test-DirectoryExists {
    param([string]$DirectoryPath, [string]$ParameterName = "Directory")
    $validator = [ValidationHelper]::new()
    $result = $validator.ValidateDirectoryExists($DirectoryPath, $ParameterName)
    if (-not $result) {
        Write-Warning ($validator.GetErrors() -join "; ")
    }
    return $result
}

function Test-NotEmpty {
    param([string]$Value, [string]$ParameterName = "Value")
    $validator = [ValidationHelper]::new()
    $result = $validator.ValidateNotEmpty($Value, $ParameterName)
    if (-not $result) {
        Write-Warning ($validator.GetErrors() -join "; ")
    }
    return $result
}

function Invoke-SafeOperation {
    param(
        [ScriptBlock]$ScriptBlock,
        [string]$Operation = "Operation",
        [string]$Context = "General"
    )
    
    $errorHandler = [ErrorHandler]::new($Context)
    return $errorHandler.SafeExecute($ScriptBlock, $Operation)
}

function New-ValidationHelper {
    return [ValidationHelper]::new()
}

function New-ErrorHandler {
    param([string]$Context = "General")
    return [ErrorHandler]::new($Context)
}

# Export functions for use in other scripts
# Export-ModuleMember -Function Test-FileExists, Test-DirectoryExists, Test-NotEmpty, Invoke-SafeOperation, New-ValidationHelper, New-ErrorHandler