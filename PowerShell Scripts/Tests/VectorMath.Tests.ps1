Describe "VectorMath Accelerator" {
    # Ensure module is loaded/class compiled
    BeforeAll {
        $modulePath = "$PSScriptRoot\..\LocalRagUtils\LocalRagUtils.psd1"
        if (Test-Path $modulePath) {
            Import-Module $modulePath -Force
        }
        else {
            . "$PSScriptRoot\..\VectorMath.ps1"
        }
    }

    Context "Availability" {
        It "should have loaded the LocalRag.VectorMath type" {
            ([System.Management.Automation.PSTypeName]'LocalRag.VectorMath').Type | Should -Not -BeNullOrEmpty
        }
    }

    Context "Golden Vector Verification" {
        BeforeAll {
            $jsonPath = Join-Path $PSScriptRoot "Data\GoldenVectors.json"
            if (Test-Path $jsonPath) {
                $Global:vectorTestCases = Get-Content $jsonPath | ConvertFrom-Json | ForEach-Object {
                    @{
                        description        = $_.description
                        vectorA            = [float[]]$_.vectorA
                        vectorB            = [float[]]$_.vectorB
                        expectedSimilarity = [float]$_.expectedSimilarity
                    }
                }
            }
            else {
                $Global:vectorTestCases = @()
            }
        }

        It "should match expected similarity for '<description>'" -TestCases $Global:vectorTestCases {
            param($vectorA, $vectorB, $expectedSimilarity)
            
            $actual = [LocalRag.VectorMath]::CosineSimilarity($vectorA, $vectorB)
            
            # Tolerance 0.0001
            $diff = [Math]::Abs($actual - $expectedSimilarity)
            $diff | Should -BeLessThan 0.0001
        }
    }

    Context "Error Handling" {
        It "should throw on null input" {
            { [LocalRag.VectorMath]::CosineSimilarity($null, @(1.0)) } | Should -Throw
        }

        It "should throw on length mismatch" {
            $v1 = @(1.0, 2.0)
            $v2 = @(1.0, 2.0, 3.0)
            { [LocalRag.VectorMath]::CosineSimilarity($v1, $v2) } | Should -Throw
        }
    }
}
