param([Parameter(Mandatory=$true)][int]$OwnedPid,
      [Parameter(Mandatory=$true)][string]$SavePath,
      [Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Native UI is restricted to the isolated CI runner' }
trap {
    $failure = @{ status='failed'; ownedPid=$OwnedPid; target=$SavePath; reason=$_.Exception.Message }
    if ($_.Exception.Message -like 'BLOCKED:*') { $failure.status = 'blocked' }
    if ($dialogInfo) { $failure.dialog = $dialogInfo }
    if ($filenameInventory) { $failure.filenameInventory = $filenameInventory }
    if ($focusedFieldInfo) { $failure.focusedField = $focusedFieldInfo }
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
$expectedNames = @([System.IO.Path]::GetFileName($SavePath), [System.IO.Path]::GetFileNameWithoutExtension($SavePath))
function Inspect-OwnedFilenameField($element) {
    if (-not $element) { return $null }
    $info = @{ automationId=$element.Current.AutomationId; name=$element.Current.Name; controlType=$element.Current.ControlType.ProgrammaticName; ownedPid=$element.Current.ProcessId; enabled=$element.Current.IsEnabled; ancestry=@() }
    $nativeType = $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -or $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox
    $ancestor = $element
    $insideOwnedDialog = $false
    for ($depth=0; $depth -lt 32 -and $ancestor; $depth++) {
        $info.ancestry += @{ automationId=$ancestor.Current.AutomationId; className=$ancestor.Current.ClassName; ownedPid=$ancestor.Current.ProcessId; windowHandle=$ancestor.Current.NativeWindowHandle }
        if ($ancestor.Current.ProcessId -ne $OwnedPid) { break }
        if ($ancestor.Current.NativeWindowHandle -eq $dialogInfo.windowHandle -and $ancestor.Current.ClassName -eq '#32770') { $insideOwnedDialog=$true; break }
        $ancestor = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($ancestor)
    }
    $pattern = $null
    $hasValue = $element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)
    $matchesExpected = $hasValue -and $expectedNames -contains $pattern.Current.Value
    $info.insideOwnedDialog=$insideOwnedDialog
    $info.expectedSyntheticFilename=$matchesExpected
    $info.valuePatternAvailable=$hasValue
    return @{ element=$element; pattern=$pattern; metadata=$info; accepted=($nativeType -and $element.Current.IsEnabled -and $insideOwnedDialog -and $matchesExpected) }
}
$focused = Inspect-OwnedFilenameField $automation::FocusedElement
if ($focused) { $focusedFieldInfo = $focused.metadata }
$filenameInventory = @()
$filename = $null
if ($focused -and $focused.accepted) {
    $filename = $focused
} else {
    $fieldCondition = [System.Windows.Automation.OrCondition]::new(
        [System.Windows.Automation.PropertyCondition]::new($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit),
        [System.Windows.Automation.PropertyCondition]::new($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::ComboBox))
    $fields = $dialog.FindAll($tree::Descendants, $fieldCondition)
    $accepted = @()
    foreach ($field in $fields) {
        $candidate = Inspect-OwnedFilenameField $field
        $filenameInventory += $candidate.metadata
        if ($candidate.accepted) { $accepted += $candidate }
    }
    if ($accepted.Count -eq 1) { $filename = $accepted[0] }
}
if (-not $filename) { throw 'BLOCKED: focused/unique synthetic filename field is not attributable to owned native dialog' }
$value = $filename.pattern
$value.SetValue($SavePath)
if ($value.Current.Value -ne $SavePath) { throw 'BLOCKED: native filename path readback does not match requested target' }
$buttons = $dialog.FindAll($tree::Descendants, [System.Windows.Automation.PropertyCondition]::new($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
$save = @($buttons | Where-Object { $_.Current.AutomationId -eq '1' -and $_.Current.Name -match '^(Save|Opslaan)$' -and $_.Current.IsEnabled })
if ($save.Count -ne 1) { throw 'BLOCKED: owned native Save button is not unique' }
$save[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
@{ ownedPid=$OwnedPid; dialog=$dialogInfo; filename=$filename.metadata; focusedField=$focusedFieldInfo; pathReadbackMatches=$true; nativeSaveInvoked=$true; target=$SavePath } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReportPath -Encoding utf8
