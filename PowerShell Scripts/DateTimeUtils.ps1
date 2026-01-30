# DateTimeUtils.ps1 - Date and time formatting utilities

class DateTimeFormatter {
    [hashtable]$FormatPatterns
    
    DateTimeFormatter() {
        $this.FormatPatterns = @{
            "timestamp" = "yyyy-MM-ddTHH:mm:ss.fffZ"
            "filename" = "yyyyMMdd-HHmmss"
            "display" = "yyyy-MM-dd HH:mm:ss"
            "displayShort" = "MM/dd/yyyy HH:mm"
            "logEntry" = "HH:mm:ss.fff"
            "dateOnly" = "yyyy-MM-dd"
            "timeOnly" = "HH:mm:ss"
            "iso8601" = "yyyy-MM-ddTHH:mm:ssK"
            "sortable" = "yyyy-MM-dd HH:mm:ss"
        }
    }
    
    [string] FormatDateTime([datetime]$dateTime, [string]$formatName = "display") {
        if ($this.FormatPatterns.ContainsKey($formatName)) {
            return $dateTime.ToString($this.FormatPatterns[$formatName])
        } else {
            # Assume it's a custom format string
            return $dateTime.ToString($formatName)
        }
    }
    
    [string] GetTimestamp() {
        return (Get-Date).ToString($this.FormatPatterns["timestamp"])
    }
    
    [string] GetFilenameTimestamp() {
        return (Get-Date).ToString($this.FormatPatterns["filename"])
    }
    
    [string] GetDisplayTimestamp() {
        return (Get-Date).ToString($this.FormatPatterns["display"])
    }
    
    [datetime] ParseTimestamp([string]$timestampString) {
        try {
            # Try common formats
            $formats = @(
                $this.FormatPatterns["timestamp"],
                $this.FormatPatterns["display"],
                $this.FormatPatterns["iso8601"],
                $this.FormatPatterns["sortable"]
            )
            
            foreach ($format in $formats) {
                try {
                    return [datetime]::ParseExact($timestampString, $format, $null)
                } catch {
                    continue
                }
            }
            
            # Fall back to standard parsing
            return [datetime]::Parse($timestampString)
            
        } catch {
            throw "Unable to parse timestamp: $timestampString"
        }
    }
    
    [timespan] GetElapsedTime([datetime]$startTime) {
        return (Get-Date) - $startTime
    }
    
    [string] FormatElapsedTime([timespan]$elapsed) {
        if ($elapsed.TotalDays -ge 1) {
            return "$($elapsed.Days)d $($elapsed.Hours)h $($elapsed.Minutes)m"
        } elseif ($elapsed.TotalHours -ge 1) {
            return "$($elapsed.Hours)h $($elapsed.Minutes)m $($elapsed.Seconds)s"
        } elseif ($elapsed.TotalMinutes -ge 1) {
            return "$($elapsed.Minutes)m $($elapsed.Seconds)s"
        } else {
            return "$($elapsed.Seconds)s $($elapsed.Milliseconds)ms"
        }
    }
    
    [string] GetRelativeTimeString([datetime]$dateTime) {
        $now = Get-Date
        $diff = $now - $dateTime
        
        if ($diff.TotalDays -ge 7) {
            return "$([Math]::Floor($diff.TotalDays / 7)) weeks ago"
        } elseif ($diff.TotalDays -ge 1) {
            return "$([Math]::Floor($diff.TotalDays)) days ago"
        } elseif ($diff.TotalHours -ge 1) {
            return "$([Math]::Floor($diff.TotalHours)) hours ago"
        } elseif ($diff.TotalMinutes -ge 1) {
            return "$([Math]::Floor($diff.TotalMinutes)) minutes ago"
        } else {
            return "just now"
        }
    }
    
    [bool] IsOlderThan([datetime]$dateTime, [int]$days) {
        $cutoff = (Get-Date).AddDays(-$days)
        return $dateTime -lt $cutoff
    }
    
    [hashtable] GetTimeRangeFilter([int]$daysBack) {
        $endTime = Get-Date
        $startTime = $endTime.AddDays(-$daysBack)
        
        return @{
            "startTime" = $startTime
            "endTime" = $endTime
            "startTimeString" = $this.FormatDateTime($startTime, "display")
            "endTimeString" = $this.FormatDateTime($endTime, "display")
        }
    }
}

# Performance timing utilities
class PerformanceTimer {
    [datetime]$StartTime
    [System.Nullable[datetime]]$EndTime
    [string]$OperationName
    [hashtable]$Checkpoints
    
    PerformanceTimer([string]$operationName = "Operation") {
        $this.OperationName = $operationName
        $this.StartTime = Get-Date
        $this.Checkpoints = @{}
    }
    
    [void] AddCheckpoint([string]$checkpointName) {
        $this.Checkpoints[$checkpointName] = Get-Date
    }
    
    [void] Stop() {
        $this.EndTime = Get-Date
    }
    
    [timespan] GetElapsed() {
        if ($null -ne $this.EndTime) {
            $currentEndTime = $this.EndTime
        } else {
            $currentEndTime = Get-Date
        }
        return $currentEndTime - $this.StartTime
    }
    
    [string] GetSummary() {
        $formatter = [DateTimeFormatter]::new()
        $elapsed = $this.GetElapsed()
        
        $summary = "Operation '$($this.OperationName)' took $($formatter.FormatElapsedTime($elapsed))"
        
        if ($this.Checkpoints.Count -gt 0) {
            $summary += "`nCheckpoints:"
            foreach ($checkpoint in $this.Checkpoints.Keys | Sort-Object { $this.Checkpoints[$_] }) {
                $checkpointTime = $this.Checkpoints[$checkpoint] - $this.StartTime
                $summary += "`n  $checkpoint`: $($formatter.FormatElapsedTime($checkpointTime))"
            }
        }
        
        return $summary
    }
}

# Global instance
$Global:DateTimeFormatter = [DateTimeFormatter]::new()

# Convenience functions
function Get-Timestamp {
    param([string]$Format = "display")
    return $Global:DateTimeFormatter.FormatDateTime((Get-Date), $Format)
}

function Get-FilenameTimestamp {
    return $Global:DateTimeFormatter.GetFilenameTimestamp()
}

function Get-XmlTimestamp {
    return $Global:DateTimeFormatter.GetTimestamp()
}

function Format-DateTime {
    param(
        [datetime]$DateTime,
        [string]$Format = "display"
    )
    return $Global:DateTimeFormatter.FormatDateTime($DateTime, $Format)
}

function Parse-Timestamp {
    param([string]$TimestampString)
    return $Global:DateTimeFormatter.ParseTimestamp($TimestampString)
}

function Get-ElapsedTime {
    param([datetime]$StartTime)
    return $Global:DateTimeFormatter.GetElapsedTime($StartTime)
}

function Format-ElapsedTime {
    param([timespan]$Elapsed)
    return $Global:DateTimeFormatter.FormatElapsedTime($Elapsed)
}

function Get-RelativeTimeString {
    param([datetime]$DateTime)
    return $Global:DateTimeFormatter.GetRelativeTimeString($DateTime)
}

function Test-IsOlderThan {
    param(
        [datetime]$DateTime,
        [int]$Days
    )
    return $Global:DateTimeFormatter.IsOlderThan($DateTime, $Days)
}

function New-PerformanceTimer {
    param([string]$OperationName = "Operation")
    return [PerformanceTimer]::new($OperationName)
}

function Measure-ScriptBlock {
    param(
        [ScriptBlock]$ScriptBlock,
        [string]$OperationName = "ScriptBlock"
    )
    
    $timer = New-PerformanceTimer -OperationName $OperationName
    
    try {
        $result = & $ScriptBlock
        $timer.Stop()
        
        return @{
            "result" = $result
            "elapsed" = $timer.GetElapsed()
            "summary" = $timer.GetSummary()
        }
    } catch {
        $timer.Stop()
        throw
    }
}

# Export functions for use in other scripts
# Export-ModuleMember -Function Get-Timestamp, Get-FilenameTimestamp, Get-XmlTimestamp, Format-DateTime, Parse-Timestamp, Get-ElapsedTime, Format-ElapsedTime, Get-RelativeTimeString, Test-IsOlderThan, New-PerformanceTimer, Measure-ScriptBlock