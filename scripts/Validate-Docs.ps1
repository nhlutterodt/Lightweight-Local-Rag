param(
    [string]$DocsRoot = "docs",
    [string]$IndexPath = "docs/DOCS_INDEX.md",
    [switch]$IgnoreStaleIndexEntries
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$allowedStates = @("canonical", "active-draft", "historical", "reference-contract")
$requiredFields = @("doc_state", "doc_owner", "canonical_ref", "last_reviewed", "audience")
$requiredObservabilityHeading = "## Implementation Anchors Reviewed"
$requiredObservabilityAnchorCount = 5
$requiredObservabilityClientPrefix = "gui/client/"
$requiredObservabilityServerPrefix = "gui/server/"
$observabilityDocsForChangeReview = @(
    "docs/observability_analysis.md",
    "docs/observability_execution_plan.md"
)
$observabilityDocsRequiringAnchors = @(
    "docs/observability_analysis.md",
    "docs/observability_execution_plan.md"
)
$observabilitySeamPaths = @(
    "gui/server/server.js",
    "gui/server/lib/querylogger.js",
    "gui/server/lib/xmllogger.js",
    "gui/server/lib/healthcheck.js",
    "gui/server/ingestionqueue.js",
    "gui/server/lib/integritycheck.js",
    "gui/client/react-client/src/components/analyticspanel.jsx",
    "gui/client/react-client/src/hooks/useragapi.js"
)
$integrityCheckModulePath = "gui/server/lib/integritycheck.js"
$analyticsPanelPath = "gui/client/react-client/src/components/analyticspanel.jsx"
$ragApiHookPath = "gui/client/react-client/src/hooks/useragapi.js"
$observabilityAnalysisDocPath = "docs/observability_analysis.md"

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

function Get-GitChangedPaths {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCommand) {
        return @()
    }

    try {
        $output = & git -c "safe.directory=$RepoRoot" -C $RepoRoot status --short --untracked-files=all 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $output) {
            return @()
        }

        $paths = New-Object System.Collections.Generic.List[string]
        foreach ($line in $output) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }

            $trimmed = $line
            if ($trimmed.Length -lt 4) { continue }

            $pathPart = $trimmed.Substring(3).Trim()
            if ([string]::IsNullOrWhiteSpace($pathPart)) { continue }

            if ($pathPart.Contains(" -> ")) {
                $pathPart = ($pathPart -split " -> ")[-1].Trim()
            }

            $paths.Add((Normalize-DocPath -Path $pathPart))
        }

        return $paths
    }
    catch {
        return @()
    }
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
    $normalizedRelativePath = Normalize-DocPath -Path $relativePath

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

    if ($observabilityDocsRequiringAnchors -contains $normalizedRelativePath) {
        if ($content -notmatch '(?im)^\#\#\s+Implementation Anchors Reviewed\s*$') {
            $violations.Add("$relativePath -> Missing required heading: $requiredObservabilityHeading")
        }
        else {
            $anchorSection = [regex]::Match(
                $content,
                '(?ims)^\#\#\s+Implementation Anchors Reviewed\s*$\s*(?<body>.*?)(?=^\#\#\s+|\z)'
            )

            $anchorCount = 0
            $anchorPaths = @()
            if ($anchorSection.Success) {
                $anchorMatches = [regex]::Matches(
                    $anchorSection.Groups["body"].Value,
                    '(?im)^\s*-\s+`(?<path>[^`]+)`\s*$'
                )
                $anchorCount = $anchorMatches.Count
                $anchorPaths = $anchorMatches | ForEach-Object { $_.Groups["path"].Value.Trim() }
            }

            if ($anchorCount -lt $requiredObservabilityAnchorCount) {
                $violations.Add(
                    "$relativePath -> '$requiredObservabilityHeading' must include at least $requiredObservabilityAnchorCount repo-path bullet entries; found $anchorCount"
                )
            }

            foreach ($anchorPath in $anchorPaths) {
                $resolvedAnchorPath = Join-Path $repoRoot ($anchorPath -replace "/", [IO.Path]::DirectorySeparatorChar)
                if (-not (Test-Path -Path $resolvedAnchorPath)) {
                    $violations.Add(
                        "$relativePath -> Implementation anchor path not found: $anchorPath"
                    )
                }
            }

            $normalizedAnchorPaths = $anchorPaths | ForEach-Object { Normalize-DocPath -Path $_ }
            $hasClientAnchor = $normalizedAnchorPaths | Where-Object { $_.StartsWith($requiredObservabilityClientPrefix) } | Select-Object -First 1
            $hasServerAnchor = $normalizedAnchorPaths | Where-Object { $_.StartsWith($requiredObservabilityServerPrefix) } | Select-Object -First 1

            if (-not $hasClientAnchor) {
                $violations.Add(
                    "$relativePath -> '$requiredObservabilityHeading' must include at least one client anchor under $requiredObservabilityClientPrefix"
                )
            }

            if (-not $hasServerAnchor) {
                $violations.Add(
                    "$relativePath -> '$requiredObservabilityHeading' must include at least one server anchor under $requiredObservabilityServerPrefix"
                )
            }
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

$warnings = New-Object System.Collections.Generic.List[string]
$gitChangedPaths = @(Get-GitChangedPaths -RepoRoot $repoRoot)
if ($gitChangedPaths.Count -gt 0) {
    $changedObservabilitySeams = @(
        $gitChangedPaths |
            Where-Object { $observabilitySeamPaths -contains $_ } |
            Sort-Object -Unique
    )
    $changedObservabilityDocs = @(
        $gitChangedPaths |
            Where-Object { $observabilityDocsForChangeReview -contains $_ } |
            Sort-Object -Unique
    )

    if ($changedObservabilitySeams.Count -gt 0 -and $changedObservabilityDocs.Count -eq 0) {
        $warnings.Add(
            "Observability seam files changed without an observability doc update: $($changedObservabilitySeams -join ', ')"
        )
    }
}

$integrityCheckExists = Test-Path -Path (Join-Path $repoRoot ($integrityCheckModulePath -replace "/", [IO.Path]::DirectorySeparatorChar))
if ($integrityCheckExists) {
    $observabilityDocContents = @{}
    foreach ($docPath in $observabilityDocsForChangeReview) {
        $resolvedDocPath = Join-Path $repoRoot ($docPath -replace "/", [IO.Path]::DirectorySeparatorChar)
        if (Test-Path -Path $resolvedDocPath) {
            $observabilityDocContents[$docPath] = Get-Content -Path $resolvedDocPath -Raw
        }
    }

    $mentionsIntegrity = $false
    foreach ($content in $observabilityDocContents.Values) {
        if ($content -match '(?i)\bIntegrityCheck\b' -or $content -match '(?i)\bcheck-integrity\.js\b') {
            $mentionsIntegrity = $true
            break
        }
    }

    if (-not $mentionsIntegrity) {
        $warnings.Add(
            "Integrity tooling exists at $integrityCheckModulePath but is not mentioned in docs/Observability_Analysis.md or docs/Observability_Execution_Plan.md"
        )
    }
}

$resolvedAnalyticsPanelPath = Join-Path $repoRoot ($analyticsPanelPath -replace "/", [IO.Path]::DirectorySeparatorChar)
$resolvedRagApiHookPath = Join-Path $repoRoot ($ragApiHookPath -replace "/", [IO.Path]::DirectorySeparatorChar)
$resolvedObservabilityAnalysisDocPath = Join-Path $repoRoot ($observabilityAnalysisDocPath -replace "/", [IO.Path]::DirectorySeparatorChar)

if ((Test-Path -Path $resolvedAnalyticsPanelPath) -and (Test-Path -Path $resolvedRagApiHookPath) -and (Test-Path -Path $resolvedObservabilityAnalysisDocPath)) {
    $analyticsPanelContent = Get-Content -Path $resolvedAnalyticsPanelPath -Raw
    $ragApiHookContent = Get-Content -Path $resolvedRagApiHookPath -Raw
    $observabilityAnalysisContent = Get-Content -Path $resolvedObservabilityAnalysisDocPath -Raw

    $uiExposesOperationalUpdateContext =
        (($analyticsPanelContent -match '(?i)\blastUpdated\b') -or ($ragApiHookContent -match '(?i)\blastUpdated\b')) -and
        (($analyticsPanelContent -match '(?i)\bchangeSummary\b') -or ($ragApiHookContent -match '(?i)\bchangeSummary\b'))

    $analysisMentionsOperationalUpdateContext =
        ($observabilityAnalysisContent -match '(?i)\blast updated\b') -or
        ($observabilityAnalysisContent -match '(?i)\bchange summaries?\b') -or
        ($observabilityAnalysisContent -match '(?i)\bchange summary\b') -or
        ($observabilityAnalysisContent -match '(?i)\boperational update context\b') -or
        ($observabilityAnalysisContent -match '(?i)\btimestamps?\b')

    if ($uiExposesOperationalUpdateContext -and -not $analysisMentionsOperationalUpdateContext) {
        $warnings.Add(
            "Analytics panel exposes lastUpdated/changeSummary state in client code, but docs/Observability_Analysis.md does not mention timestamped update context or change summaries in the UI observability section"
        )
    }
}

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
    Write-Host "4. For observability docs, include the heading '$requiredObservabilityHeading'."
    Write-Host "5. For observability docs, list at least $requiredObservabilityAnchorCount repo-path bullet entries under that heading."
    Write-Host "6. Ensure every listed implementation anchor path exists in the repo."
    Write-Host "7. Include at least one client anchor under $requiredObservabilityClientPrefix and one server anchor under $requiredObservabilityServerPrefix."
    Write-Host ""
    exit 1
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "Docs validation WARNINGS" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "- $warning"
    }
    Write-Host ""
    Write-Host "Suggested follow-up:" -ForegroundColor Cyan
    Write-Host "1. Re-review docs/Observability_Analysis.md and docs/Observability_Execution_Plan.md against the changed observability seams."
    Write-Host "2. If no doc change is needed, keep the warning as an intentional reminder rather than a blocker."
    Write-Host ""
}

Write-Host ""
Write-Host "Docs validation PASSED" -ForegroundColor Green
Write-Host "Validated markdown files: $($docsFiles.Count)"
Write-Host "Index entries: $($indexEntries.Count)"
Write-Host ""
exit 0
