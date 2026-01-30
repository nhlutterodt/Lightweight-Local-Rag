class ChatSession {
    [System.Collections.Generic.List[hashtable]] $History
    [string] $SessionId

    ChatSession() {
        $this.SessionId = [Guid]::NewGuid().ToString()
        $this.History = [System.Collections.Generic.List[hashtable]]::new()
    }

    [void] AddUserMessage([string]$content) {
        $this.History.Add(@{ role = "user"; content = $content })
    }

    [void] AddAssistantMessage([string]$content) {
        $this.History.Add(@{ role = "assistant"; content = $content })
    }
    
    [void] AddSystemMessage([string]$content) {
        # System messages usually go strictly at index 0 for APIs.
        # But for local history tracking, we might just append or insert.
        # For simplicity: Append. The runner decides how to order them for the API.
        $this.History.Add(@{ role = "system"; content = $content })
    }

    [void] Clear() {
        $this.History.Clear()
    }

    [void] Save([string]$path) {
        $data = @{
            SessionId = $this.SessionId
            History   = $this.History
            Timestamp = (Get-Date).ToString("o")
        }
        $json = $data | ConvertTo-Json -Depth 5
        Set-Content -Path $path -Value $json
    }

    [void] Load([string]$path) {
        if (-not (Test-Path $path)) { return }
        
        $json = Get-Content -Path $path -Raw | ConvertFrom-Json
        $this.SessionId = $json.SessionId
        
        $this.History.Clear()
        if ($json.History) {
            foreach ($msg in $json.History) {
                # Ensure hashtable
                $h = @{ role = $msg.role; content = $msg.content }
                $this.History.Add($h)
            }
        }
    }
}
