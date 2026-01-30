# ExecutionContext.ps1 - Standardized performance tracking and execution management
# Eliminates repetitive performance timing, logging, and console output patterns

# Import dependencies following project patterns (conditional loading)
try {
    . "$PSScriptRoot\XMLLogger.ps1"
    $script:XMLLoggerAvailable = $true
} catch {
    $script:XMLLoggerAvailable = $false
    Write-Verbose "XMLLogger.ps1 not available - logging features will be disabled"
}

try {
    . "$PSScriptRoot\DateTimeUtils.ps1"
    $script:DateTimeUtilsAvailable = $true
} catch {
    $script:DateTimeUtilsAvailable = $false
    Write-Verbose "DateTimeUtils.ps1 not available - fallback timing will be used"
}

try {
    . "$PSScriptRoot\ConsoleUtils.ps1"
    $script:ConsoleUtilsAvailable = $true
} catch {
    $script:ConsoleUtilsAvailable = $false
    Write-Verbose "ConsoleUtils.ps1 not available - basic console output will be used"
}

class ExecutionContext {
    [string]$OperationName
    [object]$Timer
    [object]$Logger
    [hashtable]$Metadata = @{}
    [hashtable]$Phases = @{}
    [int]$PhaseCounter = 0
    [datetime]$StartTime
    [System.Nullable[datetime]]$EndTime
    [bool]$ConsoleOutputEnabled = $true
    [bool]$LoggingEnabled = $false
    [string]$LogCategory = "EXECUTION"
    
    # Constructor with operation name and optional logging
    ExecutionContext([string]$operationName) {
        $this.OperationName = $operationName
        $this.StartTime = Get-Date
        $this.Metadata = @{}
        $this.Phases = @{}
        $this.InitializeTimer()
        $this.InitializeContext()
    }
    
    # Constructor with logging context
    ExecutionContext([string]$operationName, [string]$logContext) {
        $this.OperationName = $operationName
        $this.StartTime = Get-Date
        $this.LoggingEnabled = $true
        $this.Metadata = @{}
        $this.Phases = @{}
        $this.InitializeTimer()
        $this.InitializeLogger($logContext)
        $this.InitializeContext()
    }
    
    # Full constructor with all options
    ExecutionContext([string]$operationName, [string]$logContext, [bool]$enableConsole) {
        $this.OperationName = $operationName
        $this.StartTime = Get-Date
        $this.LoggingEnabled = $true
        $this.ConsoleOutputEnabled = $enableConsole
        $this.Metadata = @{}
        $this.Phases = @{}
        $this.InitializeTimer()
        $this.InitializeLogger($logContext)
        $this.InitializeContext()
    }
    
    # Initialize performance timer
    [void] InitializeTimer() {
        # Check if DateTimeUtils is available
        if (Get-Command -Name "New-PerformanceTimer" -ErrorAction SilentlyContinue) {
            $this.Timer = New-PerformanceTimer -OperationName $this.OperationName
        } else {
            # Fallback to simple timing
            $this.Timer = @{
                "StartTime" = $this.StartTime
                "Checkpoints" = @{}
                "OperationName" = $this.OperationName
            }
        }
    }
    
    # Initialize logger if logging context provided
    [void] InitializeLogger([string]$logContext) {
        # Try to use XMLLogger if available
        try {
            # Only try to use XMLLogger if it was successfully loaded in the dependency section
            if ($script:XMLLoggerAvailable) {
                $sessionName = "$logContext-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
                # Use XMLLogger's static method with proper parameters following project patterns
                $xmlLoggerType = [System.Type]::GetType("XMLLogger")
                if ($xmlLoggerType) {
                    $this.Logger = & $xmlLoggerType::NewWithContextualPath "execution" "context" $this.OperationName $sessionName
                } else {
                    # Fallback - try to create directly if available in session
                    $createMethod = Get-Command "New-Object" -ErrorAction SilentlyContinue
                    if ($createMethod) {
                        try {
                            # Alternative approach - use Invoke-Expression to dynamically call XMLLogger
                            $this.Logger = Invoke-Expression "[XMLLogger]::NewWithContextualPath('execution', 'context', '$($this.OperationName)', '$sessionName')"
                        } catch {
                            throw "XMLLogger available but could not instantiate: $_"
                        }
                    } else {
                        throw "XMLLogger type not properly loaded"
                    }
                }
                $this.LoggingEnabled = $true
                
                $this.Logger.LogInfo($this.LogCategory, "ExecutionContext logger initialized", @{
                    "OperationName" = $this.OperationName
                    "LogContext" = $logContext
                    "StartTime" = $this.StartTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                })
            } else {
                $this.LoggingEnabled = $false
                Write-Verbose "XMLLogger not available - logging disabled for this execution context"
            }
        } catch {
            # XMLLogger not available, disable logging gracefully
            $this.LoggingEnabled = $false
            $this.Logger = $null
            Write-Warning "Failed to initialize XMLLogger: $($_.Exception.Message). Continuing without logging."
        }
    }
    
    # Initialize execution context
    [void] InitializeContext() {
        $this.Metadata["operationName"] = $this.OperationName
        $this.Metadata["startTime"] = $this.StartTime.ToString("o")
        $this.Metadata["machine"] = $env:COMPUTERNAME
        $this.Metadata["user"] = $env:USERNAME
        
        # PowerShell version - need to check if PSVersionTable exists
        try {
            $psVersionInfo = Get-Variable -Name "PSVersionTable" -Scope Global -ErrorAction Stop
            $this.Metadata["powershellVersion"] = $psVersionInfo.Value.PSVersion.ToString()
        } catch {
            $this.Metadata["powershellVersion"] = "Unknown"
        }
        
        if ($this.ConsoleOutputEnabled -and (Get-Command -Name "Write-Header" -ErrorAction SilentlyContinue)) {
            Write-Header $this.OperationName.ToUpper()
        } elseif ($this.ConsoleOutputEnabled) {
            Write-Host "`n=== $($this.OperationName.ToUpper()) ===" -ForegroundColor Cyan
        }
        
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogInfo($this.LogCategory, "Execution started", $this.Metadata)
        }
    }
    
    # Start a named phase
    [void] StartPhase([string]$phaseName) {
        $this.PhaseCounter++
        $phaseStartTime = Get-Date
        
        $this.Phases[$phaseName] = @{
            "startTime" = $phaseStartTime
            "endTime" = $null
            "order" = $this.PhaseCounter
            "status" = "running"
        }
        
        # Console output
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-Section" -ErrorAction SilentlyContinue) {
                Write-Section $phaseName
            } else {
                Write-Host "`n$phaseName" -ForegroundColor Yellow
                Write-Host ("-" * $phaseName.Length) -ForegroundColor Yellow
            }
        }
        
        # Timer checkpoint
        if ($this.Timer -and ($this.Timer.GetType().Name -eq "PerformanceTimer")) {
            $this.Timer.AddCheckpoint("$phaseName started")
        } elseif ($this.Timer -and $this.Timer -is [hashtable] -and $this.Timer.ContainsKey("Checkpoints")) {
            $this.Timer.Checkpoints["$phaseName started"] = $phaseStartTime
        }
        
        # Logging
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogInfo("PHASE", "$phaseName started", @{
                "phaseName" = $phaseName
                "phaseOrder" = $this.PhaseCounter
                "startTime" = $phaseStartTime.ToString("o")
            })
        }
    }
    
    # Complete a named phase
    [void] CompletePhase([string]$phaseName) {
        if (-not $this.Phases.ContainsKey($phaseName)) {
            throw "Phase '$phaseName' was not started"
        }
        
        $phaseEndTime = Get-Date
        $this.Phases[$phaseName]["endTime"] = $phaseEndTime
        $this.Phases[$phaseName]["status"] = "completed"
        $phaseDuration = $phaseEndTime - $this.Phases[$phaseName]["startTime"]
        $this.Phases[$phaseName]["duration"] = $phaseDuration
        
        # Console output  
        if ($this.ConsoleOutputEnabled) {
            $formattedDuration = if (Get-Command -Name "Format-ElapsedTime" -ErrorAction SilentlyContinue) {
                Format-ElapsedTime $phaseDuration
            } else {
                "$($phaseDuration.TotalSeconds.ToString('F2'))s"
            }
            
            if (Get-Command -Name "Write-SuccessMessage" -ErrorAction SilentlyContinue) {
                Write-SuccessMessage "$phaseName completed ($formattedDuration)"
            } else {
                Write-Host "✓ $phaseName completed ($formattedDuration)" -ForegroundColor Green
            }
        }
        
        # Timer checkpoint
        if ($this.Timer -and ($this.Timer.GetType().Name -eq "PerformanceTimer")) {
            $this.Timer.AddCheckpoint("$phaseName completed")
        } elseif ($this.Timer -and $this.Timer -is [hashtable] -and $this.Timer.ContainsKey("Checkpoints")) {
            $this.Timer.Checkpoints["$phaseName completed"] = $phaseEndTime
        }
        
        # Logging
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogInfo("PHASE", "$phaseName completed", @{
                "phaseName" = $phaseName
                "duration" = $phaseDuration.TotalSeconds
                "endTime" = $phaseEndTime.ToString("o")
            })
        }
    }
    
    # Complete phase with error handling
    [void] CompletePhaseWithError([string]$phaseName, [string]$errorMessage) {
        if (-not $this.Phases.ContainsKey($phaseName)) {
            throw "Phase '$phaseName' was not started"
        }
        
        $phaseEndTime = Get-Date
        $this.Phases[$phaseName]["endTime"] = $phaseEndTime
        $this.Phases[$phaseName]["status"] = "failed"
        $this.Phases[$phaseName]["error"] = $errorMessage
        $phaseDuration = $phaseEndTime - $this.Phases[$phaseName]["startTime"]
        $this.Phases[$phaseName]["duration"] = $phaseDuration
        
        # Console output
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-ErrorMessage" -ErrorAction SilentlyContinue) {
                Write-ErrorMessage "$phaseName failed: $errorMessage"
            } else {
                Write-Host "✗ $phaseName failed: $errorMessage" -ForegroundColor Red
            }
        }
        
        # Logging
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogError("PHASE", "$phaseName failed", @{
                "phaseName" = $phaseName
                "error" = $errorMessage
                "duration" = $phaseDuration.TotalSeconds
                "endTime" = $phaseEndTime.ToString("o")
            })
        }
    }
    
    # Add custom metadata
    [void] AddMetadata([string]$key, $value) {
        $this.Metadata[$key] = $value
    }
    
    # Record a checkpoint without phase semantics
    [void] RecordCheckpoint([string]$checkpointName) {
        $checkpointTime = Get-Date
        
        # Timer checkpoint
        if ($this.Timer -and ($this.Timer.GetType().Name -eq "PerformanceTimer")) {
            $this.Timer.AddCheckpoint($checkpointName)
        } elseif ($this.Timer -and $this.Timer -is [hashtable] -and $this.Timer.ContainsKey("Checkpoints")) {
            $this.Timer.Checkpoints[$checkpointName] = $checkpointTime
        }
        
        # Console output
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-DetailMessage" -ErrorAction SilentlyContinue) {
                Write-DetailMessage "Checkpoint: $checkpointName"
            } else {
                Write-Host "  Checkpoint: $checkpointName" -ForegroundColor Gray
            }
        }
        
        # Logging
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogInfo("CHECKPOINT", $checkpointName, @{
                "checkpointTime" = $checkpointTime.ToString("o")
            })
        }
    }
    
    # Log information message (overload 1: message only)
    [void] LogInfo([string]$message) {
        $this.LogInfo($message, @{})
    }
    
    # Log information message (overload 2: message with data)
    [void] LogInfo([string]$message, [hashtable]$additionalData) {
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-InfoMessage" -ErrorAction SilentlyContinue) {
                Write-InfoMessage $message
            } else {
                Write-Host "ℹ $message" -ForegroundColor Blue
            }
        }
        
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogInfo("INFO", $message, $additionalData)
        }
    }
    
    # Log success message (overload 1: message only)
    [void] LogSuccess([string]$message) {
        $this.LogSuccess($message, @{})
    }
    
    # Log success message (overload 2: message with data)
    [void] LogSuccess([string]$message, [hashtable]$additionalData) {
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-SuccessMessage" -ErrorAction SilentlyContinue) {
                Write-SuccessMessage $message
            } else {
                Write-Host "✓ $message" -ForegroundColor Green
            }
        }
        
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogSuccess("SUCCESS", $message, $additionalData)
        }
    }
    
    # Log warning message (overload 1: message only)
    [void] LogWarning([string]$message) {
        $this.LogWarning($message, @{})
    }
    
    # Log warning message (overload 2: message with data)
    [void] LogWarning([string]$message, [hashtable]$additionalData) {
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-WarningMessage" -ErrorAction SilentlyContinue) {
                Write-WarningMessage $message
            } else {
                Write-Host "⚠ $message" -ForegroundColor Yellow
            }
        }
        
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogWarning("WARNING", $message, $additionalData)
        }
    }
    
    # Log error message (overload 1: message only) 
    [void] LogError([string]$message) {
        $this.LogError($message, @{})
    }
    
    # Log error message (overload 2: message with data)
    [void] LogError([string]$message, [hashtable]$additionalData) {
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-ErrorMessage" -ErrorAction SilentlyContinue) {
                Write-ErrorMessage $message
            } else {
                Write-Host "✗ $message" -ForegroundColor Red
            }
        }
        
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogError("ERROR", $message, $additionalData)
        }
    }
    
    # Display key-value information
    [void] DisplayInfo([string]$key, $value) {
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-KeyValuePair" -ErrorAction SilentlyContinue) {
                Write-KeyValuePair $key $value
            } else {
                Write-Host "  $key`: $value" -ForegroundColor Gray
            }
        }
    }
    
    # Get execution summary
    [hashtable] GetExecutionSummary() {
        $currentTime = Get-Date
        $totalElapsed = if ($this.EndTime) { $this.EndTime - $this.StartTime } else { $currentTime - $this.StartTime }
        
        $completedPhases = $this.Phases.Keys | Where-Object { $this.Phases[$_]["status"] -eq "completed" }
        $failedPhases = $this.Phases.Keys | Where-Object { $this.Phases[$_]["status"] -eq "failed" }
        $runningPhases = $this.Phases.Keys | Where-Object { $this.Phases[$_]["status"] -eq "running" }
        
        return @{
            "operationName" = $this.OperationName
            "startTime" = $this.StartTime
            "endTime" = $this.EndTime
            "totalElapsed" = $totalElapsed
            "completedPhases" = @($completedPhases)
            "failedPhases" = @($failedPhases)
            "runningPhases" = @($runningPhases)
            "totalPhases" = $this.Phases.Count
            "metadata" = $this.Metadata
            "status" = if ($failedPhases.Count -gt 0) { "failed" } elseif ($runningPhases.Count -gt 0) { "running" } else { "completed" }
        }
    }
    
    # Finalize execution
    [void] Finalize() {
        $this.EndTime = Get-Date
        $totalElapsed = $this.EndTime - $this.StartTime
        $summary = $this.GetExecutionSummary()
        
        # Final console output
        if ($this.ConsoleOutputEnabled) {
            Write-Host "" # Empty line
            
            if (Get-Command -Name "Write-Section" -ErrorAction SilentlyContinue) {
                Write-Section "Execution Complete"
            } else {
                Write-Host "=== Execution Complete ===" -ForegroundColor Cyan
            }
            
            $formattedElapsed = if (Get-Command -Name "Format-ElapsedTime" -ErrorAction SilentlyContinue) {
                Format-ElapsedTime $totalElapsed
            } else {
                "$($totalElapsed.TotalSeconds.ToString('F2'))s"
            }
            
            if (Get-Command -Name "Write-SuccessMessage" -ErrorAction SilentlyContinue) {
                Write-SuccessMessage "$($this.OperationName) completed"
            } else {
                Write-Host "✓ $($this.OperationName) completed" -ForegroundColor Green
            }
            
            $this.DisplayInfo("Total Time", $formattedElapsed)
            $this.DisplayInfo("Completed Phases", $summary.completedPhases.Count)
            
            if ($summary.failedPhases.Count -gt 0) {
                $this.DisplayInfo("Failed Phases", $summary.failedPhases.Count)
            }
            
            # Timer summary if available
            if ($this.Timer -and (Get-Command -Name "GetSummary" -ErrorAction SilentlyContinue)) {
                if (Get-Command -Name "Write-DetailMessage" -ErrorAction SilentlyContinue) {
                    Write-DetailMessage $this.Timer.GetSummary()
                } else {
                    Write-Host $this.Timer.GetSummary() -ForegroundColor Gray
                }
            }
        }
        
        # Final logging
        if ($this.LoggingEnabled -and $this.Logger) {
            $this.Logger.LogInfo("COMPLETION", "Operation completed", @{
                "totalTime" = $totalElapsed.TotalSeconds
                "completedPhases" = $summary.completedPhases.Count
                "failedPhases" = $summary.failedPhases.Count
                "finalStatus" = $summary.status
                "endTime" = $this.EndTime.ToString("o")
            })
            
            $this.Logger.SaveLog()
            
            if ($this.ConsoleOutputEnabled) {
                $this.DisplayInfo("Log File", $this.Logger.LogFile)
            }
        }
        
        if ($this.ConsoleOutputEnabled) {
            if (Get-Command -Name "Write-Separator" -ErrorAction SilentlyContinue) {
                Write-Separator
            } else {
                Write-Host ("-" * 50) -ForegroundColor Gray
            }
        }
    }
    
    # Finalize with error status
    [void] FinalizeWithError([string]$errorMessage) {
        $this.LogError("Execution failed: $errorMessage")
        $this.AddMetadata("finalError", $errorMessage)
        $this.Finalize()
    }
}

# Convenience functions for easy usage
function New-ExecutionContext {
    param(
        [Parameter(Mandatory=$true)]
        [string]$OperationName,
        [string]$LogContext = "",
        [switch]$DisableConsole
    )
    
    if ($LogContext) {
        return [ExecutionContext]::new($OperationName, $LogContext, (-not $DisableConsole.IsPresent))
    } else {
        $context = [ExecutionContext]::new($OperationName)
        $context.ConsoleOutputEnabled = (-not $DisableConsole.IsPresent)
        return $context
    }
}

function Invoke-WithExecutionContext {
    param(
        [Parameter(Mandatory=$true)]
        [string]$OperationName,
        [Parameter(Mandatory=$true)]
        [ScriptBlock]$ScriptBlock,
        [string]$LogContext = "",
        [switch]$DisableConsole
    )
    
    $context = New-ExecutionContext -OperationName $OperationName -LogContext $LogContext -DisableConsole:$DisableConsole
    
    try {
        $result = & $ScriptBlock $context
        $context.Finalize()
        return $result
    } catch {
        $context.FinalizeWithError($_.Exception.Message)
        throw
    }
}

# Export functions for module use
# Export-ModuleMember -Function New-ExecutionContext, Invoke-WithExecutionContext