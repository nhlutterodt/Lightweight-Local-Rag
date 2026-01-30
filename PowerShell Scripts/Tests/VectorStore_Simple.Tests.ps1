Describe "VectorStore Simple" {
    $TestDir = "$PSScriptRoot\TempVS_Simple"
    
    BeforeAll {
        Import-Module "$PSScriptRoot\..\LocalRagUtils\LocalRagUtils.psd1" -Force
        if (Test-Path $TestDir) { 
            try { Remove-Item $TestDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
        }
    }

    It "Add and Find" {
        $store = [VectorStore]::new($TestDir, "simple")
        
        $v1 = [float[]]@(1.0, 0.0)
        $store.Add("A", $v1, @{})
        
        $query = [float[]]@(1.0, 0.1)
        $results = $store.FindNearest($query, [int]1, [float]0.0)
        
        $results.Count | Should -Be 1
        $results[0].Id | Should -Be "A"
    }

    It "Save and Load" {
        $store = [VectorStore]::new($TestDir, "persist")
        $store.Add("P1", [float[]]@(0.5, 0.5), @{})
        $store.Save()
        
        $store2 = [VectorStore]::new($TestDir, "persist")
        $store2.Load()
        
        $store2.Items.Count | Should -Be 1
        $store2.Items[0].Id | Should -Be "P1"
    }
}
