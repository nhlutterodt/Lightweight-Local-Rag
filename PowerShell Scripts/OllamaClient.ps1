class OllamaClient {
    [string] $BaseUrl
    [string] $DefaultModel
    [int] $TimeoutSeconds

    OllamaClient() {
        $this.BaseUrl = "http://localhost:11434"
        $this.DefaultModel = "nomic-embed-text"
        $this.TimeoutSeconds = 60
    }

    OllamaClient([string]$url, [string]$model) {
        $this.BaseUrl = $url
        $this.DefaultModel = $model
        $this.TimeoutSeconds = 60
    }

    [bool] IsAvailable() {
        try {
            # Fast check to tags endpoint
            $response = Invoke-WebRequest -Uri "$($this.BaseUrl)/api/tags" -Method Get -TimeoutSec 3 -ErrorAction Stop
            return ($response.StatusCode -eq 200)
        }
        catch {
            return $false
        }
    }

    [float[]] GetEmbedding([string]$prompt) {
        return $this.GetEmbedding($prompt, $this.DefaultModel)
    }

    [float[]] GetEmbedding([string]$prompt, [string]$model) {
        if ([string]::IsNullOrWhiteSpace($prompt)) {
            return @()
        }

        $body = @{
            model  = $model
            prompt = $prompt
        } | ConvertTo-Json

        try {
            $response = Invoke-WebRequest -Uri "$($this.BaseUrl)/api/embeddings" `
                -Method Post `
                -Body $body `
                -TimeoutSec $this.TimeoutSeconds `
                -ErrorAction Stop `
                -ContentType "application/json"

            if ($response.StatusCode -ne 200) {
                throw "Ollama Error: Received status code $($response.StatusCode)"
            }

            $json = $response.Content | ConvertFrom-Json
            
            if ($null -eq $json.embedding) {
                # New Ollama API sometimes wraps it differently or returns empty on error
                throw "Ollama Error: No embedding found in response"
            }

            return [float[]]$json.embedding
        }
        catch {
            # Re-throw with clear context, preserving inner exception
            throw "Failed to get embedding from Ollama ($model): $($_.Exception.Message)"
        }
    }

    [PSCustomObject] GenerateCompletion([string]$prompt, [hashtable]$options) {
        return $this.GenerateCompletion($prompt, $this.DefaultModel, $options)
    }

    [PSCustomObject] GenerateCompletion([string]$prompt, [string]$model, [hashtable]$options) {
        $payload = @{
            model  = $model
            prompt = $prompt
            stream = $false
        }

        if ($options) {
            foreach ($key in $options.Keys) {
                $payload[$key] = $options[$key]
            }
        }

        try {
            $response = Invoke-RestMethod -Uri "$($this.BaseUrl)/api/generate" `
                -Method Post `
                -Body ($payload | ConvertTo-Json -Depth 10) `
                -TimeoutSec $this.TimeoutSeconds `
                -ErrorAction Stop `
                -ContentType "application/json"

            return $response
        }
        catch {
            throw "Failed to generate completion from Ollama ($model): $($_.Exception.Message)"
        }
    }

    [PSCustomObject] GenerateChatCompletion([object[]]$messages, [hashtable]$options) {
        return $this.GenerateChatCompletion($messages, $this.DefaultModel, $options)
    }

    [PSCustomObject] GenerateChatCompletion([object[]]$messages, [string]$model, [hashtable]$options) {
        $payload = @{
            model    = $model
            messages = $messages
            stream   = $false
        }

        if ($options) {
            foreach ($key in $options.Keys) {
                # Prevent overwriting critical keys
                if ($key -notin @('model', 'messages', 'stream')) {
                    $payload[$key] = $options[$key]
                }
            }
        }

        try {
            # Convert to JSON with depth to ensure messages array is serialized
            $jsonBody = $payload | ConvertTo-Json -Depth 10 
            
            $response = Invoke-RestMethod -Uri "$($this.BaseUrl)/api/chat" `
                -Method Post `
                -Body $jsonBody `
                -TimeoutSec $this.TimeoutSeconds `
                -ErrorAction Stop `
                -ContentType "application/json"

            return $response
        }
        catch {
            throw "Failed to generate chat completion from Ollama ($model): $($_.Exception.Message)"
        }
    }
}
