Describe "VectorStore Integration" {
    # Isolate test directory
    $TestDir = Join-Path $PSScriptRoot "TempVectorStore_Final"
    
    BeforeAll {
        $modulePath = "$PSScriptRoot\..\LocalRagUtils\LocalRagUtils.psd1"
        if (Test-Path $modulePath) {
            Import-Module $modulePath -Force
        }
        
        if (Test-Path $TestDir) { Remove-Item $TestDir -Recurse -Force }
    }

    AfterAll {
        if (Test-Path $TestDir) { Remove-Item $TestDir -Recurse -Force }
    }

    Context "Core Functionality" {
        It "should initialize empty" {
            $store = [VectorStore]::new($TestDir, "test_init")
            $store.Items.Count | Should -Be 0
        }

        It "should add items and search (Exact Match)" {
            $store = [VectorStore]::new($TestDir, "test_search")
            
            # Use explicit variables for strict typing
            $v1 = [float[]]@(1.0, 0.0)
            $v2 = [float[]]@(0.0, 1.0)
            
            $store.Add("A", $v1, @{ type = "test" })
            $store.Add("B", $v2, @{ type = "test" })
            
            # Query for A
            $query = [float[]]@(1.0, 0.1)
            $results = $store.FindNearest($query, [int]1, [float]0.0)
            
            $results.Count | Should -Be 1
            $results[0].Id | Should -Be "A"
        }

        It "should persist data to disk" {
            $store = [VectorStore]::new($TestDir, "test_persist")
            $v = [float[]]@(0.5, 0.5)
            $store.Add("P1", $v, @{ save = $true })
            $store.Save()
            
            # Verify files exist
            $binPath = Join-Path $TestDir "test_persist.vectors.bin"
            Test-Path $binPath | Should -Be $true
            
            # Load in new instance
            $store2 = [VectorStore]::new($TestDir, "test_persist")
            $store2.Load()
            
            $store2.Items.Count | Should -Be 1
            $store2.Items[0].Id | Should -Be "P1"
        }
    }
    
    Context "Safety" {
        It "should prevent dimension mismatch" {
            $store = [VectorStore]::new($TestDir, "test_safety")
            $v2d = [float[]]@(1.0, 1.0)
            $v3d = [float[]]@(1.0, 1.0, 1.0)
            
            $store.Add("ok", $v2d, @{})
            
            { $store.Add("fail", $v3d, @{}) } | Should -Throw
        }
    }

    Context "Incremental Re-ingestion" {
        It "should remove items by source filename" {
            $store = [VectorStore]::new($TestDir, "test_remove")
            $v = [float[]]@(1.0, 0.0)
            $store.Add("a", $v, @{ FileName = "doc1.md" })
            $store.Add("b", $v, @{ FileName = "doc2.md" })
            $store.Add("c", $v, @{ FileName = "doc1.md" })
            
            $store.RemoveBySource("doc1.md")
            
            $store.Items.Count | Should -Be 1
            $store.Items[0].Id | Should -Be "b"
        }

        It "should handle removing non-existent source gracefully" {
            $store = [VectorStore]::new($TestDir, "test_remove_none")
            $v = [float[]]@(1.0, 0.0)
            $store.Add("a", $v, @{ FileName = "doc1.md" })
            
            $store.RemoveBySource("nonexistent.md")
            
            $store.Items.Count | Should -Be 1
        }
    }

    Context "Metadata Update (Rename Support)" {
        It "should update FileName and Source for matching items" {
            $store = [VectorStore]::new($TestDir, "test_rename")
            $v = [float[]]@(1.0, 0.0)
            $store.Add("chunk1", $v, @{ FileName = "old.md"; Source = "C:\old.md" })
            $store.Add("chunk2", $v, @{ FileName = "old.md"; Source = "C:\old.md" })
            $store.Add("other", $v, @{ FileName = "other.md"; Source = "C:\other.md" })

            $updated = $store.UpdateMetadataBySource("old.md", "new.md", "C:\new.md")

            $updated | Should -Be 2
            $store.Items[0].Metadata["FileName"] | Should -Be "new.md"
            $store.Items[0].Metadata["Source"] | Should -Be "C:\new.md"
            $store.Items[2].Metadata["FileName"] | Should -Be "other.md"
        }

        It "should return 0 when no items match" {
            $store = [VectorStore]::new($TestDir, "test_rename_none")
            $v = [float[]]@(1.0, 0.0)
            $store.Add("a", $v, @{ FileName = "doc.md" })

            $updated = $store.UpdateMetadataBySource("nonexistent.md", "new.md", "C:\new.md")
            $updated | Should -Be 0
        }
    }
}
