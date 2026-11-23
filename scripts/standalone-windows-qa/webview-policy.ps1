param([Parameter(Mandatory)][ValidateSet('Enable','Restore')][string]$Phase,
 [Parameter(Mandatory)][ValidatePattern('^open-(writer|spreadsheet|presentation|email|notition|database)-studio\.exe$')][string]$Executable,
 [Parameter(Mandatory)][string]$StatePath,[int]$Port,[string]$ProfilePath)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable GitHub host only' }
$base='HKLM:\Software\Policies\Microsoft\Edge\WebView2'
if ($Phase -eq 'Enable') {
 if ((Test-Path -LiteralPath $StatePath) -or $Port -lt 1024 -or $Port -gt 65535 -or -not $ProfilePath) { throw 'Fresh bounded policy state, port and profile required' }
 $state=@()
 foreach ($entry in @(@{key='AdditionalBrowserArguments';value="--remote-debugging-port=$Port --remote-debugging-address=127.0.0.1"},@{key='UserDataFolder';value=$ProfilePath})) {
  $key=Join-Path $base $entry.key
  $previous=Get-ItemProperty -LiteralPath $key -Name $Executable -ErrorAction SilentlyContinue
  $state+=@{key=$key;existed=($null -ne $previous);value=$(if ($previous) {$previous.$Executable} else {$null});kind=$(if($previous){(Get-Item -LiteralPath $key).GetValueKind($Executable).ToString()}else{'String'})}
 }
 $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StatePath -Encoding utf8
 foreach ($entry in @(@{key='AdditionalBrowserArguments';value="--remote-debugging-port=$Port --remote-debugging-address=127.0.0.1"},@{key='UserDataFolder';value=$ProfilePath})) {
  $key=Join-Path $base $entry.key; $null=New-Item -Path $key -Force
  $null=New-ItemProperty -LiteralPath $key -Name $Executable -Value $entry.value -PropertyType String -Force
 }
} elseif (Test-Path -LiteralPath $StatePath) {
 foreach ($entry in (Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json)) {
  if ($entry.existed) { $null=New-ItemProperty -LiteralPath $entry.key -Name $Executable -Value $entry.value -PropertyType $entry.kind -Force }
  else { Remove-ItemProperty -LiteralPath $entry.key -Name $Executable -ErrorAction SilentlyContinue }
 }
}
