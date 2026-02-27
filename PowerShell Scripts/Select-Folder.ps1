<#
.SYNOPSIS
    Select-Folder.ps1
    Opens a native folder selection dialog based on the host operating system.

.DESCRIPTION
    Cross-platform folder picker. Uses System.Windows.Forms on Windows, 
    Zenity on Linux, and osascript on macOS to show a native directory chooser.
    Outputs a structured JSON result {"status": "success|canceled", "path": "..."} 
    so the Node.js backend can process it predictably.
#>

$ErrorActionPreference = "Stop"

function Show-WindowsFolderDialog {
    $vbsPath = Join-Path $env:TEMP "LocalRagSelectFolder_$([guid]::NewGuid().ToString('N')).vbs"
    $vbsCode = @"
Set objShell = CreateObject("Shell.Application")
' 0x200 = BIF_NEWDIALOGSTYLE
Set objFolder = objShell.BrowseForFolder(0, "Select a folder to vectorize", &H200, 0)
If objFolder Is Nothing Then
    Wscript.Echo "CANCELED"
Else
    Wscript.Echo objFolder.Self.Path
End If
"@
    
    try {
        Set-Content -Path $vbsPath -Value $vbsCode -ErrorAction Stop
        
        # Execute via cscript which handles GUI completely independently from Node's stdin/hidden window boundaries
        $result = (cscript.exe //nologo $vbsPath).Trim()
        
        if ($result -ne "CANCELED" -and (-not [string]::IsNullOrWhiteSpace($result))) {
            return $result
        }
    } finally {
        Remove-Item $vbsPath -ErrorAction SilentlyContinue
    }
    
    return $null
}

function Show-LinuxFolderDialog {
    try {
        if (Get-Command "zenity" -ErrorAction SilentlyContinue) {
            $path = (zenity --file-selection --directory --title="Select Folder to Vectorize").Trim()
            if ($LASTEXITCODE -eq 0 -and (-not [string]::IsNullOrWhiteSpace($path))) {
                return $path
            }
        }
        else {
            Write-Warning "Zenity is not installed. Cannot open folder dialog on Linux."
        }
    }
    catch {
        # Dialog canceled or error
    }
    return $null
}

function Show-MacOsFolderDialog {
    try {
        $path = (osascript -e 'POSIX path of (choose folder with prompt "Select a folder to vectorize:")').Trim()
        if (-not [string]::IsNullOrWhiteSpace($path)) {
            return $path
        }
    }
    catch {
        # Dialog canceled or error
    }
    return $null
}

# --- Execution ---

$selectedPath = $null

try {
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        if ($IsWindows) {
            $selectedPath = Show-WindowsFolderDialog
        }
        elseif ($IsLinux) {
            $selectedPath = Show-LinuxFolderDialog
        }
        elseif ($IsMacOS) {
            $selectedPath = Show-MacOsFolderDialog
        }
        else {
            Write-Warning "Unsupported operating system"
        }
    }
    else {
        # Fallback for Windows PowerShell 5.1
        $selectedPath = Show-WindowsFolderDialog
    }
    
    if ($null -ne $selectedPath) {
        $output = @{
            status = "success"
            path   = $selectedPath
        }
    }
    else {
        $output = @{
            status = "canceled"
            path   = $null
        }
    }
}
catch {
    $output = @{
        status  = "error"
        message = $_.Exception.Message
    }
}

# Output as JSON for Node to easily parse
$output | ConvertTo-Json -Compress
