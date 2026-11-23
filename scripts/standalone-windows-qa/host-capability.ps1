param([Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable GitHub Windows host only; never run on the user PC' }
$output=Join-Path (Get-Location) $OutputPath
if (Test-Path -LiteralPath $output) { throw 'Fresh proof directory required' }
$null=New-Item -ItemType Directory -Path $output
$report=@{status='failed';scope='Host-only native fixture, not final app acceptance';os=[Environment]::OSVersion.VersionString;interactive=[Environment]::UserInteractive;runnerSession=(Get-Process -Id $PID).SessionId;steps=@();cleanup=@()}
$children=@()
try {
 Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes; Add-Type -AssemblyName System.Windows.Forms
 for ($phase=0;$phase -lt 2;$phase++) {
  $arguments=@('-NoProfile','-STA','-File',('"'+(Join-Path $PSScriptRoot 'host-form.ps1')+'"'),'-OutputPath',('"'+$output+'"'))
  if ($phase -eq 1) { $arguments+='-Reopen' }
  $readyPath=Join-Path $output 'ready.json'
  if (Test-Path -LiteralPath $readyPath) { Remove-Item -LiteralPath $readyPath }
  $child=Start-Process pwsh -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $output "form-$phase.stderr.txt") -RedirectStandardOutput (Join-Path $output "form-$phase.stdout.txt"); $children+=$child.Id
  $deadline=[DateTime]::UtcNow.AddSeconds(20)
  do { Start-Sleep -Milliseconds 200; $proc=Get-Process -Id $child.Id -ErrorAction Stop } while (-not (Test-Path -LiteralPath $readyPath) -and [DateTime]::UtcNow -lt $deadline)
  $ready=Get-Content -LiteralPath $readyPath -Raw | ConvertFrom-Json
  if ($ready.pid -ne $child.Id) { throw 'Native fixture receipt PID mismatch' }
  & (Join-Path $PSScriptRoot 'windows-actions.ps1') -Action Focus -OwnedPid $child.Id -WindowHandle $ready.handle -ReportPath (Join-Path $output "focus-$phase.json")
  $window=[Windows.Automation.AutomationElement]::FromHandle([IntPtr]::new($ready.handle))
  $field=$window.FindFirst([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty,'OwnedPreflightInput'))
  if (-not $field) { throw 'BLOCKED: native test input UIA element unavailable' }
  $field.SetFocus()
  if ([Windows.Automation.AutomationElement]::FocusedElement.Current.ProcessId -ne $child.Id) { throw 'BLOCKED: input focus is not owned' }
  $pattern=$field.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
  if ($phase -eq 0) {
   [Windows.Forms.SendKeys]::SendWait('STANDALONE23 CTRL SAVE REOPEN')
   if ($pattern.Current.Value -cne 'STANDALONE23 CTRL SAVE REOPEN') { throw 'BLOCKED: real keystroke readback failed' }
   [Windows.Forms.SendKeys]::SendWait('^s')
   & (Join-Path $PSScriptRoot 'windows-actions.ps1') -Action SaveDialog -OwnedPid $child.Id -WindowHandle $ready.handle -Target (Join-Path $output 'saved.txt') -ExpectedName 'saved.txt' -ReportPath (Join-Path $output 'native-save.json')
   $deadline=[DateTime]::UtcNow.AddSeconds(10)
   while (-not (Test-Path -LiteralPath (Join-Path $output 'saved.txt')) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
   if ([IO.File]::ReadAllText((Join-Path $output 'saved.txt')) -cne 'STANDALONE23 CTRL SAVE REOPEN') { throw 'Native save file mismatch' }
  } else {
   if ($pattern.Current.Value -cne 'STANDALONE23 CTRL SAVE REOPEN') { throw 'Native new-process reopen mismatch' }
  }
  $report.steps+=@{phase=$phase;pid=$child.Id;focusAndText=$true;reopen=($phase -eq 1)}
  & (Join-Path $PSScriptRoot 'windows-actions.ps1') -Action Close -OwnedPid $child.Id -WindowHandle $ready.handle -ReportPath (Join-Path $output "close-$phase.json")
  if (-not $child.WaitForExit(10000)) { throw 'BLOCKED: owned fixture did not close normally' }
 }
 if ($report.steps[0].pid -eq $report.steps[1].pid) { throw 'Fresh-process identity required' }
 $report.status='passed-host-only'
} catch { $report.error=$_.Exception.Message; if ($report.error.StartsWith('BLOCKED:')) { $report.status='blocked' }; throw }
finally {
 foreach ($childId in $children) {
  $process=Get-Process -Id $childId -ErrorAction SilentlyContinue
  if ($process) { Stop-Process -Id $childId -Force; $report.cleanup+=@{pid=$childId;forced=$true} } else { $report.cleanup+=@{pid=$childId;exited=$true} }
 }
 $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'report.json') -Encoding utf8
}
