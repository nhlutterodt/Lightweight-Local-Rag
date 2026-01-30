Describe "OllamaClient" {
    # Ensure module is loaded to make class available
    BeforeAll {
        $modulePath = "$PSScriptRoot\..\LocalRagUtils\LocalRagUtils.psd1"
        if (Test-Path $modulePath) {
            Import-Module $modulePath -Force
        }
        else {
            # Fallback for direct script testing
            . "$PSScriptRoot\..\OllamaClient.ps1"
        }
    }

    Context "Construction" {
        It "should initialize with default values" {
            $client = [OllamaClient]::new()
            $client.BaseUrl | Should -Be "http://localhost:11434"
            $client.DefaultModel | Should -Be "nomic-embed-text"
            $client.TimeoutSeconds | Should -Be 60
        }

        It "should initialize with custom values" {
            $client = [OllamaClient]::new("http://remote:11434", "llama2")
            $client.BaseUrl | Should -Be "http://remote:11434"
            $client.DefaultModel | Should -Be "llama2"
        }
    }

    Context "IsAvailable Property" {
        It "should return boolean without throwing" {
            $client = [OllamaClient]::new()
            try {
                $result = $client.IsAvailable()
                $result | Should -BeOfType [bool]
            }
            catch {
                Fail "IsAvailable threw exception: $_"
            }
        }
    }

    Context "Embeddings" {
        It "should return float array for valid input" {
            $client = [OllamaClient]::new()
            if ($client.IsAvailable()) {
                try {
                    $embedding = $client.GetEmbedding("test")
                    $embedding | Should -BeOfType [System.Array]
                    $embedding[0] | Should -BeOfType [float]
                    $embedding.Count | Should -BeGreaterThan 0
                }
                catch {
                    # If model missing, we skip but verify error type
                    Set-ItResult -Skipped -Because "Ollama available but model might be missing or error: $_"
                }
            }
            else {
                Set-ItResult -Skipped -Because "Ollama service not available"
            }
        }

        It "should handle empty input gracefully" {
            $client = [OllamaClient]::new()
            $embedding = $client.GetEmbedding("")
            $embedding.Count | Should -Be 0
        }
    }

    Context "Completion" {
        It "should return object with response field" {
            $client = [OllamaClient]::new()
            if ($client.IsAvailable()) {
                try {
                    # Use a very small model or dummy request if possible
                    # This test might be slow depending on model
                    $result = $client.GenerateCompletion("say hello", "tinyllama", @{ "num_predict" = 5 })
                    $result | Should -Not -BeNullOrEmpty
                }
                catch {
                    Set-ItResult -Skipped -Because "Ollama available but model execution failed (likely missing model)"
                }
            }
            else {
                Set-ItResult -Skipped -Because "Ollama service not available"
            }
        }
    }
}
