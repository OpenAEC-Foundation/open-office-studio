param([Parameter(Mandatory=$true)][int]$OwnedPid,
      [Parameter(Mandatory=$true)][string]$SavePath,
      [Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Native UI is restricted to the isolated CI runner' }
trap {
    $failure = @{ status='failed'; ownedPid=$OwnedPid; target=$SavePath; reason=$_.Exception.Message }
    if ($_.Exception.Message -like 'BLOCKED:*') { $failure.status = 'blocked' }
    if ($dialogInfo) { $failure.dialog = $dialogInfo }
    $failure | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReportPath -Encoding utf8
    exit 2
}
if (Test-Path -LiteralPath $SavePath) { throw 'Synthetic save target must not exist' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$automation = [System.Windows.Automation.AutomationElement]
$tree = [System.Windows.Automation.TreeScope]
$pidCondition = [System.Windows.Automation.PropertyCondition]::new($automation::ProcessIdProperty, $OwnedPid)
$deadline = [DateTime]::UtcNow.AddSeconds(35)
$dialog = $null
while ([DateTime]::UtcNow -lt $deadline) {
    $null = Get-Process -Id $OwnedPid -ErrorAction Stop
    $windows = $automation::RootElement.FindAll($tree::Children, $pidCondition)
    $ownedDialogs = @($windows | Where-Object { $_.Current.ClassName -eq '#32770' -and $_.Current.IsEnabled })
    if ($ownedDialogs.Count -eq 1) { $dialog = $ownedDialogs[0]; break }
    if ($ownedDialogs.Count -gt 1) { throw 'Multiple owned native dialogs; refusing ambiguous interaction' }
    Start-Sleep -Milliseconds 250
}
if (-not $dialog) { throw 'BLOCKED: owned Windows native save dialog is unavailable' }
$dialogInfo = @{ windowHandle=$dialog.Current.NativeWindowHandle; className=$dialog.Current.ClassName; ownedPid=$dialog.Current.ProcessId }
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
    $bitmap.Save([System.IO.Path]::ChangeExtension($ReportPath, '.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
$editCondition = [System.Windows.Automation.PropertyCondition]::new($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
$edits = $dialog.FindAll($tree::Descendants, $editCondition)
$filename = @($edits | Where-Object { $_.Current.AutomationId -eq '1001' -or $_.Current.Name -match '^(File name|Bestandsnaam):?$' })
if ($filename.Count -ne 1) { throw 'BLOCKED: native filename field is not uniquely identifiable' }
$value = $filename[0].GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
$value.SetValue($SavePath)
$buttons = $dialog.FindAll($tree::Descendants, [System.Windows.Automation.PropertyCondition]::new($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
$save = @($buttons | Where-Object { $_.Current.AutomationId -eq '1' -and $_.Current.Name -match '^(Save|Opslaan)$' -and $_.Current.IsEnabled })
if ($save.Count -ne 1) { throw 'BLOCKED: owned native Save button is not unique' }
$save[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
@{ ownedPid=$OwnedPid; dialog=$dialogInfo; nativeSaveInvoked=$true; target=$SavePath } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReportPath -Encoding utf8
