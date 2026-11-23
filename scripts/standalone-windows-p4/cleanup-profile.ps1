param([Parameter(Mandatory)][ValidatePattern('^org\.openaec\.(writer|spreadsheet|presentation|email|notition|database)-studio$')][string]$Identifier,
 [Parameter(Mandatory)][string]$BaselinePath,[Parameter(Mandatory)][string]$ReportPath)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable GitHub host only' }
$before=Get-Content -LiteralPath $BaselinePath -Raw | ConvertFrom-Json
if (@($before.profiles).Count -ne 0 -or @($before.apps).Count -ne 0) { throw 'Cannot remove profiles that predate our isolated test' }
$app=$Identifier -replace '^org\.openaec\.','' -replace '-studio$',''
if (Get-Process -Name "open-$app-studio" -ErrorAction SilentlyContinue) { throw 'Cannot remove the profile while its own app is running' }
$report=@{identifier=$Identifier;removed=@();status='failed'}
try {
 foreach ($base in @($env:APPDATA,$env:LOCALAPPDATA)) {
  $parent=[IO.Path]::GetFullPath($base).TrimEnd('\')
  $target=[IO.Path]::GetFullPath((Join-Path $parent $Identifier))
  if ([IO.Path]::GetDirectoryName($target) -cne $parent -or [IO.Path]::GetFileName($target) -cne $Identifier) { throw 'Own profile path containment failed' }
  if (Test-Path -LiteralPath $target) {
   $resolved=(Resolve-Path -LiteralPath $target).Path
   if ($resolved -cne $target) { throw 'Own profile resolved to a different path' }
   if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Own profile cannot be a junction/symlink' }
   Remove-Item -LiteralPath $target -Recurse -Force
   $report.removed+=$target
  }
 }
 $report.status='passed'
} finally { $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding utf8 }
