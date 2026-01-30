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
