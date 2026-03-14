param(
    [string]$DocsRoot = "docs",
    [string]$IndexPath = "docs/DOCS_INDEX.md",
    [switch]$IgnoreStaleIndexEntries
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$allowedStates = @("canonical", "active-draft", "historical", "reference-contract")
$requiredFields = @("doc_state", "doc_owner", "canonical_ref", "last_reviewed", "audience")

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path

function Normalize-DocPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalized = $Path -replace "\\", "/"
    $normalized = $normalized.Trim()

    if ($normalized.StartsWith("./")) {
        $normalized = $normalized.Substring(2)
    }

    return $normalized.ToLowerInvariant()
}

function Try-ParseFrontmatter {
    param([Parameter(Mandatory = $true)][string]$Content)

    $result = [ordered]@{
        HasFrontmatter = $false
        Fields = @{}
        Error = $null
    }

    $match = [regex]::Match($Content, '(?s)\A---\s*\r?\n(.*?)\r?\n---\s*(\r?\n|\z)')
    if (-not $match.Success) {
        $result.Error = "Missing or malformed frontmatter block"
        return $result
    }

    $result.HasFrontmatter = $true
    $frontmatterBody = $match.Groups[1].Value

    foreach ($line in ($frontmatterBody -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
        if ($trimmed.StartsWith("#")) { continue }

        $kv = [regex]::Match($trimmed, '^([A-Za-z0-9_-]+)\s*:\s*(.+)$')
        if ($kv.Success) {
            $key = $kv.Groups[1].Value
            $value = $kv.Groups[2].Value.Trim()
            $result.Fields[$key] = $value
        }
    }

    return $result
}

function Get-IndexEntries {
    param([Parameter(Mandatory = $true)][string]$Content)

    $entries = New-Object System.Collections.Generic.List[string]
    $matches = [regex]::Matches($Content, '(?im)^\s*-\s+(docs\/[^\r\n]+\.md)\s*$')

    foreach ($m in $matches) {
        $entries.Add((Normalize-DocPath -Path $m.Groups[1].Value))
    }

    return $entries
}

$resolvedDocsRoot = Join-Path $repoRoot $DocsRoot
$resolvedIndexPath = Join-Path $repoRoot $IndexPath

if (-not (Test-Path -Path $resolvedDocsRoot)) {
    Write-Error "Docs root not found: $resolvedDocsRoot"
    exit 2
}

if (-not (Test-Path -Path $resolvedIndexPath)) {
    Write-Error "Index file not found: $resolvedIndexPath"
    exit 2
}

$docsFiles = Get-ChildItem -Path $resolvedDocsRoot -Recurse -File -Filter *.md |
    Sort-Object FullName

$violations = New-Object System.Collections.Generic.List[string]

foreach ($file in $docsFiles) {
    $relativePath = $file.FullName.Substring($repoRoot.Length + 1) -replace "\\", "/"

    $content = Get-Content -Path $file.FullName -Raw
    $parsed = Try-ParseFrontmatter -Content $content

    if (-not $parsed.HasFrontmatter) {
        $violations.Add("$relativePath -> $($parsed.Error)")
        continue
    }

    foreach ($field in $requiredFields) {
        if (-not $parsed.Fields.ContainsKey($field) -or [string]::IsNullOrWhiteSpace($parsed.Fields[$field])) {
            $violations.Add("$relativePath -> Missing required frontmatter field: $field")
        }
    }

    if ($parsed.Fields.ContainsKey("doc_state")) {
        $state = $parsed.Fields["doc_state"].ToLowerInvariant()
        if ($allowedStates -notcontains $state) {
            $violations.Add("$relativePath -> Invalid doc_state '$state'. Allowed: $($allowedStates -join ', ')")
        }
    }

    if ($parsed.Fields.ContainsKey("canonical_ref")) {
        $canonicalRef = $parsed.Fields["canonical_ref"]
        $canonicalRefNormalized = Normalize-DocPath -Path $canonicalRef
        if (-not $canonicalRefNormalized.StartsWith("docs/")) {
            $violations.Add("$relativePath -> canonical_ref must be a docs/ path. Found: $canonicalRef")
        }
    }
}

$indexRaw = Get-Content -Path $resolvedIndexPath -Raw
$indexEntries = Get-IndexEntries -Content $indexRaw
$actualEntries = $docsFiles |
    ForEach-Object {
        $rel = $_.FullName.Substring($repoRoot.Length + 1) -replace "\\", "/"
        Normalize-DocPath -Path $rel
    }

$indexDuplicates = $indexEntries |
    Group-Object |
    Where-Object { $_.Count -gt 1 }

foreach ($dup in $indexDuplicates) {
    $violations.Add("$IndexPath -> Duplicate index entry: $($dup.Name)")
}

$actualSet = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$indexSet = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)

foreach ($p in $actualEntries) { [void]$actualSet.Add($p) }
foreach ($p in $indexEntries) { [void]$indexSet.Add($p) }

$missingInIndex = @()
foreach ($p in $actualSet) {
    if (-not $indexSet.Contains($p)) { $missingInIndex += $p }
}

$staleInIndex = @()
foreach ($p in $indexSet) {
    if (-not $actualSet.Contains($p)) { $staleInIndex += $p }
}

foreach ($missing in ($missingInIndex | Sort-Object)) {
    $violations.Add("$IndexPath -> Missing index entry for file: $missing")
}

if (-not $IgnoreStaleIndexEntries) {
    foreach ($stale in ($staleInIndex | Sort-Object)) {
        $violations.Add("$IndexPath -> Stale index entry (file not found): $stale")
    }
}

if ($violations.Count -gt 0) {
    Write-Host ""
    Write-Host "Docs validation FAILED" -ForegroundColor Red
    Write-Host "Detected issues: $($violations.Count)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Required frontmatter fields: $($requiredFields -join ', ')"
    Write-Host "Allowed doc_state values: $($allowedStates -join ', ')"
    Write-Host ""
    Write-Host "Violations:" -ForegroundColor Yellow
    foreach ($v in $violations) {
        Write-Host "- $v"
    }
    Write-Host ""
    Write-Host "Remediation guidance:" -ForegroundColor Cyan
    Write-Host "1. Add or correct frontmatter fields in the reported docs file."
    Write-Host "2. Ensure doc_state is one of the allowed values."
    Write-Host "3. Update docs/DOCS_INDEX.md to include every docs/*.md path exactly once."
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Docs validation PASSED" -ForegroundColor Green
Write-Host "Validated markdown files: $($docsFiles.Count)"
Write-Host "Index entries: $($indexEntries.Count)"
Write-Host ""
exit 0
