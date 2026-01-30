<#
.SYNOPSIS
    Migrates Playwright Chromium binaries to a global path to resolve $HOME environment blockers.
.DESCRIPTION
    1. Detects current Playwright installation.
    2. Moves binaries to C:\ProgramData\playwright (standard for shared app data).
    3. Sets Machine-level environment variables for PLAYWRIGHT_BROWSERS_PATH and HOME.
#>

$GlobalPath = "C:\ProgramData\playwright"
$TargetVar = "PLAYWRIGHT_BROWSERS_PATH"

# 1. Ensure Target Directory Exists
if (!(Test-Path $GlobalPath)) {
    Write-Host "Creating global directory at $GlobalPath..." -ForegroundColor Cyan
    New-Item -Path $GlobalPath -ItemType Directory -Force | Out-Null
}

# 2. Locate Current Binaries
Write-Host "Locating current Playwright binaries..." -ForegroundColor Cyan
$CurrentPath = playwright install --show-path chromium 2>$null

if ($null -eq $CurrentPath -or !(Test-Path $CurrentPath)) {
    Write-Warning "Existing binaries not found. Installing directly to global path..."
    $env:PLAYWRIGHT_BROWSERS_PATH = $GlobalPath
    playwright install chromium
}
else {
    # 3. Migration logic: check if already in target
    if ($CurrentPath -eq $GlobalPath) {
        Write-Host "Binaries are already at the global path." -ForegroundColor Green
    }
    else {
        Write-Host "Migrating binaries from $CurrentPath to $GlobalPath..." -ForegroundColor Green
        Copy-Item -Path "$CurrentPath\*" -Destination $GlobalPath -Recurse -Force
    }
}

# 4. Hardening: Set System-Wide Environment Variables
Write-Host "Hardening environment variables..." -ForegroundColor Cyan

# Set PLAYWRIGHT_BROWSERS_PATH at the Machine level (persists across reboots/sessions)
[Environment]::SetEnvironmentVariable($TargetVar, $GlobalPath, "Machine")

# Set a fallback HOME variable at the Machine level to prevent 'subagent' failures
if ($null -eq [Environment]::GetEnvironmentVariable("HOME", "Machine")) {
    [Environment]::SetEnvironmentVariable("HOME", "C:\Users\Public", "Machine")
}

# 5. Verify
$FinalPath = [Environment]::GetEnvironmentVariable($TargetVar, "Machine")
Write-Host "Migration Complete!" -ForegroundColor Green
Write-Host "Global Path set to: $FinalPath"
Write-Host "Note: You may need to restart your terminal or IDE for changes to take effect."
