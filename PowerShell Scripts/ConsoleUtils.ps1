# ConsoleUtils.ps1 - Console output formatting utilities

# Color scheme for consistent console output
$script:ColorScheme = @{
    "header"  = "Cyan"
    "success" = "Green" 
    "warning" = "Yellow"
    "error"   = "Red"
    "info"    = "Blue"
    "detail"  = "Gray"
    "muted"   = "DarkGray"
}

# Console formatting functions
function Write-Header {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Text,
        [string]$Separator = "="
    )
    
    $separatorLine = $Separator * $Text.Length
    Write-Host "`n$separatorLine" -ForegroundColor $script:ColorScheme["header"]
    Write-Host $Text -ForegroundColor $script:ColorScheme["header"]
    Write-Host "$separatorLine`n" -ForegroundColor $script:ColorScheme["header"]
}

function Write-Section {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Text,
        [string]$Separator = "-"
    )
    
    Write-Host "`n$Text" -ForegroundColor $script:ColorScheme["info"]
    Write-Host ($Separator * $Text.Length) -ForegroundColor $script:ColorScheme["info"]
}

function Write-SuccessMessage {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    
    Write-Host "✓ $Message" -ForegroundColor $script:ColorScheme["success"]
}

function Write-WarningMessage {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    
    Write-Host "⚠ $Message" -ForegroundColor $script:ColorScheme["warning"]
}

function Write-ErrorMessage {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    
    Write-Host "✗ $Message" -ForegroundColor $script:ColorScheme["error"]
}

function Write-InfoMessage {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    
    Write-Host "ℹ $Message" -ForegroundColor $script:ColorScheme["info"]
}

function Write-DetailMessage {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message,
        [int]$IndentLevel = 1
    )
    
    $indent = "  " * $IndentLevel
    Write-Host "$indent$Message" -ForegroundColor $script:ColorScheme["detail"]
}

function Write-MutedMessage {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message,
        [int]$IndentLevel = 1
    )
    
    $indent = "  " * $IndentLevel
    Write-Host "$indent$Message" -ForegroundColor $script:ColorScheme["muted"]
}

function Write-KeyValuePair {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Key,
        [Parameter(Mandatory=$true)]
        $Value,
        [int]$IndentLevel = 1
    )
    
    $indent = "  " * $IndentLevel
    Write-Host "$indent$Key`: " -NoNewline -ForegroundColor $script:ColorScheme["info"]
    Write-Host $Value -ForegroundColor $script:ColorScheme["detail"]
}

function Write-Status {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Operation,
        [Parameter(Mandatory=$true)]
        [string]$Status
    )
    
    Write-Host "`n$Operation..." -ForegroundColor $script:ColorScheme["info"] -NoNewline
    Write-Host " $Status" -ForegroundColor $script:ColorScheme["success"]
}

function Write-Separator {
    param(
        [string]$Character = "-",
        [int]$Length = 50
    )
    
    Write-Host ($Character * $Length) -ForegroundColor $script:ColorScheme["muted"]
}