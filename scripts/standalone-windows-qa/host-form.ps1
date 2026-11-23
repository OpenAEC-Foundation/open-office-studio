param([Parameter(Mandatory)][string]$OutputPath,[switch]$Reopen)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable GitHub Windows host only' }
Add-Type -AssemblyName System.Windows.Forms
$form=[Windows.Forms.Form]::new(); $form.Text='Standalone QA owned host preflight'; $form.Width=600; $form.Height=300; $form.KeyPreview=$true
$field=[Windows.Forms.TextBox]::new(); $field.Name='OwnedPreflightInput'; $field.Multiline=$true; $field.Dock='Fill'; $form.Controls.Add($field)
if ($Reopen) { $field.Text=[IO.File]::ReadAllText((Join-Path $OutputPath 'saved.txt')) }
$form.Add_Shown({ $form.Activate(); $field.Focus(); [IO.File]::WriteAllText((Join-Path $OutputPath 'ready.json'),(@{pid=$PID;handle=$form.Handle.ToInt64();reopen=[bool]$Reopen}|ConvertTo-Json)) })
$form.Add_KeyDown({
  if ($_.Control -and $_.KeyCode -eq 'S') {
    $_.SuppressKeyPress=$true
    $dialog=[Windows.Forms.SaveFileDialog]::new(); $dialog.FileName='saved.txt'; $dialog.InitialDirectory=$OutputPath; $dialog.Filter='Text|*.txt'
    if ($dialog.ShowDialog($form) -eq 'OK') { [IO.File]::WriteAllText($dialog.FileName,$field.Text) }
    $dialog.Dispose()
  }
})
[Windows.Forms.Application]::Run($form)
$form.Dispose()
