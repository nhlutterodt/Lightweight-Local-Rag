Describe "SourceManifest" {
    $TestDir = Join-Path $PSScriptRoot "TempManifest_Test"
    $CollectionName = "ManifestTest"

    BeforeAll {
        $modulePath = "$PSScriptRoot\..\LocalRagUtils\LocalRagUtils.psd1"
        if (Test-Path $modulePath) {
            Import-Module $modulePath -Force
        }
    }

    BeforeEach {
        if (Test-Path $TestDir) { Remove-Item $TestDir -Recurse -Force }
        New-Item $TestDir -ItemType Directory -Force | Out-Null
    }

    AfterAll {
        if (Test-Path $TestDir) { Remove-Item $TestDir -Recurse -Force }
    }

    Context "CRUD Operations" {
        It "should start empty" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.Count() | Should -Be 0
        }

        It "should add and retrieve entries" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("doc.md", "C:\docs\doc.md", "HASH123", 3, 1024, "nomic-embed-text")

            $entry = $m.GetEntry("doc.md")
            $entry | Should -Not -BeNullOrEmpty
            $entry.ContentHash | Should -Be "HASH123"
            $entry.ChunkCount | Should -Be 3
            $entry.FileSize | Should -Be 1024
            $entry.EmbeddingModel | Should -Be "nomic-embed-text"
        }

        It "should update existing entry" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("doc.md", "C:\docs\doc.md", "HASH_OLD", 3, 1024, "nomic-embed-text")
            $m.AddOrUpdate("doc.md", "C:\docs\doc.md", "HASH_NEW", 5, 2048, "nomic-embed-text")

            $m.Count() | Should -Be 1
            $entry = $m.GetEntry("doc.md")
            $entry.ContentHash | Should -Be "HASH_NEW"
            $entry.ChunkCount | Should -Be 5
        }

        It "should remove entries" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("doc.md", "C:\docs\doc.md", "HASH", 1, 100, "model")
            $m.Remove("doc.md")

            $m.Count() | Should -Be 0
            $m.GetEntry("doc.md") | Should -BeNullOrEmpty
        }

        It "should handle removing non-existent entry gracefully" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            { $m.Remove("nonexistent.md") } | Should -Not -Throw
        }
    }

    Context "Persistence" {
        It "should save and load manifest" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("a.md", "C:\a.md", "HASH_A", 2, 500, "model")
            $m.AddOrUpdate("b.md", "C:\b.md", "HASH_B", 4, 1000, "model")
            $m.Save()

            $m2 = [SourceManifest]::new($TestDir, $CollectionName)
            $m2.Load()

            $m2.Count() | Should -Be 2
            $m2.GetEntry("a.md").ContentHash | Should -Be "HASH_A"
            $m2.GetEntry("b.md").ChunkCount | Should -Be 4
        }

        It "should handle missing manifest file on load" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            { $m.Load() } | Should -Not -Throw
            $m.Count() | Should -Be 0
        }

        It "should clear manifest and remove file" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("doc.md", "C:\doc.md", "HASH", 1, 100, "model")
            $m.Save()

            $m.Clear()
            $m.Count() | Should -Be 0
            Test-Path ($m.GetManifestPath()) | Should -Be $false
        }
    }

    Context "Smart Detection" {
        It "should detect unchanged files" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("doc.md", "C:\doc.md", "HASH_ABC", 3, 1024, "model")

            $m.IsUnchanged("doc.md", "HASH_ABC") | Should -Be $true
            $m.IsUnchanged("doc.md", "HASH_DIFFERENT") | Should -Be $false
            $m.IsUnchanged("unknown.md", "HASH_ABC") | Should -Be $false
        }

        It "should find entries by content hash (rename detection)" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("old-name.md", "C:\old-name.md", "HASH_SAME", 3, 1024, "model")

            $found = $m.FindByHash("HASH_SAME")
            $found | Should -Not -BeNullOrEmpty
            $found.FileName | Should -Be "old-name.md"
        }

        It "should return null for unmatched hash" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.FindByHash("NO_MATCH") | Should -BeNullOrEmpty
        }

        It "should detect orphans" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("keep.md", "C:\keep.md", "H1", 1, 100, "model")
            $m.AddOrUpdate("deleted.md", "C:\deleted.md", "H2", 2, 200, "model")
            $m.AddOrUpdate("also-deleted.md", "C:\also-deleted.md", "H3", 1, 50, "model")

            $orphans = $m.GetOrphans(@("keep.md"))
            $orphans.Count | Should -Be 2
            $orphans | Should -Contain "deleted.md"
            $orphans | Should -Contain "also-deleted.md"
        }

        It "should return no orphans when all files present" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("a.md", "C:\a.md", "H1", 1, 100, "model")

            $orphans = $m.GetOrphans(@("a.md"))
            $orphans.Count | Should -Be 0
        }
    }

    Context "Case Insensitivity" {
        It "should match filenames case-insensitively" {
            $m = [SourceManifest]::new($TestDir, $CollectionName)
            $m.AddOrUpdate("MyDoc.MD", "C:\MyDoc.MD", "HASH", 1, 100, "model")

            $m.GetEntry("mydoc.md") | Should -Not -BeNullOrEmpty
            $m.IsUnchanged("MYDOC.MD", "HASH") | Should -Be $true
        }
    }
}
