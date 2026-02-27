const { spawnSync } = require("child_process");

console.log("Testing Windows Forms...");

// Using the newer Vista-style folder picker which is more reliable across thread states
// by using the OpenFileDialog but configuring it for folders
const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select a folder"
$dialog.ShowNewFolderButton = $true

$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
} else {
    Write-Output "CANCELED"
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
