const { spawnSync } = require("child_process");

console.log("Testing Shell.Application...");

const script = `
try {
    $objShell = New-Object -ComObject Shell.Application
    # 0x0200 = BIF_NEWDIALOGSTYLE
    # 0 = handle to parent window (0 = desktop)
    $objFolder = $objShell.BrowseForFolder(0, "Select a folder", 0x200, 0)
    if ($objFolder) {
        Write-Output $objFolder.Self.Path
    } else {
        Write-Output "CANCELED"
    }
} catch {
    Write-Error $_
}
`;

const res = spawnSync(
  "pwsh",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-Command", script],
  { encoding: "utf8" },
);

console.log("STDOUT:", res.stdout);
console.log("STDERR:", res.stderr);
console.log("Status:", res.status);
