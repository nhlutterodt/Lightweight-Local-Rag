# VectorMath.ps1 - C# Accelerator for Vector Operations
# Uses Add-Type to compile inline C# for performance significantly better than native PowerShell loops.

$vectorMathCode = @"
using System;

namespace LocalRag {
    public static class VectorMath {
        public static float CosineSimilarity(float[] vectorA, float[] vectorB) {
            if (vectorA == null || vectorB == null) {
                throw new ArgumentNullException("Vectors cannot be null");
            }

            if (vectorA.Length != vectorB.Length) {
                throw new ArgumentException($"Vector length mismatch: {vectorA.Length} vs {vectorB.Length}");
            }

            float dotProduct = 0.0f;
            float magnitudeA = 0.0f;
            float magnitudeB = 0.0f;

            // Single pass loop for performance
            for (int i = 0; i < vectorA.Length; i++) {
                dotProduct += vectorA[i] * vectorB[i];
                magnitudeA += vectorA[i] * vectorA[i];
                magnitudeB += vectorB[i] * vectorB[i];
            }

            // Prevent division by zero
            if (magnitudeA == 0 || magnitudeB == 0) {
                return 0.0f;
            }

            return dotProduct / ((float)Math.Sqrt(magnitudeA) * (float)Math.Sqrt(magnitudeB));
        }

        /// <summary>
        /// Returns the indices of the top-k highest scores using bounded insertion sort.
        /// O(n*k) — much faster than full sort O(n log n) when k is small.
        /// </summary>
        public static int[] TopKIndices(float[] scores, int k) {
            if (scores == null || scores.Length == 0) return new int[0];
            if (k <= 0) return new int[0];
            if (k >= scores.Length) {
                // Return all indices sorted descending by score
                int[] all = new int[scores.Length];
                for (int i = 0; i < scores.Length; i++) all[i] = i;
                Array.Sort(all, (a, b) => scores[b].CompareTo(scores[a]));
                return all;
            }

            // Bounded insertion sort: maintain a sorted list of k best
            int[] topIdx = new int[k];
            float[] topScores = new float[k];
            for (int i = 0; i < k; i++) {
                topIdx[i] = -1;
                topScores[i] = float.MinValue;
            }

            for (int i = 0; i < scores.Length; i++) {
                // Check if this score beats the smallest in our top-k
                if (scores[i] > topScores[k - 1]) {
                    // Insert at correct position (shift down)
                    int insertAt = k - 1;
                    while (insertAt > 0 && scores[i] > topScores[insertAt - 1]) {
                        topScores[insertAt] = topScores[insertAt - 1];
                        topIdx[insertAt] = topIdx[insertAt - 1];
                        insertAt--;
                    }
                    topScores[insertAt] = scores[i];
                    topIdx[insertAt] = i;
                }
            }

            // Trim any unfilled slots (when scores.Length < k, handled above, but defensive)
            int validCount = 0;
            for (int i = 0; i < k; i++) {
                if (topIdx[i] != -1) validCount++;
            }
            if (validCount < k) {
                int[] trimmed = new int[validCount];
                Array.Copy(topIdx, trimmed, validCount);
                return trimmed;
            }

            return topIdx;
        }
    }
}
"@

# Helper function to load the type safely
function Import-VectorMath {
    # Check if type is already loaded to check for "Assembly already loaded" errors
    # Note: In PowerShell, you cannot unload an assembly. If the type exists, we assume it's good.
    try {
        if (-not ([System.Management.Automation.PSTypeName]'LocalRag.VectorMath').Type) {
            Add-Type -TypeDefinition $vectorMathCode -Language CSharp -ErrorAction Stop
        }
    }
    catch {
        Write-Warning "Failed to compile VectorMath C# accelerator: $_"
        throw
    }
}

# Auto-load on script execution
Import-VectorMath
