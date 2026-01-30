# test-integration.ps1 - Simple test of utility abstraction loading

Write-Host "Testing ScriptLoader with abstractions profile..." -ForegroundColor Yellow

# Load ScriptLoader
. "$PSScriptRoot\ScriptLoader.ps1"

# Initialize ScriptLoader 
$loader = [ScriptLoader]::new($PSScriptRoot)
$loader.VerboseLoading = $true

# Load abstractions profile
Write-Host "`nLoading abstractions profile..." -ForegroundColor Cyan
$result = $loader.LoadProfile("abstractions")

# Check what was loaded
Write-Host "`nLoad results:" -ForegroundColor Green
$result | Format-Table -Property @{Name="Utility"; Expression={$_.Name}}, 
                                @{Name="Status"; Expression={$_.Value.status}},
                                @{Name="LoadTime(ms)"; Expression={[math]::Round($_.Value.loadTime.TotalMilliseconds, 2)}}

# Try to use ExecutionContext
Write-Host "`nTesting ExecutionContext..." -ForegroundColor Yellow
try {
    # Import ExecutionContext directly first
    . "$PSScriptRoot\ExecutionContext.ps1"
    
    $context = [ExecutionContext]::new("Integration-Test", "test-session")
    $context.AddMetadata("testType", "integration")
    
    Write-Host "✓ ExecutionContext created successfully" -ForegroundColor Green
    Write-Host "  Operation: $($context.OperationName)" -ForegroundColor Gray
    Write-Host "  Start time: $($context.StartTime)" -ForegroundColor Gray
    
    # Test phase tracking
    $context.StartPhase("TestPhase")
    Start-Sleep -Milliseconds 100
    $context.CompletePhase("TestPhase")
    
    Write-Host "✓ Phase tracking working" -ForegroundColor Green
    
    # Test OutputManager
    . "$PSScriptRoot\OutputManager.ps1"
    $output = [OutputManager]::new()
    
    Write-Host "✓ OutputManager created successfully" -ForegroundColor Green
    Write-Host "  Available formats: $($output.Formatters.Keys -join ', ')" -ForegroundColor Gray
    
} catch {
    Write-Host "✗ Error testing abstractions: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Full error: $_" -ForegroundColor DarkRed
}

Write-Host "`nIntegration test complete." -ForegroundColor Cyan