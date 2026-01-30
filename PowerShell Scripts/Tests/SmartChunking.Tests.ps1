Describe "SmartTextChunker" {
    BeforeAll {
        $utilsModule = Join-Path $PSScriptRoot "..\LocalRagUtils\LocalRagUtils.psd1"
        Import-Module $utilsModule -Force
    }

    Context "Header Splitting" {
        BeforeAll {
            $Global:chunker = [SmartTextChunker]::new(1000)
        }
        
        It "Should split text by H1 headers" {
            $markdown = @"
# Header 1
Content 1
# Header 2
Content 2
"@
            $chunks = $Global:chunker.SplitMarkdown($markdown)
            $chunks.Count | Should -Be 2
            $chunks[0].HeaderContext | Should -Be "Header 1"
            $chunks[1].HeaderContext | Should -Be "Header 2"
        }
        
        It "Should handle nested headers" {
            $markdown = @"
# Root
Intro
## Child
Details
### Grandchild
Deep details
# Root 2
Back to top
"@
            $chunks = $Global:chunker.SplitMarkdown($markdown)
            $chunks.Count | Should -Be 4
            
            $chunks[0].HeaderContext | Should -Be "Root"
            $chunks[1].HeaderContext | Should -Be "Root > Child"
            $chunks[2].HeaderContext | Should -Be "Root > Child > Grandchild"
            $chunks[3].HeaderContext | Should -Be "Root 2"
        }
    }
    
    Context "Fallback Splitting" {
        BeforeAll {
            $Global:chunkerSmall = [SmartTextChunker]::new(20) # Small chunk size
        }
        
        It "Should split large sections by paragraphs" {
            $markdown = @"
# Big Section
This is a very long paragraph that should certainly exceed the twenty character limit we set.

Short Para.
"@
            $chunks = $Global:chunkerSmall.SplitMarkdown($markdown)
            # "Big Section" -> 
            # 1. "This is a very long..."
            # 2. "paragraph that..."
            # ...
            
            $chunks.Count | Should -BeGreaterThan 1
            $chunks[0].HeaderContext | Should -Be "Big Section"
        }
    }
}
