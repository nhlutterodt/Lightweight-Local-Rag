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

    Context "TopKIndices Selection" {
        It "should return correct top-k indices in descending score order" {
            $scores = [float[]]@(0.1, 0.9, 0.5, 0.7, 0.3)
            $result = [LocalRag.VectorMath]::TopKIndices($scores, 2)
            $result.Count | Should -Be 2
            $result[0] | Should -Be 1  # index of 0.9
            $result[1] | Should -Be 3  # index of 0.7
        }

        It "should return all indices sorted when k >= count" {
            $scores = [float[]]@(0.2, 0.8, 0.5)
            $result = [LocalRag.VectorMath]::TopKIndices($scores, 10)
            $result.Count | Should -Be 3
            $result[0] | Should -Be 1  # 0.8
            $result[1] | Should -Be 2  # 0.5
            $result[2] | Should -Be 0  # 0.2
        }

        It "should return empty array for empty input" {
            $scores = [float[]]@()
            $result = [LocalRag.VectorMath]::TopKIndices($scores, 5)
            $result.Count | Should -Be 0
        }

        It "should handle k=1 correctly (find maximum)" {
            $scores = [float[]]@(0.3, 0.1, 0.7, 0.2, 0.5)
            $result = [LocalRag.VectorMath]::TopKIndices($scores, 1)
            $result.Count | Should -Be 1
            $result[0] | Should -Be 2  # index of 0.7
        }
    }
}
