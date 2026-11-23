param([Parameter(Mandatory)][ValidateSet('Focus','SaveDialog','Close','Identity')][string]$Action,
 [Parameter(Mandatory)][int]$OwnedPid,[string]$Target,[string]$ExpectedName,[Parameter(Mandatory)][string]$ReportPath)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable GitHub Windows host only' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class StandaloneWindowsNative {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
}
'@
$report=@{action=$Action;ownedPid=$OwnedPid;status='failed'}
try {
 $proc=Get-Process -Id $OwnedPid
 $report.executable=$proc.Path; $report.sessionId=$proc.SessionId; $report.windowHandle=$proc.MainWindowHandle.ToInt64()
 if ($proc.MainWindowHandle -eq [IntPtr]::Zero) { throw 'BLOCKED: actual owned native window handle unavailable' }
 $window=[Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
 if ($window.Current.ProcessId -ne $OwnedPid) { throw 'BLOCKED: window ownership mismatch' }
 $report.title=$window.Current.Name
 if ($Action -eq 'Focus') {
   $null=[StandaloneWindowsNative]::SetForegroundWindow($proc.MainWindowHandle)
   Start-Sleep -Milliseconds 200
   [uint32]$foregroundPid=0
   $null=[StandaloneWindowsNative]::GetWindowThreadProcessId([StandaloneWindowsNative]::GetForegroundWindow(),[ref]$foregroundPid)
   if ($foregroundPid -ne $OwnedPid) { throw 'BLOCKED: owned app could not obtain OS foreground focus' }
   $report.foregroundPid=$foregroundPid
 } elseif ($Action -eq 'SaveDialog') {
   if (-not $Target -or -not $ExpectedName -or (Test-Path -LiteralPath $Target)) { throw 'Save needs a fresh exact target and expected synthetic filename' }
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
     if ($candidate.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern,[ref]$value) -and $value.Current.Value -ceq $ExpectedName) {
       $matches+=@{element=$candidate;pattern=$value}
     }
   }
   if ($matches.Count -ne 1) { throw 'BLOCKED: unique native filename ValuePattern unavailable; no driver bypass or fabricated save' }
   $matches[0].pattern.SetValue($Target)
   if ($matches[0].pattern.Current.Value -cne $Target) { throw 'BLOCKED: native save path readback mismatch' }
   $buttons=@($fields | Where-Object { $_.Current.ProcessId -eq $OwnedPid -and $_.Current.AutomationId -eq '1' -and $_.Current.Name -match '^(Save|Opslaan)$' -and $_.Current.IsEnabled })
   if ($buttons.Count -ne 1) { throw 'BLOCKED: unique actual native Save button unavailable' }
   $buttons[0].GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
   $report.nativeSaveInvoked=$true; $report.pathReadbackMatches=$true; $report.target=$Target
 } elseif ($Action -eq 'Close') {
   $null=[StandaloneWindowsNative]::PostMessage($proc.MainWindowHandle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)
   $report.wmClosePosted=$true
 }
 $report.status='passed'
} catch { $report.error=$_.Exception.Message; if ($report.error.StartsWith('BLOCKED:')) { $report.status='blocked' }; throw }
finally { $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8 }
