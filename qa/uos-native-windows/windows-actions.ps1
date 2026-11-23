param([Parameter(Mandatory)][ValidateSet('Focus','SaveDialog','OpenDialog','Close','Identity')][string]$Action,
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
 } elseif ($Action -in @('SaveDialog','OpenDialog')) {
   $opening=$Action -eq 'OpenDialog'
   if (-not $Target) { throw 'Exact owned test target required' }
   if ($opening) {
     if (-not (Test-Path -LiteralPath $Target -PathType Leaf) -or $Target -notmatch '\.(uos|xlsx)$') { throw 'Open requires an existing owned UOS/XLSX fixture' }
   } elseif ((-not $ExpectedName -and -not $ExpectedPattern) -or (Test-Path -LiteralPath $Target)) { throw 'Save needs a fresh exact target and expected synthetic filename' }
   function Expected-Filename($text) {
     if ($ExpectedPattern) { return $text -cmatch $ExpectedPattern }
     # Windows may hide the registered extension in this same standard filename
     # field. Both exact known spellings are attributable; the saved bytes and
     # full destination extension remain independently mandatory.
     return $text -ceq $ExpectedName -or ($ExpectedName -match '\.(txt|docx|xlsx|pptx)$' -and $text -ceq [IO.Path]::GetFileNameWithoutExtension($ExpectedName))
   }
   $deadline=[DateTime]::UtcNow.AddSeconds(20); $dialog=$null
   do {
     $all=$window.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
     $top=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$OwnedPid))
     $report.ownedTopWindows=@($top | ForEach-Object { @{handle=$_.Current.NativeWindowHandle;className=$_.Current.ClassName;title=$_.Current.Name} })
     # Tauri's async common dialog may be an owned-process top-level window,
     # rather than a UIA descendant of the main WebView window.
     $candidates=@(@($all)+@($top)+@($window) | Where-Object { $_.Current.ProcessId -eq $OwnedPid -and $_.Current.ClassName -eq '#32770' } | Sort-Object {$_.Current.NativeWindowHandle} -Unique)
     if ($candidates.Count -eq 1) { $dialog=$candidates[0] }
     if ($candidates.Count -gt 1) { throw 'BLOCKED: more than one owned standard native dialog' }
     if (-not $dialog) { Start-Sleep -Milliseconds 200 }
   } while (-not $dialog -and [DateTime]::UtcNow -lt $deadline)
   if (-not $dialog) { throw 'BLOCKED: owned standard native Save dialog not exposed' }
   $fields=$dialog.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
   $report.dialogControls=@($fields | Where-Object { $_.Current.ProcessId -eq $OwnedPid } | ForEach-Object { @{id=$_.Current.AutomationId;name=$_.Current.Name;className=$_.Current.ClassName;type=$_.Current.ControlType.ProgrammaticName;accessKey=$_.Current.AccessKey;handle=$_.Current.NativeWindowHandle} })
   $matches=@()
   foreach ($candidate in $fields) {
     if ($candidate.Current.ProcessId -ne $OwnedPid -or -not $candidate.Current.IsEnabled) { continue }
     $value=$null
     if (-not $opening -and $candidate.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern,[ref]$value) -and (Expected-Filename $value.Current.Value)) {
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
     if($opening) {
       # Open starts with focus in the file list on this native host. Use its
       # ordinary filename mnemonic before requiring the exact Edit identity.
       # This is native keyboard focus, not a renderer/backend mutation.
       $null=[StandaloneWindowsNative]::SetForegroundWindow([IntPtr]::new($dialog.Current.NativeWindowHandle))
       [uint32]$foregroundOpenPid=0
       $null=[StandaloneWindowsNative]::GetWindowThreadProcessId([StandaloneWindowsNative]::GetForegroundWindow(),[ref]$foregroundOpenPid)
       if($foregroundOpenPid -ne $OwnedPid){throw 'BLOCKED: native Open dialog did not own foreground'}
       [Windows.Forms.SendKeys]::SendWait('%n')
       Start-Sleep -Milliseconds 150
       $report.filenameFocusKeys='Alt+n in the owned native common Open dialog'
     }
     [uint32]$dialogPid=0
     $thread=[StandaloneWindowsNative]::GetWindowThreadProcessId([IntPtr]::new($dialog.Current.NativeWindowHandle),[ref]$dialogPid)
     $gui=[StandaloneWindowsNative+GUI]::new(); $gui.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($gui)
     if (-not [StandaloneWindowsNative]::GetGUIThreadInfo($thread,[ref]$gui)) { throw 'BLOCKED: native dialog keyboard focus unavailable' }
     $fieldHandle=$gui.focus; [uint32]$fieldPid=0; $null=[StandaloneWindowsNative]::GetWindowThreadProcessId($fieldHandle,[ref]$fieldPid)
     $class=[Text.StringBuilder]::new(256); $null=[StandaloneWindowsNative]::GetClassName($fieldHandle,$class,256)
     $report.focusedFilenameCandidate=@{pid=$fieldPid;dialogPid=$dialogPid;className=$class.ToString();controlId=[StandaloneWindowsNative]::GetDlgCtrlID($fieldHandle);handle=$fieldHandle.ToInt64()}
     # The observed Open common dialog uses Edit1148 beside Static1090 "File
     # name:"; the separately proven Save dialog uses Edit1001. Keep exact
     # mode-specific identities, process ownership and ancestry mandatory.
     $expectedFieldId=if($opening){1148}else{1001}
     if ($fieldPid -ne $OwnedPid -or $dialogPid -ne $OwnedPid -or $class.ToString() -cne 'Edit' -or [StandaloneWindowsNative]::GetDlgCtrlID($fieldHandle) -ne $expectedFieldId) { throw 'BLOCKED: focused native filename identity not established' }
     if($opening) {
       $openLabels=@($fields | Where-Object { $_.Current.ProcessId -eq $OwnedPid -and $_.Current.AutomationId -eq '1090' -and $_.Current.Name -match '^(File name|Bestandsnaam):$' })
       $openFields=@($fields | Where-Object { $_.Current.ProcessId -eq $OwnedPid -and $_.Current.AutomationId -eq '1148' -and $_.Current.NativeWindowHandle -eq $fieldHandle.ToInt64() })
       if($openLabels.Count -ne 1 -or $openFields.Count -ne 1){throw 'BLOCKED: native Open filename label/field correlation missing'}
       $report.nativeFilenameLabel=$openLabels[0].Current.Name
     }
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
     $report.filenameBefore=Read-NativeFilename
     if (-not $opening -and -not (Expected-Filename $report.filenameBefore)) { throw 'BLOCKED: focused filename is not the expected synthetic source name' }
     [Windows.Forms.SendKeys]::SendWait('^a')
     $literal=($Target.ToCharArray() | ForEach-Object { if ('+^%~(){}[]'.Contains([string]$_)) {'{'+$_+'}'} else {[string]$_} }) -join ''
     [Windows.Forms.SendKeys]::SendWait($literal)
     if ((Read-NativeFilename) -cne $Target) { throw 'BLOCKED: typed native path readback mismatch' }
     $report.filenameMethod='physical-keys-owned-native-filename'; $report.filenameHandle=$fieldHandle.ToInt64()
   }
   $buttonPattern=if($opening){'^(Open|Openen)$'}else{'^(Save|Opslaan)$'}
   $report.dialogTitle=$dialog.Current.Name
   $report.dialogFields=@($fields | Where-Object { $_.Current.ProcessId -eq $OwnedPid -and $_.Current.ControlType -eq [Windows.Automation.ControlType]::ComboBox } | ForEach-Object { @{id=$_.Current.AutomationId;name=$_.Current.Name} })
   $buttons=@($fields | Where-Object { $_.Current.ProcessId -eq $OwnedPid -and $_.Current.AutomationId -eq '1' -and $_.Current.Name -match $buttonPattern -and $_.Current.IsEnabled })
   if ($buttons.Count -ne 1) { throw 'BLOCKED: unique actual native Save button unavailable' }
   $invoke=$null
   if ($buttons[0].TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)) {
     $invoke.Invoke(); $report.saveMethod='owned-native-Save-InvokePattern'
   } else {
     [uint32]$foregroundPid=0
     $null=[StandaloneWindowsNative]::GetWindowThreadProcessId([StandaloneWindowsNative]::GetForegroundWindow(),[ref]$foregroundPid)
     if ($foregroundPid -ne $OwnedPid) { throw 'BLOCKED: native Save lost OS foreground ownership' }
     # Standard dialog's verified Save button is the default action. Enter is
     # an actual user key; the independent real file remains mandatory.
     [Windows.Forms.SendKeys]::SendWait('{ENTER}'); $report.saveMethod='actual-Enter-owned-native-Save-dialog'
   }
   if($opening){$report.nativeOpenInvoked=$true}else{$report.nativeSaveInvoked=$true}
   $report.pathReadbackMatches=$true; $report.target=$Target
 } elseif ($Action -eq 'Close') {
   $null=[StandaloneWindowsNative]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)
   $report.wmClosePosted=$true
 }
 $report.status='passed'
} catch { $report.error=$_.Exception.Message; if ($report.error.StartsWith('BLOCKED:')) { $report.status='blocked' }; throw }
finally { $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8 }
