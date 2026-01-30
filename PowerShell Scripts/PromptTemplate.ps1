class PromptTemplate {
    [string] $RawTemplate
    [string[]] $RequiredVariables

    PromptTemplate([string]$template) {
        if ([string]::IsNullOrWhiteSpace($template)) { 
            throw "PromptTemplate Error: Template string cannot be null or empty."
        }
        $this.RawTemplate = $template
        $this.ParseVariables()
    }

    [void] ParseVariables() {
        # Find all {VariableName} patterns
        $foundMatches = [regex]::Matches($this.RawTemplate, '\{([a-zA-Z0-9_]+)\}')
        $vars = [System.Collections.Generic.HashSet[string]]::new()
        
        foreach ($m in $foundMatches) {
            $vars.Add($m.Groups[1].Value) | Out-Null
        }
        
        $this.RequiredVariables = [string[]]$vars
    }

    [string] Render([hashtable]$variables) {
        $output = $this.RawTemplate

        # 1. Validation: Ensure all required variables are present
        foreach ($reqVar in $this.RequiredVariables) {
            if (-not $variables.ContainsKey($reqVar)) {
                throw "PromptTemplate Error: Missing required variable '{$reqVar}' in render arguments."
            }
        }

        # 2. Replacement
        foreach ($key in $variables.Keys) {
            # Use strict string replacement to avoid regex injection issues
            # Note: This simple replace doesn't handle nested braces (not needed for basic RAG)
            if ($null -ne $variables[$key]) {
                $output = $output.Replace("{$key}", [string]$variables[$key])
            }
        }
        
        return $output
    }
}
