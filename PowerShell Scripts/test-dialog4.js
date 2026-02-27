const { spawnSync } = require("child_process");

console.log("Testing VBScript approach...");

const script = `
$vbsPath = Join-Path $env:TEMP "SelectFolder.vbs"
$vbsCode = @"
Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.BrowseForFolder(0, "Select a folder", &H200, 0)
If objFolder Is Nothing Then
    Wscript.Echo "CANCELED"
Else
    Wscript.Echo objFolder.Self.Path
End If
"@

Set-Content -Path $vbsPath -Value $vbsCode

# Execute via cscript which handles GUI completely independently from Node's stdin
$result = cscript.exe //nologo $vbsPath | Out-String
Remove-Item $vbsPath -ErrorAction SilentlyContinue

Write-Output $result.Trim()
`;

const res = spawnSync(
  "pwsh",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-Command", script],
  { encoding: "utf8" },
);

console.log("STDOUT:", res.stdout);
console.log("STDERR:", res.stderr);
console.log("Status:", res.status);
