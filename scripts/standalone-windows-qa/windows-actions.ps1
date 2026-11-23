param([Parameter(Mandatory)][ValidateSet('Focus','SaveDialog','Close','Identity')][string]$Action,
 [Parameter(Mandatory)][int]$OwnedPid,[long]$WindowHandle=0,[string]$Target,[string]$ExpectedName,[string]$ExpectedPattern,[Parameter(Mandatory)][string]$ReportPath)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable GitHub Windows host only' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class StandaloneWindowsNative {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int a,b,c,d; }
 [StructLayout(LayoutKind.Sequential)] public struct GUI { public int cbSize; public uint flags; public IntPtr active,focus,capture,menu,move,caret; public RECT rc; }
 [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread,ref GUI gui);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",CharSet=CharSet.Unicode)] public static extern IntPtr ReadText(IntPtr h,uint m,UIntPtr count,StringBuilder text,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
}
'@
$report=@{action=$Action;ownedPid=$OwnedPid;status='failed'}
try {
 $proc=Get-Process -Id $OwnedPid
 $handle=$proc.MainWindowHandle
 if ($WindowHandle) { $handle=[IntPtr]::new($WindowHandle) }
 [uint32]$handlePid=0; $null=[StandaloneWindowsNative]::GetWindowThreadProcessId($handle,[ref]$handlePid)
 $report.executable=$proc.Path; $report.sessionId=$proc.SessionId; $report.windowHandle=$handle.ToInt64()
 if ($handle -eq [IntPtr]::Zero -or $handlePid -ne $OwnedPid) { throw 'BLOCKED: actual owned native window handle unavailable' }
 $window=[Windows.Automation.AutomationElement]::FromHandle($handle)
 if ($window.Current.ProcessId -ne $OwnedPid) { throw 'BLOCKED: window ownership mismatch' }
 $report.title=$window.Current.Name
 if ($Action -eq 'Focus') {
   $null=[StandaloneWindowsNative]::ShowWindow($handle,9)
   $null=[StandaloneWindowsNative]::SetForegroundWindow($handle)
   Start-Sleep -Milliseconds 200
   [uint32]$foregroundPid=0
   $null=[StandaloneWindowsNative]::GetWindowThreadProcessId([StandaloneWindowsNative]::GetForegroundWindow(),[ref]$foregroundPid)
   if ($foregroundPid -ne $OwnedPid) { throw 'BLOCKED: owned app could not obtain OS foreground focus' }
   $report.foregroundPid=$foregroundPid
 } elseif ($Action -eq 'SaveDialog') {
   if (-not $Target -or (-not $ExpectedName -and -not $ExpectedPattern) -or (Test-Path -LiteralPath $Target)) { throw 'Save needs a fresh exact target and expected synthetic filename' }
   function Expected-Filename($text) { if ($ExpectedPattern) { return $text -cmatch $ExpectedPattern }; return $text -ceq $ExpectedName }
   $deadline=[DateTime]::UtcNow.AddSeconds(20); $dialog=$null
   do {
     $all=$window.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
     $dialog=@($all | Where-Object { $_.Current.ProcessId -eq $OwnedPid -and $_.Current.ClassName -eq '#32770' }) | Select-Object -First 1
     if (-not $dialog) { Start-Sleep -Milliseconds 200 }
   } while (-not $dialog -and [DateTime]::UtcNow -lt $deadline)
   if (-not $dialog) { throw 'BLOCKED: owned standard native Save dialog not exposed' }
   $fields=$dialog.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
   $matches=@()
   foreach ($candidate in $fields) {
     if ($candidate.Current.ProcessId -ne $OwnedPid -or -not $candidate.Current.IsEnabled) { continue }
     $value=$null
     if ($candidate.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern,[ref]$value) -and (Expected-Filename $value.Current.Value)) {
       $matches+=@{element=$candidate;pattern=$value}
     }
   }
   if ($matches.Count -eq 1) {
     $matches[0].pattern.SetValue($Target)
     if ($matches[0].pattern.Current.Value -cne $Target) { throw 'BLOCKED: native save path readback mismatch' }
     $report.filenameMethod='owned-native-UIA-ValuePattern'
   } else {
     # Read identity from the OS focused HWND, then type through the real
     # keyboard. Never change renderer state, emulate a save, or WM_SETTEXT.
     [uint32]$dialogPid=0
     $thread=[StandaloneWindowsNative]::GetWindowThreadProcessId([IntPtr]::new($dialog.Current.NativeWindowHandle),[ref]$dialogPid)
     $gui=[StandaloneWindowsNative+GUI]::new(); $gui.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($gui)
     if (-not [StandaloneWindowsNative]::GetGUIThreadInfo($thread,[ref]$gui)) { throw 'BLOCKED: native dialog keyboard focus unavailable' }
     $fieldHandle=$gui.focus; [uint32]$fieldPid=0; $null=[StandaloneWindowsNative]::GetWindowThreadProcessId($fieldHandle,[ref]$fieldPid)
     $class=[Text.StringBuilder]::new(256); $null=[StandaloneWindowsNative]::GetClassName($fieldHandle,$class,256)
     if ($fieldPid -ne $OwnedPid -or $dialogPid -ne $OwnedPid -or $class.ToString() -cne 'Edit' -or [StandaloneWindowsNative]::GetDlgCtrlID($fieldHandle) -ne 1001) { throw 'BLOCKED: focused native filename identity not established' }
     $ancestor=$fieldHandle; $ownedDialog=$false
     for ($depth=0;$depth -lt 16 -and $ancestor -ne [IntPtr]::Zero;$depth++) {
       [uint32]$ancestorPid=0; $null=[StandaloneWindowsNative]::GetWindowThreadProcessId($ancestor,[ref]$ancestorPid)
       if ($ancestorPid -ne $OwnedPid) { break }
       if ($ancestor.ToInt64() -eq $dialog.Current.NativeWindowHandle) { $ownedDialog=$true; break }
       $ancestor=[StandaloneWindowsNative]::GetParent($ancestor)
     }
     if (-not $ownedDialog) { throw 'BLOCKED: filename HWND is outside the owned dialog' }
     function Read-NativeFilename {
       $text=[Text.StringBuilder]::new(32768); [UIntPtr]$read=[UIntPtr]::Zero
       if ([StandaloneWindowsNative]::ReadText($fieldHandle,13,[UIntPtr]::new(32768),$text,2,2000,[ref]$read) -eq [IntPtr]::Zero) { throw 'BLOCKED: native filename read timed out' }
       return $text.ToString()
     }
     if (-not (Expected-Filename (Read-NativeFilename))) { throw 'BLOCKED: focused filename is not the expected synthetic source name' }
     [Windows.Forms.SendKeys]::SendWait('^a')
     $literal=($Target.ToCharArray() | ForEach-Object { if ('+^%~(){}[]'.Contains([string]$_)) {'{'+$_+'}'} else {[string]$_} }) -join ''
     [Windows.Forms.SendKeys]::SendWait($literal)
     if ((Read-NativeFilename) -cne $Target) { throw 'BLOCKED: typed native path readback mismatch' }
     $report.filenameMethod='physical-keys-owned-native-filename'; $report.filenameHandle=$fieldHandle.ToInt64()
   }
   $buttons=@($fields | Where-Object { $_.Current.ProcessId -eq $OwnedPid -and $_.Current.AutomationId -eq '1' -and $_.Current.Name -match '^(Save|Opslaan)$' -and $_.Current.IsEnabled })
   if ($buttons.Count -ne 1) { throw 'BLOCKED: unique actual native Save button unavailable' }
   $buttons[0].GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
   $report.nativeSaveInvoked=$true; $report.pathReadbackMatches=$true; $report.target=$Target
 } elseif ($Action -eq 'Close') {
   $null=[StandaloneWindowsNative]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)
   $report.wmClosePosted=$true
 }
 $report.status='passed'
} catch { $report.error=$_.Exception.Message; if ($report.error.StartsWith('BLOCKED:')) { $report.status='blocked' }; throw }
finally { $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8 }
