const { spawnSync } = require("child_process");

console.log("Testing Foreground Windows Forms...");

// Using P/Invoke to force the window to the foreground
const script = `
Add-Type -AssemblyName System.Windows.Forms

# Add C# code to call SetForegroundWindow
$Signature = @"
[DllImport("user32.dll")]
public static extern bool SetForegroundWindow(IntPtr hWnd);
"@
Add-Type -MemberDefinition $Signature -Name WindowNative -Namespace Win32

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select a folder"

# Create a dummy form to attach the dialog to and force it to the front
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
$form.Show()
[Win32.WindowNative]::SetForegroundWindow($form.Handle) | Out-Null

$result = $dialog.ShowDialog($form)
$form.Close()

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
