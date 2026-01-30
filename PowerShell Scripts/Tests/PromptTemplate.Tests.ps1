Describe "PromptTemplate Class" {
    BeforeAll {
        $utilsModule = Join-Path $PSScriptRoot "..\LocalRagUtils\LocalRagUtils.psd1"
        Import-Module $utilsModule -Force
    }

    Context "Initialization" {
        It "should parse required variables" {
            $tpl = [PromptTemplate]::new("Hello {Name}, welcome to {City}!")
            $tpl.RequiredVariables.Count | Should -Be 2
            $tpl.RequiredVariables | Should -Contain "Name"
            $tpl.RequiredVariables | Should -Contain "City"
        }

        It "should throw on empty template" {
            { [PromptTemplate]::new("") } | Should -Throw
        }
    }

    Context "Rendering" {
        BeforeAll {
            $Global:tpl = [PromptTemplate]::new("Score: {Score}")
        }

        It "should render correctly with valid data" {
            $data = @{ Score = 100 }
            $result = $Global:tpl.Render($data)
            $result | Should -Be "Score: 100"
        }

        It "should throw if variable is missing" {
            $data = @{ WrongKey = 50 }
            { $Global:tpl.Render($data) } | Should -Throw "*Missing required variable '{Score}'*"
        }

        It "should ignore extra variables" {
            $data = @{ Score = 10; Extra = "Ignore" }
            $result = $Global:tpl.Render($data)
            $result | Should -Be "Score: 10"
        }
    }
}
