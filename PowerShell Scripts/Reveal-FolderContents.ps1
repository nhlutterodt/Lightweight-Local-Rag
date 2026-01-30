<#
.SYNOPSIS
  Reveal-FolderContents.ps1
  Enumerates contents of a folder and emits standardized metadata (JSON / XML / CSV) ready for parsing and logging.

.DESCRIPTION
  - Dot-sources available helper utility scripts if present: ConsoleUtils.ps1, FileUtils.ps1, PathUtils.ps1, Schemas.ps1, XMLLogger.ps1, ReportUtils.ps1, DateTimeUtils.ps1, SystemUtils.ps1, ModelUtils.ps1.
  - Produces output using a small standardized schema per file/dir.
  - Supports output formats: json, xml, csv.
  - Calculates SHA256 for files (skips for locked/inaccessible files).
  - Adds owner/acl info, attributes, timestamps, size, extension, and a simple mime hint.
  - Gracefully degrades if helpers are missing; verbose progress and error logging built-in.
  - Designed to be easily parsed by downstream systems.

.PARAMETER Path
  Path to enumerate. Defaults to current directory.

.PARAMETER Recurse
  Recurse into subfolders.

.PARAMETER IncludeHidden
  Include hidden and system items.

.PARAMETER Output
  Output format: json (default), xml, csv

.PARAMETER OutFile
  Destination path for generated log. If omitted, automatically uses the project's Logs/ directory 
  with timestamped filename: reveal-folder-contents-YYYYMMDD-HHMMSS.<ext>

.PARAMETER Schema
  Schema name to use (if Schemas.ps1 provides one). Default: "file-item-v1"

.PARAMETER LogPath
  Path for an auxiliary log (error/warnings).

.PARAMETER MaxDepth
  Limit recursion depth when -Recurse is used. Default: 50.

.PARAMETER SkipHash
  Skip SHA256 hash calculation for files (improves performance).

.PARAMETER ParallelHash  
  Compute SHA256 hashes in parallel on PowerShell 7+ (falls back to sequential on 5.1).

.PARAMETER SkipAcl
  Skip owner/ACL collection for cross-platform runs or faster scans.

.PARAMETER ValidateSchema
  Call into Schemas.ps1 to validate output against the specified schema.

.EXAMPLE
  .\Reveal-FolderContents.ps1 -Path "C:\Users\Public\Documents" -Recurse -Output xml
  # Creates timestamped XML file in project's Logs/ directory

.EXAMPLE  
  .\Reveal-FolderContents.ps1 -Path "." -Output json -OutFile "custom-location.json"
  # Override default location with custom path

.NOTES
  - Author: Generated for you (2025)
  - Designed to integrate with your uploaded utils if present in same folder.
#>

param(
    [Parameter(Mandatory = $false)]
    [string] $Path = ".",

    [switch] $Recurse,

    [switch] $IncludeHidden,

    [ValidateSet("json", "xml", "csv")]
    [string] $Output = "json",

    [string] $OutFile = "",

    [string] $Schema = "file-item-v1",

    [string] $LogPath = "",

    [int] $MaxDepth = 50,

    [switch] $SkipHash,

    [switch] $ParallelHash,

    [switch] $SkipAcl,

    [switch] $ValidateSchema
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# --- Global error aggregation for programmatic inspection ---------------------------
$Global:RevealErrors = @{
    HashFailures        = @()
    AclFailures         = @()
    EnumerationFailures = @()
    GeneralErrors       = @()
}

# --- Performance and statistics tracking --------------------------------------------
$Script:Stats = @{
    ItemsProcessed       = 0
    FilesProcessed       = 0
    DirectoriesProcessed = 0
    HashesComputed       = 0
    HashFailures         = 0
    AclFailures          = 0
    StartTime            = Get-Date
    EndTime              = $null
}

# --- Helper: local util scripts loaded via Module -----------------------------------
$modulePath = Join-Path $PSScriptRoot "LocalRagUtils\LocalRagUtils.psd1"
if (Test-Path $modulePath) {
    try {
        Import-Module $modulePath -Force -ErrorAction Stop
        Write-Verbose "Imported LocalRagUtils module"
    }
    catch {
        Write-Warning "Failed to import LocalRagUtils module: $_"
    }
}
else {
    Write-Warning "LocalRagUtils module not found at $modulePath"
}

# Used to track loaded state for conditional logic below
$LoadedUtils = @{
    "ConsoleUtils.ps1" = (Get-Command Write-Log -ErrorAction SilentlyContinue)
    "FileUtils.ps1"    = (Get-Command Get-FileInventory -ErrorAction SilentlyContinue)
    "PathUtils.ps1"    = (Get-Command Get-PathManager -ErrorAction SilentlyContinue)
    "Schemas.ps1"      = (Get-Command Get-SchemaRegistry -ErrorAction SilentlyContinue)
    "XMLLogger.ps1"    = (Get-Command New-XMLLogger -ErrorAction SilentlyContinue)
    "ReportUtils.ps1"  = (Get-Command New-ModelReport -ErrorAction SilentlyContinue)
    "Simple-Test.ps1"  = $false # Not in module
}

# --- Logger setup -------------------------------------------------------------------
function Write-Log {
    param([string]$Level = "INFO", [string]$Message)
    $ts = (Get-Date).ToString("o")
    $line = "$ts `[$Level`] $Message"
    if ($LogPath) {
        try { Add-Content -Path $LogPath -Value $line } catch { Write-Warning "Unable to write log: $_" }
    }
    else {
        Write-Host $line
    }
}

# --- Small mime mapping helper (fallback) -------------------------------------------
$MimeLookup = @{
    ".txt"  = "text/plain"
    ".md"   = "text/markdown"
    ".json" = "application/json"
    ".xml"  = "application/xml"
    ".csv"  = "text/csv"
    ".html" = "text/html"
    ".htm"  = "text/html"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".png"  = "image/png"
    ".gif"  = "image/gif"
    ".pdf"  = "application/pdf"
    ".zip"  = "application/zip"
}

function Get-MimeHint {
    param([string]$Path)
    $ext = [IO.Path]::GetExtension($Path)
    if ($null -ne $ext -and $MimeLookup.ContainsKey($ext.ToLower())) { return $MimeLookup[$ext.ToLower()] }
    return "application/octet-stream"
}

# --- Schema example (for reference) -------------------------------------------------
# file-item-v1:
# {
#   "Name": "foo.txt",
#   "FullPath": "C:\\folder\\foo.txt",
#   "RelativePath": "folder\\foo.txt",
#   "ItemType": "File"|"Directory",
#   "SizeBytes": 12345,
#   "SizeHuman": "12.1 KB",
#   "HashSha256": "abcdef...",
#   "Extension": ".txt",
#   "MimeHint": "text/plain",
#   "CreatedUtc": "2025-09-25T12:00:00Z",
#   "ModifiedUtc": "...",
#   "AccessedUtc": "...",
#   "Attributes": ["Archive","ReadOnly"],
#   "Owner": "DOMAIN\User",
#   "AclSummary": "rwx:DOMAIN\User, rx:Everyone",
#   "Tags": {},
#   "Extra": {}
# }

# --- Utility functions --------------------------------------------------------------
function ConvertTo-HumanSize {
    param([long] $bytes)
    if ($bytes -lt 1024) { return "$bytes B" }
    $units = "KB", "MB", "GB", "TB"
    $size = [double]$bytes
    for ($i = 0; $i -lt $units.Length; $i++) {
        $size = $size / 1024
        if ($size -lt 1024) { return ("{0:N2} {1}" -f $size, $units[$i]) }
    }
    return ("{0:N2} PB" -f $size)
}

function Get-SafeFileHash {
    param([string]$FilePath)
    try {
        if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { return $null }
        # Use Get-FileHash; if it fails (locked), return null
        $h = Get-FileHash -Algorithm SHA256 -Path $FilePath -ErrorAction Stop
        $Script:Stats.HashesComputed++
        return $h.Hash
    }
    catch {
        $Script:Stats.HashFailures++
        $Global:RevealErrors.HashFailures += @{
            Path      = $FilePath
            Error     = $_.Exception.Message
            Timestamp = Get-Date
        }
        Write-Log "WARN" "Hash failed for '$FilePath' : $_"
        return $null
    }
}

function Get-SafeOwner {
    param([string]$Path)
    try {
        $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
        return ($acl.Owner -as [string])
    }
    catch {
        $Script:Stats.AclFailures++
        $Global:RevealErrors.AclFailures += @{
            Path      = $Path
            Error     = $_.Exception.Message
            Timestamp = Get-Date
            Operation = "GetOwner"
        }
        return $null
    }
}

function Get-AclSummary {
    param([string]$Path)
    try {
        $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
        $aces = $acl.Access | ForEach-Object {
            "{0}:{1}" -f ($_.IdentityReference.Value), ($_.FileSystemRights.ToString())
        }
        return ($aces -join "; ")
    }
    catch {
        $Script:Stats.AclFailures++
        $Global:RevealErrors.AclFailures += @{
            Path      = $Path
            Error     = $_.Exception.Message
            Timestamp = Get-Date
            Operation = "GetAclSummary"
        }
        return $null
    }
}

# --- Parallel hashing functions (PowerShell 7+ with ForEach-Object -Parallel) ------
function Invoke-ParallelHashing {
    param([array]$FileItems)
    
    # Check if we're on PowerShell 7+ and parallel processing is requested
    if ($PSVersionTable.PSVersion.Major -ge 7 -and $ParallelHash) {
        Write-Log "INFO" "Using parallel hashing (PowerShell 7+)"
        try {
            $FileItems | ForEach-Object -Parallel {
                $item = $_
                try {
                    if (-not (Test-Path -LiteralPath $item.FullPath -PathType Leaf)) { 
                        $item.HashSha256 = $null
                        return $item
                    }
                    $h = Get-FileHash -Algorithm SHA256 -Path $item.FullPath -ErrorAction Stop
                    $item.HashSha256 = $h.Hash
                    return $item
                }
                catch {
                    # Note: We can't update Script:Stats from parallel threads, so we'll handle this in the main thread
                    $item.HashSha256 = $null
                    $item | Add-Member -MemberType NoteProperty -Name "__HashError" -Value $_.Exception.Message -Force
                    return $item
                }
            } -ThrottleLimit 8
        }
        catch {
            Write-Log "WARN" "Parallel hashing failed, falling back to sequential: $_"
            return Invoke-SequentialHashing -FileItems $FileItems
        }
    }
    else {
        return Invoke-SequentialHashing -FileItems $FileItems
    }
}

function Invoke-SequentialHashing {
    param([array]$FileItems)
    
    Write-Log "INFO" "Using sequential hashing"
    foreach ($item in $FileItems) {
        if (-not $SkipHash) {
            $item.HashSha256 = Get-SafeFileHash -FilePath $item.FullPath
        }
    }
    return $FileItems
}

# --- Schema validation function -----------------------------------------------------
function Invoke-SchemaValidation {
    param([array]$Items, [string]$SchemaName)
    
    if (-not $ValidateSchema) { return $true }
    
    if ($LoadedUtils["Schemas.ps1"]) {
        # Try different validation function names
        $validationFunctions = @("Validate-Schema", "Test-Schema", "Get-SchemaDefinition")
        
        foreach ($funcName in $validationFunctions) {
            if (Get-Command -Name $funcName -ErrorAction SilentlyContinue) {
                try {
                    Write-Log "INFO" "Validating with $funcName from Schemas.ps1"
                    if ($funcName -eq "Get-SchemaDefinition") {
                        # If it's a definition function, we'll validate structure manually
                        $schemaDef = & $funcName -SchemaName $SchemaName
                        if ($schemaDef) {
                            Write-Log "INFO" "Schema definition found for $SchemaName"
                            # Basic validation - ensure first item has required properties
                            if ($Items.Count -gt 0) {
                                $requiredProps = @("Name", "FullPath", "ItemType", "SizeBytes")
                                $missingProps = $requiredProps | Where-Object { -not ($Items[0].PSObject.Properties.Name -contains $_) }
                                if ($missingProps.Count -gt 0) {
                                    Write-Log "ERROR" "Schema validation failed - missing properties: $($missingProps -join ', ')"
                                    return $false
                                }
                            }
                            return $true
                        }
                    }
                    else {
                        # Direct validation function
                        $result = & $funcName -Items $Items -SchemaName $SchemaName
                        Write-Log "INFO" "Schema validation result: $result"
                        return $result
                    }
                }
                catch {
                    Write-Log "WARN" "Schema validation with $funcName failed: $_"
                }
            }
        }
        Write-Log "WARN" "No suitable schema validation function found in Schemas.ps1"
    }
    else {
        Write-Log "WARN" "Schema validation requested but Schemas.ps1 not loaded"
    }
    
    return $true  # Don't fail if validation can't be performed
}
function Invoke-PathEnumeration {
    param(
        [string] $RootPath,
        [int] $Depth = 0,
        [int] $MaxDepth = 50
    )
    if ($Depth -gt $MaxDepth) { return }

    try {
        $gciParams = @{ LiteralPath = $RootPath }
        if (-not $IncludeHidden) {
            # Filter hidden/system will be applied after retrieval (Windows Get-ChildItem doesn't have a consistent -Attributes filter cross platform)
            $items = Get-ChildItem @gciParams -ErrorAction Stop
        }
        else {
            $items = Get-ChildItem @gciParams -Force -ErrorAction Stop
        }
    }
    catch {
        $Global:RevealErrors.EnumerationFailures += @{
            Path      = $RootPath
            Error     = $_.Exception.Message
            Timestamp = Get-Date
            Depth     = $Depth
        }
        Write-Log "ERROR" "Failed to list $RootPath : $_"
        return
    }

    foreach ($it in $items) {
        # If not including hidden, skip
        if (-not $IncludeHidden) {
            if ($it.Attributes -band [System.IO.FileAttributes]::Hidden -or $it.Attributes -band [System.IO.FileAttributes]::System) { continue }
        }

        $isFile = -not $it.PSIsContainer
        $size = if ($isFile) { try { [int64]$it.Length } catch { 0 } } else { 0 }

        # Update statistics
        $Script:Stats.ItemsProcessed++
        if ($isFile) { 
            $Script:Stats.FilesProcessed++
        }
        else { 
            $Script:Stats.DirectoriesProcessed++
        }

        # Calculate relative path safely
        $relativePath = $it.Name  # fallback to just name
        try { 
            $rootResolved = (Resolve-Path -LiteralPath $RootPath).Path
            $itemResolved = (Resolve-Path -LiteralPath $it.FullName).Path
            if ($itemResolved.StartsWith($rootResolved)) {
                $relativePath = $itemResolved.Substring($rootResolved.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
            }
        }
        catch { 
            # Use name as fallback
        }

        $obj = [PSCustomObject]@{
            Name         = $it.Name
            FullPath     = $it.FullName
            RelativePath = $relativePath
            ItemType     = if ($isFile) { "File" } else { "Directory" }
            SizeBytes    = $size
            SizeHuman    = ConvertTo-HumanSize -bytes $size
            HashSha256   = $null  # Will be populated later if not $SkipHash
            Extension    = [IO.Path]::GetExtension($it.FullName)
            MimeHint     = Get-MimeHint -Path $it.FullName
            CreatedUtc   = (Get-Date $it.CreationTimeUtc -UFormat "%Y-%m-%dT%H:%M:%SZ")
            ModifiedUtc  = (Get-Date $it.LastWriteTimeUtc -UFormat "%Y-%m-%dT%H:%M:%SZ")
            AccessedUtc  = (Get-Date $it.LastAccessTimeUtc -UFormat "%Y-%m-%dT%H:%M:%SZ")
            Attributes   = ($it.Attributes.ToString()).Split(",") | ForEach-Object { $_.Trim() }
            Owner        = $null  # Will be populated later if not $SkipAcl
            AclSummary   = $null  # Will be populated later if not $SkipAcl
            Tags         = @{}
            Extra        = @{}
        }

        # Owner & ACL (best-effort) - only if not skipped
        if (-not $SkipAcl) {
            try { $obj.Owner = Get-SafeOwner -Path $it.FullName } catch {}
            try { $obj.AclSummary = Get-AclSummary -Path $it.FullName } catch {}
        }

        # Add metadata for processing pipeline
        $obj | Add-Member -MemberType NoteProperty -Name "__ScanRoot" -Value $RootPath -Force
        $obj | Add-Member -MemberType NoteProperty -Name "__Depth" -Value $Depth -Force
        $obj | Add-Member -MemberType NoteProperty -Name "__IsFile" -Value $isFile -Force

        Write-Output $obj

        # Recurse if folder
        if (-not $isFile -and $Recurse) {
            try {
                Invoke-PathEnumeration -RootPath $it.FullName -Depth ($Depth + 1) -MaxDepth $MaxDepth
            }
            catch {
                $Global:RevealErrors.GeneralErrors += @{
                    Path      = $it.FullName
                    Error     = $_.Exception.Message
                    Timestamp = Get-Date
                    Operation = "Recursion"
                }
                Write-Log "WARN" "Recursion into $($it.FullName) failed: $_"
            }
        }
    }
}

# --- Execution ----------------------------------------------------------------------
try {
    $target = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    $root = $target.Path
}
catch {
    Write-Log "ERROR" "Path not found: $Path"
    throw
}

# Determine default out file name following project structure
if (-not $OutFile) {
    $ext = $Output
    
    # Try to use the project's Logs directory if we can find it
    $projectRoot = $scriptDir
    # Look for the project root by finding the Logs directory
    while ($projectRoot -and !(Test-Path (Join-Path $projectRoot "Logs"))) {
        $parent = Split-Path $projectRoot -Parent
        if ($parent -eq $projectRoot) { break }  # Reached filesystem root
        $projectRoot = $parent
    }
        
    # If we found the Logs directory, use it; otherwise fall back to current location
    if ($projectRoot -and (Test-Path (Join-Path $projectRoot "Logs"))) {
        $logDir = Join-Path $projectRoot "Logs"
        Write-Log "INFO" "Using project Logs directory: $logDir"
    }
    else {
        $logDir = Get-Location
        Write-Log "WARN" "Could not locate project Logs directory, using current location"
    }
        
    $OutFile = Join-Path -Path $logDir -ChildPath ("reveal-folder-contents-{0}.{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $ext)
}

Write-Log "INFO" "Scanning: $root"
Write-Log "INFO" "Output format: $Output ; OutFile: $OutFile ; Schema: $Schema"

# Collect items (enumeration phase - separate from hashing)
$items = @()
try {
    Write-Log "INFO" "Phase 1: Enumerating items..."
    $enumResults = @(Invoke-PathEnumeration -RootPath $root -Depth 0 -MaxDepth $MaxDepth)
    $items = $enumResults | Sort-Object -Property ItemType, RelativePath
    Write-Log "INFO" "Enumeration complete - Items found: $($items.Count) (Files: $($Script:Stats.FilesProcessed), Directories: $($Script:Stats.DirectoriesProcessed))"
}
catch {
    Write-Log "ERROR" "Enumeration failed: $_"
    # Continue with empty items array to show summary
    $items = @()
}

# Hash computation phase (separate for potential parallelization)
if (-not $SkipHash) {
    Write-Log "INFO" "Phase 2: Computing file hashes..."
    $fileItems = @($items | Where-Object { $_.ItemType -eq "File" })
    
    if ($fileItems.Count -gt 0) {
        if ($ParallelHash -and $PSVersionTable.PSVersion.Major -ge 7) {
            Write-Log "INFO" "Using parallel hashing for $($fileItems.Count) files"
            $hashedItems = Invoke-ParallelHashing -FileItems $fileItems
            
            # Update statistics and error handling for parallel results
            foreach ($item in $hashedItems) {
                if ($item.PSObject.Properties.Name -contains "__HashError") {
                    $Script:Stats.HashFailures++
                    $Global:RevealErrors.HashFailures += @{
                        Path      = $item.FullPath
                        Error     = $item.__HashError
                        Timestamp = Get-Date
                    }
                    $item.PSObject.Properties.Remove("__HashError")
                }
                elseif ($item.HashSha256) {
                    $Script:Stats.HashesComputed++
                }
            }
        }
        else {
            Write-Log "INFO" "Using sequential hashing for $($fileItems.Count) files"
            $hashedItems = Invoke-SequentialHashing -FileItems $fileItems
        }
        
        Write-Log "INFO" "Hashing complete - Successfully hashed: $($Script:Stats.HashesComputed), Failed: $($Script:Stats.HashFailures)"
    }
}
else {
    Write-Log "INFO" "Skipping hash computation (-SkipHash specified)"
}

# Schema validation phase
if ($ValidateSchema) {
    Write-Log "INFO" "Phase 3: Validating schema..."
    $validationResult = Invoke-SchemaValidation -Items $items -SchemaName $Schema
    if (-not $validationResult) {
        Write-Log "ERROR" "Schema validation failed"
        # Continue anyway but log the failure
    }
    else {
        Write-Log "INFO" "Schema validation passed"
    }
}

# --- Output / Serialization ---------------------------------------------------------
switch ($Output) {
    "json" {
        try {
            $json = $items | Select-Object Name, FullPath, RelativePath, ItemType, SizeBytes, SizeHuman, HashSha256, Extension, MimeHint, CreatedUtc, ModifiedUtc, AccessedUtc, Attributes, Owner, AclSummary, Tags, Extra | ConvertTo-Json -Depth 6 -Compress
            $json | Out-File -FilePath $OutFile -Encoding UTF8
            Write-Log "INFO" "JSON written: $OutFile"
        }
        catch {
            Write-Log "ERROR" "JSON write failed: $_"
            throw
        }
    }
    "csv" {
        try {
            $items |
            Select-Object Name, FullPath, RelativePath, ItemType, SizeBytes, SizeHuman, HashSha256, Extension, MimeHint, CreatedUtc, ModifiedUtc, AccessedUtc, @{Name = 'Attributes'; Expression = { $_.Attributes -join '|' } }, Owner, @{Name = 'AclSummary'; Expression = { $_.AclSummary } } |
            Export-Csv -Path $OutFile -NoTypeInformation -Encoding UTF8
            Write-Log "INFO" "CSV written: $OutFile"
        }
        catch {
            Write-Log "ERROR" "CSV write failed: $_"
            throw
        }
    }
    "xml" {
        # Try to use XMLLogger if available
        if ($LoadedUtils["XMLLogger.ps1"]) {
            try {
                # Expect XMLLogger to provide: Write-XmlLog -Items -OutFile -RootName -ItemName
                Write-Log "INFO" "Using XMLLogger.ps1 to write XML"
                if (Get-Command -Name Write-XmlLog -ErrorAction SilentlyContinue) {
                    Write-XmlLog -Items $items -OutFile $OutFile -RootName "RevealResults" -ItemName "Item"
                    Write-Log "INFO" "XML written via XMLLogger: $OutFile"
                }
                else {
                    throw "Write-XmlLog not found in XMLLogger.ps1"
                }
            }
            catch {
                Write-Log "WARN" "XMLLogger unavailable or failed: $_ - falling back to builtin XML serializer"
                try {
                    $xml = New-Object System.Xml.XmlDocument
                    $rootNode = $xml.CreateElement("RevealResults")
                    $xml.AppendChild($rootNode) | Out-Null

                    foreach ($it in $items) {
                        $node = $xml.CreateElement("Item")
                        foreach ($prop in $it.PSObject.Properties) {
                            $pnode = $xml.CreateElement([System.Xml.XmlConvert]::EncodeName($prop.Name))
                            if ($prop.Value -is [System.Array]) {
                                $pnode.InnerText = ($prop.Value -join ",")
                            }
                            else {
                                $pnode.InnerText = ($prop.Value -as [string])
                            }
                            $node.AppendChild($pnode) | Out-Null
                        }
                        $rootNode.AppendChild($node) | Out-Null
                    }
                    $xml.Save($OutFile)
                    Write-Log "INFO" "XML written: $OutFile"
                }
                catch {
                    Write-Log "ERROR" "XML fallback failed: $_"
                    throw
                }
            }
        }
        else {
            # builtin xml
            try {
                $xml = New-Object System.Xml.XmlDocument
                $rootNode = $xml.CreateElement("RevealResults")
                $xml.AppendChild($rootNode) | Out-Null

                foreach ($it in $items) {
                    $node = $xml.CreateElement("Item")
                    foreach ($prop in $it.PSObject.Properties) {
                        $pnode = $xml.CreateElement([System.Xml.XmlConvert]::EncodeName($prop.Name))
                        if ($prop.Value -is [System.Array]) {
                            $pnode.InnerText = ($prop.Value -join ",")
                        }
                        else {
                            $pnode.InnerText = ($prop.Value -as [string])
                        }
                        $node.AppendChild($pnode) | Out-Null
                    }
                    $rootNode.AppendChild($node) | Out-Null
                }
                $xml.Save($OutFile)
                Write-Log "INFO" "XML written: $OutFile"
            }
            catch {
                Write-Log "ERROR" "XML write failed: $_"
                throw
            }
        }
    }
    default {
        Write-Log "ERROR" "Unsupported output format: $Output"
        throw "Unsupported output format: $Output"
    }
}

# --- Optional: Post-report hooks ---------------------------------------------------
# If ReportUtils.ps1 provides a function like Publish-Report or Save-ReportSummary, call it.
if ($LoadedUtils["ReportUtils.ps1"] -and $false) {
    # Temporarily disabled for testing
    if (Get-Command -Name Publish-Report -ErrorAction SilentlyContinue) {
        try {
            Publish-Report -Source $OutFile -Schema $Schema -ScanRoot $root
            Write-Log "INFO" "Publish-Report invoked from ReportUtils"
        }
        catch {
            Write-Log "WARN" "Publish-Report failed: $_"
        }
    }
}

Write-Log "INFO" "Scan complete."

# --- End-of-run summary -------------------------------------------------------------
$Script:Stats.EndTime = Get-Date
$elapsed = $Script:Stats.EndTime - $Script:Stats.StartTime

Write-Host "`n" -NoNewline
Write-Host "=== REVEAL-FOLDERCONTENTS SUMMARY ===" -ForegroundColor Cyan
Write-Host "Scan Target: $root" -ForegroundColor White
Write-Host "Output File: $OutFile" -ForegroundColor White
Write-Host "Execution Time: $($elapsed.TotalSeconds.ToString('F2'))s" -ForegroundColor Green

Write-Host "`nItems Processed:" -ForegroundColor Yellow
Write-Host "  Total Items: $($Script:Stats.ItemsProcessed)" -ForegroundColor Gray
Write-Host "  Files: $($Script:Stats.FilesProcessed)" -ForegroundColor Gray  
Write-Host "  Directories: $($Script:Stats.DirectoriesProcessed)" -ForegroundColor Gray

if (-not $SkipHash) {
    Write-Host "`nHashing Results:" -ForegroundColor Yellow
    Write-Host "  Successful: $($Script:Stats.HashesComputed)" -ForegroundColor Green
    Write-Host "  Failed: $($Script:Stats.HashFailures)" -ForegroundColor $(if ($Script:Stats.HashFailures -gt 0) { "Red" } else { "Green" })
}

if (-not $SkipAcl) {
    Write-Host "`nACL Processing:" -ForegroundColor Yellow
    Write-Host "  Failed ACL Operations: $($Script:Stats.AclFailures)" -ForegroundColor $(if ($Script:Stats.AclFailures -gt 0) { "Red" } else { "Green" })
}

$totalErrors = $Global:RevealErrors.HashFailures.Count + $Global:RevealErrors.AclFailures.Count + $Global:RevealErrors.EnumerationFailures.Count + $Global:RevealErrors.GeneralErrors.Count
Write-Host "`nError Summary:" -ForegroundColor Yellow
Write-Host "  Total Errors: $totalErrors" -ForegroundColor $(if ($totalErrors -gt 0) { "Red" } else { "Green" })
if ($totalErrors -gt 0) {
    Write-Host "  Hash Failures: $($Global:RevealErrors.HashFailures.Count)" -ForegroundColor Gray
    Write-Host "  ACL Failures: $($Global:RevealErrors.AclFailures.Count)" -ForegroundColor Gray  
    Write-Host "  Enumeration Failures: $($Global:RevealErrors.EnumerationFailures.Count)" -ForegroundColor Gray
    Write-Host "  General Errors: $($Global:RevealErrors.GeneralErrors.Count)" -ForegroundColor Gray
    Write-Host "  (Use `$Global:RevealErrors to inspect details programmatically)" -ForegroundColor DarkGray
}

Write-Host "`nConfiguration:" -ForegroundColor Yellow
Write-Host "  SkipHash: $(if ($SkipHash) { 'Yes' } else { 'No' })" -ForegroundColor Gray
Write-Host "  ParallelHash: $(if ($ParallelHash) { 'Yes' } else { 'No' })" -ForegroundColor Gray
Write-Host "  SkipAcl: $(if ($SkipAcl) { 'Yes' } else { 'No' })" -ForegroundColor Gray
Write-Host "  ValidateSchema: $(if ($ValidateSchema) { 'Yes' } else { 'No' })" -ForegroundColor Gray
Write-Host "  Recurse: $(if ($Recurse) { 'Yes' } else { 'No' })" -ForegroundColor Gray
Write-Host "  MaxDepth: $MaxDepth" -ForegroundColor Gray
Write-Host "  PowerShell Version: $($PSVersionTable.PSVersion)" -ForegroundColor Gray

Write-Host ""

# --- Example invocations (commented) ------------------------------------------------
<#
# Scan current folder, recursive, JSON result:
.\Reveal-FolderContents.ps1 -Path . -Recurse -Output json -OutFile ".\scan.json"

# Scan a path, CSV:
.\Reveal-FolderContents.ps1 -Path "C:\Projects" -Recurse -Output csv -OutFile "C:\temp\proj_scan.csv"

# Scan single folder, XML:
.\Reveal-FolderContents.ps1 -Path "C:\Data" -Output xml -OutFile "C:\temp\data_scan.xml" -LogPath "C:\temp\scan.log"
#>