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
    if ($nativeFieldInfo) { $failure.nativeField = $nativeFieldInfo }
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
function Test-OwnedNativeFilenameFacts($facts, $expectedPid, $expectedDialog, $names) {
    return $facts.focused -and $facts.enabled -and $facts.handle -gt 0 -and
        $facts.pid -eq $expectedPid -and $facts.className -ceq 'Edit' -and $facts.controlId -eq 1001 -and
        $facts.dialogHandle -eq $expectedDialog -and $facts.dialogClass -ceq '#32770' -and
        $facts.allAncestorsOwned -and $facts.fileNameHost -and $names -ccontains $facts.text
}
if ($filename) {
    $value = $filename.pattern
    $value.SetValue($SavePath)
    if ($value.Current.Value -ne $SavePath) { throw 'BLOCKED: native filename path readback does not match requested target' }
} else {
    # The actual Windows CI chooser exposes its standard Edit HWND as UIA Pane
    # without ValuePattern. Address that exact focused native control, never a
    # window title or editor/web field. WM_SETTEXT only edits the OS filename;
    # the actual native Save button below still performs the filesystem write.
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Epub356NativeField {
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder text, int count);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW", CharSet=CharSet.Unicode)]
 public static extern IntPtr ReadText(IntPtr h, uint msg, UIntPtr count, StringBuilder text, uint flags, uint timeout, out UIntPtr result);
 [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW", CharSet=CharSet.Unicode)]
 public static extern IntPtr SetText(IntPtr h, uint msg, UIntPtr count, string text, uint flags, uint timeout, out UIntPtr result);
}
'@
    $nativeHandle = [IntPtr]$automation::FocusedElement.Current.NativeWindowHandle
    function Read-OwnedNativeFieldFacts($handle) {
        $facts = @{handle=$handle.ToInt64(); focused=($automation::FocusedElement.Current.NativeWindowHandle -eq $handle.ToInt64()); enabled=[Epub356NativeField]::IsWindowEnabled($handle); allAncestorsOwned=$true; fileNameHost=$false; ancestry=@()}
        $ancestor=$handle
        for ($depth=0; $depth -lt 32 -and $ancestor -ne [IntPtr]::Zero; $depth++) {
            [uint32]$ancestorPid=0
            $null=[Epub356NativeField]::GetWindowThreadProcessId($ancestor,[ref]$ancestorPid)
            $class=[System.Text.StringBuilder]::new(256)
            $null=[Epub356NativeField]::GetClassName($ancestor,$class,$class.Capacity)
            $facts.ancestry += @{handle=$ancestor.ToInt64();pid=$ancestorPid;className=$class.ToString()}
            if ($depth -eq 0) { $facts.pid=$ancestorPid; $facts.className=$class.ToString(); $facts.controlId=[Epub356NativeField]::GetDlgCtrlID($ancestor) }
            if ($ancestorPid -ne $OwnedPid) { $facts.allAncestorsOwned=$false; break }
            if ($class.ToString() -ceq 'AppControlHost' -and @($focusedFieldInfo.ancestry | Where-Object {
                $_.automationId -ceq 'FileNameControlHost' -and $_.windowHandle -eq $ancestor.ToInt64() -and $_.ownedPid -eq $OwnedPid
            }).Count -eq 1) { $facts.fileNameHost=$true }
            if ($ancestor.ToInt64() -eq $dialogInfo.windowHandle) { $facts.dialogHandle=$ancestor.ToInt64(); $facts.dialogClass=$class.ToString(); break }
            $ancestor=[Epub356NativeField]::GetAncestor($ancestor,1)
        }
        if (-not $facts.focused -or -not $facts.enabled -or $facts.pid -ne $OwnedPid -or $facts.className -cne 'Edit' -or
            $facts.controlId -ne 1001 -or -not $facts.fileNameHost -or -not $facts.allAncestorsOwned -or
            $facts.dialogHandle -ne $dialogInfo.windowHandle -or $facts.dialogClass -cne '#32770') {
            throw 'BLOCKED: native filename identity changed before WM_GETTEXT'
        }
        $text=[System.Text.StringBuilder]::new(32768)
        [UIntPtr]$messageResult=[UIntPtr]::Zero
        if ([Epub356NativeField]::ReadText($handle,13,[UIntPtr]::new([uint64]$text.Capacity),$text,2,2000,[ref]$messageResult) -eq [IntPtr]::Zero) { throw 'BLOCKED: owned native filename WM_GETTEXT timed out' }
        $facts.text=$text.ToString()
        return $facts
    }
    $nativeFieldInfo=Read-OwnedNativeFieldFacts $nativeHandle
    if (-not (Test-OwnedNativeFilenameFacts $nativeFieldInfo $OwnedPid $dialogInfo.windowHandle $expectedNames)) { throw 'BLOCKED: focused native filename HWND/process/class/ancestor/value is not attributable' }
    [UIntPtr]$setResult=[UIntPtr]::Zero
    if ([Epub356NativeField]::SetText($nativeHandle,12,[UIntPtr]::Zero,$SavePath,2,2000,[ref]$setResult) -eq [IntPtr]::Zero -or $setResult.ToUInt64() -ne 1) { throw 'BLOCKED: owned native filename WM_SETTEXT failed' }
    $readback=Read-OwnedNativeFieldFacts $nativeHandle
    if (-not (Test-OwnedNativeFilenameFacts $readback $OwnedPid $dialogInfo.windowHandle @($SavePath))) { throw 'BLOCKED: owned native filename exact path/ownership readback failed' }
    $nativeFieldInfo.Remove('text')
    $nativeFieldInfo.pathReadbackMatches=$true
    $filename=@{metadata=@{method='owned-native-Edit-WM_SETTEXT';nativeField=$nativeFieldInfo}}
}
$buttons = $dialog.FindAll($tree::Descendants, [System.Windows.Automation.PropertyCondition]::new($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
$save = @($buttons | Where-Object { $_.Current.AutomationId -eq '1' -and $_.Current.Name -match '^(Save|Opslaan)$' -and $_.Current.IsEnabled })
if ($save.Count -ne 1) { throw 'BLOCKED: owned native Save button is not unique' }
$save[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
@{ ownedPid=$OwnedPid; dialog=$dialogInfo; filename=$filename.metadata; focusedField=$focusedFieldInfo; pathReadbackMatches=$true; nativeSaveInvoked=$true; target=$SavePath } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReportPath -Encoding utf8
