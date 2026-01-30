# DataProcessor.ps1
# Advanced data processing and transformation utilities
# Part of the Local RAG Project utility abstraction layer

# Base processor interface for extensible data processing
class BaseProcessor {
    [string] $ProcessorType
    [hashtable] $Configuration
    [array] $ProcessingHistory
    
    BaseProcessor([string]$type) {
        $this.ProcessorType = $type
        $this.Configuration = @{}
        $this.ProcessingHistory = @()
    }
    
    # Abstract method - must be overridden
    [array] Process([array]$data, [hashtable]$options = @{}) {
        throw "Process method must be implemented by derived class"
    }
    
    # Record processing operation
    [void] RecordOperation([string]$operation, [int]$inputCount, [int]$outputCount, [double]$durationMs) {
        $this.ProcessingHistory += @{
            "timestamp" = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"
            "operation" = $operation
            "inputCount" = $inputCount
            "outputCount" = $outputCount
            "durationMs" = $durationMs
            "processorType" = $this.ProcessorType
        }
    }
}

# Filter processor for data filtering operations
class FilterProcessor : BaseProcessor {
    FilterProcessor() : base("Filter") {
        $this.Configuration = @{
            "caseSensitive" = $false
            "allowEmptyResults" = $true
            "defaultFilterMode" = "include"
        }
    }
    
    [array] Process([array]$data, [hashtable]$options = @{}) {
        $startTime = Get-Date
        $inputCount = $data.Count
        
        # Apply filters based on options
        $filtered = $data
        
        if ($options.ContainsKey("property") -and $options.ContainsKey("value")) {
            $filtered = $this.FilterByProperty($filtered, $options.property, $options.value, $options)
        }
        
        if ($options.ContainsKey("predicate")) {
            $filtered = $this.FilterByPredicate($filtered, $options.predicate)
        }
        
        if ($options.ContainsKey("range")) {
            $filtered = $this.FilterByRange($filtered, $options.range)
        }
        
        $duration = ((Get-Date) - $startTime).TotalMilliseconds
        $this.RecordOperation("Filter", $inputCount, $filtered.Count, $duration)
        
        return $filtered
    }
    
    [array] FilterByProperty([array]$data, [string]$property, $value, [hashtable]$options) {
        $caseSensitive = $options.ContainsKey("caseSensitive") ? $options.caseSensitive : $this.Configuration.caseSensitive
        $mode = $options.ContainsKey("mode") ? $options.mode : $this.Configuration.defaultFilterMode
        
        return $data | Where-Object {
            $itemValue = $null
            
            # Handle different object types
            if ($_ -is [hashtable]) {
                $itemValue = $_[$property]
            } elseif ($_.PSObject.Properties[$property]) {
                $itemValue = $_.$property
            } else {
                return $false
            }
            
            # Perform comparison
            $match = $false
            if ($caseSensitive) {
                $match = $itemValue -eq $value
            } else {
                $match = $itemValue -ieq $value
            }
            
            # Apply filter mode
            if ($mode -eq "exclude") {
                return -not $match
            } else {
                return $match
            }
        }
    }
    
    [array] FilterByPredicate([array]$data, [scriptblock]$predicate) {
        return $data | Where-Object $predicate
    }
    
    [array] FilterByRange([array]$data, [hashtable]$range) {
        $startIndex = $range.ContainsKey("start") ? $range.start : 0
        $endIndex = $range.ContainsKey("end") ? $range.end : ($data.Count - 1)
        $count = $range.ContainsKey("count") ? $range.count : $null
        
        if ($count) {
            $endIndex = [Math]::Min($startIndex + $count - 1, $data.Count - 1)
        }
        
        if ($startIndex -lt 0) { $startIndex = 0 }
        if ($endIndex -ge $data.Count) { $endIndex = $data.Count - 1 }
        
        return $data[$startIndex..$endIndex]
    }
}

# Transform processor for data transformation operations
class TransformProcessor : BaseProcessor {
    TransformProcessor() : base("Transform") {
        $this.Configuration = @{
            "preserveOriginalProperties" = $true
            "handleNullValues" = $true
            "defaultTransformMode" = "additive"
        }
    }
    
    [array] Process([array]$data, [hashtable]$options = @{}) {
        $startTime = Get-Date
        $inputCount = $data.Count
        
        $transformed = $data
        
        if ($options.ContainsKey("mapping")) {
            $transformed = $this.ApplyMapping($transformed, $options.mapping, $options)
        }
        
        if ($options.ContainsKey("calculations")) {
            $transformed = $this.ApplyCalculations($transformed, $options.calculations, $options)
        }
        
        if ($options.ContainsKey("formatting")) {
            $transformed = $this.ApplyFormatting($transformed, $options.formatting, $options)
        }
        
        $duration = ((Get-Date) - $startTime).TotalMilliseconds
        $this.RecordOperation("Transform", $inputCount, $transformed.Count, $duration)
        
        return $transformed
    }
    
    [array] ApplyMapping([array]$data, [hashtable]$mapping, [hashtable]$options) {
        $mode = $options.ContainsKey("mode") ? $options.mode : $this.Configuration.defaultTransformMode
        
        return $data | ForEach-Object {
            $item = $_
            $newItem = @{}
            
            # Preserve original properties if configured
            if ($this.Configuration.preserveOriginalProperties -and $mode -eq "additive") {
                if ($item -is [hashtable]) {
                    $newItem = $item.Clone()
                } else {
                    # Convert PSObject to hashtable
                    $item.PSObject.Properties | ForEach-Object {
                        $newItem[$_.Name] = $_.Value
                    }
                }
            }
            
            # Apply mappings
            foreach ($targetProperty in $mapping.Keys) {
                $sourceProperty = $mapping[$targetProperty]
                
                if ($sourceProperty -is [scriptblock]) {
                    # Execute script block transformation
                    $newItem[$targetProperty] = & $sourceProperty $item
                } else {
                    # Simple property mapping
                    if ($item -is [hashtable]) {
                        $newItem[$targetProperty] = $item[$sourceProperty]
                    } elseif ($item.PSObject.Properties[$sourceProperty]) {
                        $newItem[$targetProperty] = $item.$sourceProperty
                    } else {
                        $newItem[$targetProperty] = $null
                    }
                }
            }
            
            return $newItem
        }
    }
    
    [array] ApplyCalculations([array]$data, [hashtable]$calculations, [hashtable]$options) {
        return $data | ForEach-Object {
            $item = $_
            
            foreach ($calcProperty in $calculations.Keys) {
                $calculation = $calculations[$calcProperty]
                
                if ($calculation -is [scriptblock]) {
                    if ($item -is [hashtable]) {
                        $item[$calcProperty] = & $calculation $item
                    } else {
                        $item | Add-Member -MemberType NoteProperty -Name $calcProperty -Value (& $calculation $item) -Force
                    }
                }
            }
            
            return $item
        }
    }
    
    [array] ApplyFormatting([array]$data, [hashtable]$formatting, [hashtable]$options) {
        return $data | ForEach-Object {
            $item = $_
            
            foreach ($formatProperty in $formatting.Keys) {
                $formatRule = $formatting[$formatProperty]
                
                if ($item -is [hashtable] -and $item.ContainsKey($formatProperty)) {
                    $item[$formatProperty] = $formatRule -f $item[$formatProperty]
                } elseif ($item.PSObject.Properties[$formatProperty]) {
                    $item.$formatProperty = $formatRule -f $item.$formatProperty
                }
            }
            
            return $item
        }
    }
}

# Validation processor for data validation operations
class ValidationProcessor : BaseProcessor {
    [array] $ValidationErrors
    [array] $ValidationWarnings
    
    ValidationProcessor() : base("Validation") {
        $this.Configuration = @{
            "stopOnFirstError" = $false
            "includeWarnings" = $true
            "validationMode" = "strict"
        }
        $this.ValidationErrors = @()
        $this.ValidationWarnings = @()
    }
    
    [array] Process([array]$data, [hashtable]$options = @{}) {
        $startTime = Get-Date
        $inputCount = $data.Count
        
        $this.ValidationErrors = @()
        $this.ValidationWarnings = @()
        
        $validatedData = @()
        
        for ($i = 0; $i -lt $data.Count; $i++) {
            $item = $data[$i]
            $isValid = $true
            
            if ($options.ContainsKey("schema")) {
                $isValid = $this.ValidateSchema($item, $options.schema, $i)
            }
            
            if ($options.ContainsKey("rules") -and $isValid) {
                $isValid = $this.ValidateRules($item, $options.rules, $i)
            }
            
            if ($options.ContainsKey("constraints") -and $isValid) {
                $isValid = $this.ValidateConstraints($item, $options.constraints, $i)
            }
            
            if ($isValid -or -not $this.Configuration.stopOnFirstError) {
                if ($isValid) {
                    $validatedData += $item
                }
            } else {
                break
            }
        }
        
        $duration = ((Get-Date) - $startTime).TotalMilliseconds
        $this.RecordOperation("Validation", $inputCount, $validatedData.Count, $duration)
        
        return $validatedData
    }
    
    [bool] ValidateSchema([object]$item, [hashtable]$schema, [int]$index) {
        $isValid = $true
        
        foreach ($property in $schema.Keys) {
            $schemaRule = $schema[$property]
            $hasProperty = $false
            $value = $null
            
            if ($item -is [hashtable]) {
                $hasProperty = $item.ContainsKey($property)
                $value = $item[$property]
            } elseif ($item.PSObject.Properties[$property]) {
                $hasProperty = $true
                $value = $item.$property
            }
            
            # Check required properties
            if ($schemaRule.ContainsKey("required") -and $schemaRule.required -and -not $hasProperty) {
                $this.ValidationErrors += "Item ${index}: Required property '$property' is missing"
                $isValid = $false
                continue
            }
            
            if ($hasProperty) {
                # Check data types
                if ($schemaRule.ContainsKey("type")) {
                    $expectedType = $schemaRule.type
                    $actualType = $value.GetType().Name
                    
                    if ($actualType -ne $expectedType) {
                        $this.ValidationErrors += "Item ${index}: Property '$property' should be $expectedType but is $actualType"
                        $isValid = $false
                    }
                }
                
                # Check value ranges
                if ($schemaRule.ContainsKey("range") -and $value -is [System.ValueType]) {
                    $range = $schemaRule.range
                    if (($range.ContainsKey("min") -and $value -lt $range.min) -or 
                        ($range.ContainsKey("max") -and $value -gt $range.max)) {
                        $this.ValidationWarnings += "Item ${index}: Property '$property' value $value is outside recommended range"
                    }
                }
            }
        }
        
        return $isValid
    }
    
    [bool] ValidateRules([object]$item, [array]$rules, [int]$index) {
        $isValid = $true
        
        foreach ($rule in $rules) {
            if ($rule -is [scriptblock]) {
                try {
                    $result = & $rule $item
                    if (-not $result) {
                        $this.ValidationErrors += "Item ${index}: Custom validation rule failed"
                        $isValid = $false
                    }
                } catch {
                    $this.ValidationErrors += "Item ${index}: Validation rule execution failed - $($_.Exception.Message)"
                    $isValid = $false
                }
            }
        }
        
        return $isValid
    }
    
    [bool] ValidateConstraints([object]$item, [hashtable]$constraints, [int]$index) {
        $isValid = $true
        
        if ($constraints.ContainsKey("uniqueKeys")) {
            # Note: This would require access to the full dataset for proper implementation
            # For now, just validate the constraint structure
        }
        
        return $isValid
    }
    
    [hashtable] GetValidationSummary() {
        return @{
            "totalErrors" = $this.ValidationErrors.Count
            "totalWarnings" = $this.ValidationWarnings.Count
            "errors" = $this.ValidationErrors
            "warnings" = $this.ValidationWarnings
        }
    }
}

# Main DataProcessor class that coordinates all processing operations
class DataProcessor {
    [FilterProcessor] $Filter
    [TransformProcessor] $Transform  
    [ValidationProcessor] $Validation
    [hashtable] $Configuration
    [array] $ProcessingPipeline
    [hashtable] $Statistics
    
    DataProcessor() {
        $this.Filter = [FilterProcessor]::new()
        $this.Transform = [TransformProcessor]::new()
        $this.Validation = [ValidationProcessor]::new()
        $this.Configuration = @{
            "enableStatistics" = $true
            "enableProfiling" = $true
            "maxPipelineSteps" = 20
        }
        $this.ProcessingPipeline = @()
        $this.Statistics = @{
            "totalOperations" = 0
            "totalProcessingTime" = 0
            "averageProcessingTime" = 0
        }
    }
    
    # Process data through a single operation
    [array] ProcessData([array]$data, [string]$operation, [hashtable]$options = @{}) {
        $startTime = Get-Date
        $result = @()
        
        switch ($operation.ToLower()) {
            "filter" { 
                $result = $this.Filter.Process($data, $options) 
            }
            "transform" { 
                $result = $this.Transform.Process($data, $options) 
            }
            "validate" { 
                $result = $this.Validation.Process($data, $options) 
            }
            default { 
                throw "Unknown operation: $operation" 
            }
        }
        
        if ($this.Configuration.enableStatistics) {
            $duration = ((Get-Date) - $startTime).TotalMilliseconds
            $this.UpdateStatistics($duration)
        }
        
        return $result
    }
    
    # Process data through multiple operations in sequence
    [array] ProcessPipeline([array]$data, [array]$pipeline) {
        if ($pipeline.Count -gt $this.Configuration.maxPipelineSteps) {
            throw "Pipeline exceeds maximum allowed steps ($($this.Configuration.maxPipelineSteps))"
        }
        
        $current = $data
        $this.ProcessingPipeline = @()
        
        foreach ($step in $pipeline) {
            $operation = $step.operation
            $options = $step.ContainsKey("options") ? $step.options : @{}
            
            $stepStart = Get-Date
            $current = $this.ProcessData($current, $operation, $options)
            $stepDuration = ((Get-Date) - $stepStart).TotalMilliseconds
            
            $this.ProcessingPipeline += @{
                "operation" = $operation
                "inputCount" = $data.Count
                "outputCount" = $current.Count
                "durationMs" = $stepDuration
                "timestamp" = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"
            }
            
            # Break if no data remains and it's not a validation step
            if ($current.Count -eq 0 -and $operation -ne "validate") {
                break
            }
        }
        
        return $current
    }
    
    # Update processing statistics
    [void] UpdateStatistics([double]$duration) {
        $this.Statistics.totalOperations++
        $this.Statistics.totalProcessingTime += $duration
        $this.Statistics.averageProcessingTime = $this.Statistics.totalProcessingTime / $this.Statistics.totalOperations
    }
    
    # Get comprehensive processing report
    [hashtable] GetProcessingReport() {
        $report = @{
            "statistics" = $this.Statistics
            "pipeline" = $this.ProcessingPipeline
            "configuration" = $this.Configuration
            "processorHistory" = @{
                "filter" = $this.Filter.ProcessingHistory
                "transform" = $this.Transform.ProcessingHistory
                "validation" = $this.Validation.ProcessingHistory
            }
        }
        
        if ($this.Validation.ValidationErrors.Count -gt 0 -or $this.Validation.ValidationWarnings.Count -gt 0) {
            $report["validationSummary"] = $this.Validation.GetValidationSummary()
        }
        
        return $report
    }
    
    # Reset all processors and statistics
    [void] Reset() {
        $this.Filter = [FilterProcessor]::new()
        $this.Transform = [TransformProcessor]::new()
        $this.Validation = [ValidationProcessor]::new()
        $this.ProcessingPipeline = @()
        $this.Statistics = @{
            "totalOperations" = 0
            "totalProcessingTime" = 0
            "averageProcessingTime" = 0
        }
    }
}

# Convenience functions for backward compatibility and easy access

function New-DataProcessor {
    param(
        [hashtable]$Configuration = @{}
    )
    
    $processor = [DataProcessor]::new()
    
    # Apply custom configuration
    foreach ($key in $Configuration.Keys) {
        $processor.Configuration[$key] = $Configuration[$key]
    }
    
    return $processor
}

function Invoke-DataProcessing {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Data,
        [Parameter(Mandatory=$true)]
        [string]$Operation,
        [hashtable]$Options = @{},
        [DataProcessor]$Processor = $null
    )
    
    if (-not $Processor) {
        $Processor = New-DataProcessor
    }
    
    return $Processor.ProcessData($Data, $Operation, $Options)
}

function Invoke-DataPipeline {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Data,
        [Parameter(Mandatory=$true)]
        [array]$Pipeline,
        [DataProcessor]$Processor = $null,
        [switch]$ReturnReport
    )
    
    if (-not $Processor) {
        $Processor = New-DataProcessor
    }
    
    $result = $Processor.ProcessPipeline($Data, $Pipeline)
    
    if ($ReturnReport) {
        return @{
            "data" = $result
            "report" = $Processor.GetProcessingReport()
        }
    }
    
    return $result
}

# Data validation helpers
function Test-DataSchema {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Data,
        [Parameter(Mandatory=$true)]
        [hashtable]$Schema,
        [switch]$IncludeWarnings
    )
    
    $processor = New-DataProcessor
    $options = @{
        "schema" = $Schema
    }
    
    if ($IncludeWarnings) {
        $processor.Validation.Configuration.includeWarnings = $true
    }
    
    $processor.ProcessData($Data, "validate", $options) | Out-Null
    return $processor.Validation.GetValidationSummary()
}

# Export functions for module use
# Export-ModuleMember -Function New-DataProcessor, Invoke-DataProcessing, Invoke-DataPipeline, Test-DataSchema