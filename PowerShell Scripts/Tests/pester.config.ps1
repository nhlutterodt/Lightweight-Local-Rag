# Pester Configuration for Local-RAG-Project-v2
# Run with: Invoke-Pester -Configuration (. ./Tests/pester.config.ps1)

$pesterConfig = New-PesterConfiguration

# Run settings
$pesterConfig.Run.Path = "$PSScriptRoot"
$pesterConfig.Run.Exit = $false
$pesterConfig.Run.PassThru = $true

# Output settings
$pesterConfig.Output.Verbosity = 'Detailed'
$pesterConfig.Output.StackTraceVerbosity = 'Filtered'
$pesterConfig.Output.CIFormat = 'Auto'

# Test results (for CI/CD)
$pesterConfig.TestResult.Enabled = $true
$pesterConfig.TestResult.OutputFormat = 'NUnitXml'
$pesterConfig.TestResult.OutputPath = "$PSScriptRoot/../Logs/TestResults.xml"

# Code coverage (optional - can be enabled later)
$pesterConfig.CodeCoverage.Enabled = $false
$pesterConfig.CodeCoverage.Path = @(
    "$PSScriptRoot/../XMLLogger.ps1",
    "$PSScriptRoot/../XMLParser.ps1",
    "$PSScriptRoot/../Schemas.ps1",
    "$PSScriptRoot/../ModelUtils.ps1"
)

# Filter settings
$pesterConfig.Filter.ExcludeTag = @('Integration', 'Slow')

# Return the configuration
return $pesterConfig
