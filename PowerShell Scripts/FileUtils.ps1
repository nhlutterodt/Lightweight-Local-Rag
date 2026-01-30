# FileUtils.ps1 - File operations and management utilities

class FileManager {
    [string]$DefaultEncoding = "UTF8"
    [hashtable]$FileSizeCache = @{}
    
    FileManager() {
        # Initialize with default settings
    }
    
    # File size utilities
    [string] FormatFileSize([long]$bytes) {
        if ($bytes -ge 1GB) {
            return "$([Math]::Round($bytes / 1GB, 2)) GB"
        } elseif ($bytes -ge 1MB) {
            return "$([Math]::Round($bytes / 1MB, 2)) MB"
        } elseif ($bytes -ge 1KB) {
            return "$([Math]::Round($bytes / 1KB, 2)) KB"
        } else {
            return "$bytes bytes"
        }
    }
    
    [double] GetFileSizeKB([string]$filePath) {
        if (Test-Path $filePath) {
            $file = Get-Item $filePath
            return [Math]::Round($file.Length / 1KB, 2)
        }
        return 0
    }
    
    [double] GetDirectorySizeKB([string]$directoryPath) {
        if (Test-Path $directoryPath) {
            $totalSize = (Get-ChildItems -Path $directoryPath -Recurse -File -ErrorAction SilentlyContinue | 
                         Measure-Object -Property Length -Sum).Sum
            if ($totalSize) {
                return [Math]::Round($totalSize / 1KB, 2)
            }
        }
        return 0
    }
    
    # Safe file operations
    [void] SafeWriteFile([string]$filePath, [string]$content) {
        try {
            # Ensure directory exists
            $directory = Split-Path $filePath -Parent
            if (-not (Test-Path $directory)) {
                New-Item -Path $directory -ItemType Directory -Force | Out-Null
            }
            
            # Write content with UTF8 encoding
            $content | Out-File -FilePath $filePath -Encoding $this.DefaultEncoding -Force
            
        } catch {
            throw "Failed to write file '$filePath': $($_.Exception.Message)"
        }
    }
    
    [string] SafeReadFile([string]$filePath) {
        try {
            if (-not (Test-Path $filePath)) {
                throw "File not found: $filePath"
            }
            
            return Get-Content -Path $filePath -Raw -Encoding UTF8
            
        } catch {
            throw "Failed to read file '$filePath': $($_.Exception.Message)"
        }
    }
    
    [void] SafeDeleteFile([string]$filePath) {
        try {
            if (Test-Path $filePath) {
                Remove-Item -Path $filePath -Force
            }
        } catch {
            throw "Failed to delete file '$filePath': $($_.Exception.Message)"
        }
    }
    
    # File organization utilities
    [PSCustomObject[]] GetFileInventory([string]$directoryPath, [string]$filter = "*") {
        $inventory = @()
        
        if (Test-Path $directoryPath) {
            Get-ChildItem -Path $directoryPath -Filter $filter -ErrorAction SilentlyContinue | ForEach-Object {
                $inventory += [PSCustomObject]@{
                    Name = $_.Name
                    FullPath = $_.FullName
                    SizeKB = [Math]::Round($_.Length / 1KB, 2)
                    SizeFormatted = $this.FormatFileSize($_.Length)
                    CreationTime = $_.CreationTime
                    LastWriteTime = $_.LastWriteTime
                    Extension = $_.Extension
                    IsDirectory = $_.PSIsContainer
                }
            }
        }
        
        return $inventory
    }
    
    [void] CleanOldFiles([string]$directoryPath, [int]$daysToKeep = 30, [string]$pattern = "*") {
        if (-not (Test-Path $directoryPath)) {
            return
        }
        
        $cutoffDate = (Get-Date).AddDays(-$daysToKeep)
        $oldFiles = Get-ChildItem -Path $directoryPath -Filter $pattern -ErrorAction SilentlyContinue | 
                   Where-Object { $_.CreationTime -lt $cutoffDate }
        
        if ($oldFiles -and $oldFiles.Count -gt 0) {
            . "$PSScriptRoot\ConsoleUtils.ps1"
            Write-WarningMessage "Cleaning up $($oldFiles.Count) files older than $daysToKeep days from $directoryPath"
            
            foreach ($file in $oldFiles) {
                try {
                    Remove-Item -Path $file.FullName -Force
                    Write-MutedMessage "Deleted: $($file.Name)"
                } catch {
                    Write-ErrorMessage "Failed to delete $($file.Name): $($_.Exception.Message)"
                }
            }
        }
    }
    
    # Backup utilities
    [string] CreateBackup([string]$filePath, [string]$backupSuffix = ".backup") {
        if (-not (Test-Path $filePath)) {
            throw "Cannot backup file that doesn't exist: $filePath"
        }
        
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backupPath = "$filePath$backupSuffix-$timestamp"
        
        try {
            Copy-Item -Path $filePath -Destination $backupPath -Force
            return $backupPath
        } catch {
            throw "Failed to create backup of '$filePath': $($_.Exception.Message)"
        }
    }
    
    # File comparison utilities
    [bool] FilesAreEqual([string]$file1, [string]$file2) {
        if (-not (Test-Path $file1) -or -not (Test-Path $file2)) {
            return $false
        }
        
        $hash1 = Get-FileHash -Path $file1 -Algorithm SHA256
        $hash2 = Get-FileHash -Path $file2 -Algorithm SHA256
        
        return $hash1.Hash -eq $hash2.Hash
    }
    
    # Directory utilities
    [void] EnsureDirectoryExists([string]$directoryPath) {
        if (-not (Test-Path $directoryPath)) {
            try {
                New-Item -Path $directoryPath -ItemType Directory -Force | Out-Null
            } catch {
                throw "Failed to create directory '$directoryPath': $($_.Exception.Message)"
            }
        }
    }
    
    [hashtable] GetDirectoryStats([string]$directoryPath) {
        if (-not (Test-Path $directoryPath)) {
            return @{
                "exists" = $false
                "fileCount" = 0
                "totalSizeKB" = 0
                "lastModified" = $null
            }
        }
        
        $files = Get-ChildItem -Path $directoryPath -File -Recurse -ErrorAction SilentlyContinue
        $totalSize = ($files | Measure-Object -Property Length -Sum).Sum
        $lastModified = ($files | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
        
        return @{
            "exists" = $true
            "fileCount" = $files.Count
            "totalSizeKB" = if ($totalSize) { [Math]::Round($totalSize / 1KB, 2) } else { 0 }
            "totalSizeFormatted" = $this.FormatFileSize($totalSize)
            "lastModified" = $lastModified
        }
    }
}

# Global instance
$Global:FileManager = [FileManager]::new()

# Convenience functions
function Format-FileSize {
    param([long]$Bytes)
    return $Global:FileManager.FormatFileSize($Bytes)
}

function Get-FileSizeKB {
    param([string]$FilePath)
    return $Global:FileManager.GetFileSizeKB($FilePath)
}

function Get-DirectorySizeKB {
    param([string]$DirectoryPath)
    return $Global:FileManager.GetDirectorySizeKB($DirectoryPath)
}

function Write-SafeFile {
    param(
        [string]$FilePath,
        [string]$Content
    )
    $Global:FileManager.SafeWriteFile($FilePath, $Content)
}

function Read-SafeFile {
    param([string]$FilePath)
    return $Global:FileManager.SafeReadFile($FilePath)
}

function Get-FileInventory {
    param(
        [string]$DirectoryPath,
        [string]$Filter = "*"
    )
    return $Global:FileManager.GetFileInventory($DirectoryPath, $Filter)
}

function Clear-OldFiles {
    param(
        [string]$DirectoryPath,
        [int]$DaysToKeep = 30,
        [string]$Pattern = "*"
    )
    $Global:FileManager.CleanOldFiles($DirectoryPath, $DaysToKeep, $Pattern)
}

function New-FileBackup {
    param(
        [string]$FilePath,
        [string]$BackupSuffix = ".backup"
    )
    return $Global:FileManager.CreateBackup($FilePath, $BackupSuffix)
}

function Test-FilesEqual {
    param(
        [string]$File1,
        [string]$File2
    )
    return $Global:FileManager.FilesAreEqual($File1, $File2)
}

function Ensure-DirectoryExists {
    param([string]$DirectoryPath)
    $Global:FileManager.EnsureDirectoryExists($DirectoryPath)
}

function Get-DirectoryStats {
    param([string]$DirectoryPath)
    return $Global:FileManager.GetDirectoryStats($DirectoryPath)
}

# Export functions for use in other scripts
# Export-ModuleMember -Function Format-FileSize, Get-FileSizeKB, Get-DirectorySizeKB, Write-SafeFile, Read-SafeFile, Get-FileInventory, Clear-OldFiles, New-FileBackup, Test-FilesEqual, Ensure-DirectoryExists, Get-DirectoryStats