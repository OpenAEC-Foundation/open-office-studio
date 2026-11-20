# Elevated hosted runners ignore WEBVIEW2_* environment overrides. Use the
# executable-scoped machine policy only in disposable GitHub-hosted CI.
# https://learn.microsoft.com/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags
param(
  [Parameter(Mandatory)][ValidateSet('Enable', 'Restore')][string]$Phase,
  [Parameter(Mandatory)][string]$StateFile,
  [int]$Port
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'This policy helper is restricted to disposable GitHub-hosted CI'
}
$key = 'HKLM:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$name = 'open-office-studio.exe'
if ($Phase -eq 'Enable') {
  if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid CDP port' }
  if (Test-Path -LiteralPath $StateFile) { throw 'Policy state already exists' }
  $previous = Get-ItemProperty -LiteralPath $key -Name $name -ErrorAction SilentlyContinue
  $state = @{ existed = $null -ne $previous; value = $null; kind = 'String' }
  if ($null -ne $previous) {
    $state.value = $previous.$name
    $state.kind = (Get-Item -LiteralPath $key).GetValueKind($name).ToString()
  }
  $state | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding utf8
  if (-not (Test-Path -LiteralPath $key)) { New-Item -Path $key -Force | Out-Null }
  New-ItemProperty -LiteralPath $key -Name $name -Value "--remote-debugging-port=$Port --remote-debugging-address=127.0.0.1" -PropertyType String -Force | Out-Null
} elseif (Test-Path -LiteralPath $StateFile) {
  $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  if ($state.existed) {
    New-ItemProperty -LiteralPath $key -Name $name -Value $state.value -PropertyType $state.kind -Force | Out-Null
  } else {
    Remove-ItemProperty -LiteralPath $key -Name $name -ErrorAction SilentlyContinue
  }
}
