# Chat-Rag.ps1
# Interactive RAG Chat Interface
# Features: RAG Search, Chat History, Strict Templating, Error Resilience

param(
    [string]$CollectionName = "ProjectDocs",
    [string]$OllamaUrl = "http://localhost:11434",
    [string]$Model = "llama3",
    [string]$EmbedModel = "nomic-embed-text",
    [int]$TopK = 3,
    [float]$MinScore = 0.6
)

# --- Load Module ---
$modulePath = Join-Path $PSScriptRoot "LocalRagUtils\LocalRagUtils.psd1"
if (-not (Test-Path $modulePath)) {
    Write-Error "LocalRagUtils module not found at $modulePath"
    exit 1
}
Import-Module $modulePath -Force

# --- Initialize ---
Write-Host "Initializing RAG Chat..." -ForegroundColor Cyan

# 1. Store
$dataDir = Join-Path $PSScriptRoot "Data"
if (-not (Test-Path $dataDir)) {
    Write-Error "Data directory not found. Run Ingest-Documents.ps1 first."
    exit 1
}
$store = [VectorStore]::new($dataDir, $CollectionName)
try { $store.Load() } catch { Write-Warning "Could not load store: $_" }

if ($store.Items.Count -eq 0) {
    Write-Warning "Vector Store is empty. The AI will not have context."
}

# 2. Client
$ollama = [OllamaClient]::new($OllamaUrl, $EmbedModel)
if (-not $ollama.IsAvailable()) {
    Write-Error "Ollama not available at $OllamaUrl"
    exit 1
}

# 3. Session
$session = [ChatSession]::new()

Write-Host "Ready! Type 'exit' to quit, 'clear' to reset." -ForegroundColor Green
Write-Host "Using Model: $Model | Embed: $EmbedModel | Docs: $($store.Items.Count)" -ForegroundColor DarkGray

# --- Main Loop ---
while ($true) {
    Write-Host "`nYou> " -NoNewline -ForegroundColor Green
    $userInput = Read-Host
    
    if ([string]::IsNullOrWhiteSpace($userInput)) { continue }
    if ($userInput -eq "exit" -or $userInput -eq "quit") { break }
    if ($userInput -eq "clear") { 
        $session.Clear()
        Write-Host "[Session Cleared]" -ForegroundColor Yellow
        continue 
    }

    try {
        Write-Host "..." -NoNewline -ForegroundColor DarkGray
        
        # 1. Retrieval
        $emb = $ollama.GetEmbedding($userInput)
        $results = $store.FindNearest($emb, $TopK, $MinScore)
        
        # 2. Context Construction
        $contextText = ""
        if ($results.Count -gt 0) {
            $contextText = ($results | ForEach-Object { 
                    "[Source: $($_.Metadata['FileName'])]`n$($_.Metadata['TextPreview'])..." 
                }) -join "`n`n"
        }
        else {
            $contextText = "No relevant documents found."
        }
        
        # 3. Render System Prompt (JIT)
        # Context and question are handled separately in the revised logic below.
        
        # 4. Build Payload
        # We construct a transient message list: [System (with context), ...History..., User (Input)]
        # Actually, since the template includes "{Question}", the system prompt acts as the "Current Turn Instruction"
        # But for Chat History consistency, we usually append "User: Input" separately.
        # Let's adjust:
        # Template should be for the SYSTEM instruction regarding the CURRENT context.
        # And we append the user message naturally.
        
        # REVISED TEMPLATE (System only)
        $sysTplRaw = @"
You are a technical assistant.
Use ONLY this context:
{Context}
"@
        $sysTpl = [PromptTemplate]::new($sysTplRaw)
        $finalSysMsg = $sysTpl.Render(@{ Context = $contextText })
        
        $payloadMessages = @()
        $payloadMessages += @{ role = "system"; content = $finalSysMsg }
        
        # Append Session History
        foreach ($hist in $session.History) {
            $payloadMessages += $hist
        }
        
        # Append Current User Input
        $payloadMessages += @{ role = "user"; content = $userInput }
        
        # 5. Generate
        $response = $ollama.GenerateChatCompletion($payloadMessages, $Model, @{ temperature = 0.3 })
        
        $answer = $response.message.content
        
        # 6. Output
        Write-Host "`rAI> " -NoNewline -ForegroundColor Cyan
        Write-Host $answer
        
        # 7. Update Session (Persist the turn)
        $session.AddUserMessage($userInput)
        $session.AddAssistantMessage($answer)
        
    }
    catch {
        Write-Host "`n[Error] $_" -ForegroundColor Red
    }
}
