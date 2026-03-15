param(
    [string]$RepoRoot = "."
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedRoot = (Resolve-Path $RepoRoot).Path
Push-Location $resolvedRoot

try {
    $violations = New-Object System.Collections.Generic.List[string]

    $ignoreFile = Join-Path $resolvedRoot ".gitignore"
    if (-not (Test-Path -Path $ignoreFile)) {
        Write-Error ".gitignore not found at $resolvedRoot"
        exit 2
    }

    $ignoreText = Get-Content -Path $ignoreFile -Raw
    if ($ignoreText -match '(?im)^\s*\*\.json\s*$') {
        $violations.Add("Global '*.json' ignore pattern is forbidden. Use path-based JSON ignores.")
    }
    if ($ignoreText -match '(?im)^\s*\*\.csv\s*$') {
        $violations.Add("Global '*.csv' ignore pattern is forbidden. Use path-based CSV ignores.")
    }

    $mustTrack = @(
        "req.json",
        "gui/server/package.json",
        "gui/server/package-lock.json",
        "gui/client/react-client/package.json",
        "gui/client/react-client/package-lock.json",
        "gui/client/react-client/tsconfig.json",
        "gui/server/tests/data/targeted_retrieval_queries.json"
    )

    foreach ($path in $mustTrack) {
        $full = Join-Path $resolvedRoot $path
        if (-not (Test-Path -Path $full)) {
            continue
        }

        & git check-ignore -q -- "$path"
        if ($LASTEXITCODE -eq 0) {
            $violations.Add("Critical file is ignored: $path")
        }
    }

    $mustIgnore = @(
        "PowerShell Scripts/Data/example.metadata.json",
        "PowerShell Scripts/Data/example.manifest.json",
        "TestResults/retrieval-eval/example.json",
        "Logs/example.json"
    )

    foreach ($path in $mustIgnore) {
        & git check-ignore -q -- "$path"
        if ($LASTEXITCODE -ne 0) {
            $violations.Add("Generated artifact path is not ignored: $path")
        }
    }

    if ($violations.Count -gt 0) {
        Write-Host ""
        Write-Host "Git ignore validation FAILED" -ForegroundColor Red
        Write-Host "Detected issues: $($violations.Count)" -ForegroundColor Red
        Write-Host ""
        foreach ($issue in $violations) {
            Write-Host "- $issue"
        }
        Write-Host ""
        Write-Host "Remediation guardrails:" -ForegroundColor Cyan
        Write-Host "1. Keep ignore rules path-based for generated artifacts."
        Write-Host "2. Never use global '*.json' or '*.csv' patterns."
        Write-Host "3. Ensure package/config/test data JSON files remain trackable."
        Write-Host ""
        exit 1
    }

    Write-Host ""
    Write-Host "Git ignore validation PASSED" -ForegroundColor Green
    Write-Host ""
    exit 0
}
finally {
    Pop-Location
}
