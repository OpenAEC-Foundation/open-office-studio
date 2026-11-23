param([Parameter(Mandatory)][ValidateSet('Baseline','Executable','Process','Residual')][string]$Action,[string]$Path,[int]$OwnedPid)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable GitHub host only' }
if ($Action -eq 'Baseline') {
 $profiles=@()
 foreach ($base in @($env:APPDATA,$env:LOCALAPPDATA)) {
  foreach ($key in @('office','writer','spreadsheet','presentation','email','notition','database')) {
   $candidate=Join-Path $base "org.openaec.$key-studio"
   if (Test-Path -LiteralPath $candidate) { $profiles+=$candidate }
  }
 }
 $apps=@(Get-CimInstance Win32_Process | Where-Object Name -Match '^open-(office|writer|spreadsheet|presentation|email|notition|database)-studio\.exe$' | Select-Object ProcessId,Name,ExecutablePath,ParentProcessId)
 $suitePaths=@()
 foreach ($base in @($env:ProgramFiles,${env:ProgramFiles(x86)},(Join-Path $env:LOCALAPPDATA 'Programs'))) {
  if ($base) { foreach ($name in @('Open Office Studio','open-office-studio')) { $candidate=Join-Path $base $name; if (Test-Path -LiteralPath $candidate) { $suitePaths+=$candidate } } }
 }
 @{profiles=$profiles;apps=$apps;suitePaths=$suitePaths;os=[Environment]::OSVersion.VersionString;interactive=[Environment]::UserInteractive;session=(Get-Process -Id $PID).SessionId;webview2=@(Get-ChildItem -Path 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients' -ErrorAction SilentlyContinue | ForEach-Object {Get-ItemProperty $_.PSPath} | Where-Object name -Match 'WebView2' | Select-Object name,pv)} | ConvertTo-Json -Depth 6 -Compress
} elseif ($Action -eq 'Executable') {
 $file=Get-Item -LiteralPath $Path; $signature=Get-AuthenticodeSignature -LiteralPath $Path
 @{path=$file.FullName;sha256=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant();productVersion=$file.VersionInfo.ProductVersion;fileVersion=$file.VersionInfo.FileVersion;productName=$file.VersionInfo.ProductName;signature=$signature.Status.ToString();signer=$(if ($signature.SignerCertificate) {$signature.SignerCertificate.Subject} else {$null})} | ConvertTo-Json -Depth 4 -Compress
} elseif ($Action -eq 'Residual') {
 if (-not $Path -or $Path.Length -lt 25 -or $Path -notmatch 'oos-standalone23-') { throw 'Unique owned temporary profile path required' }
 $remaining=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -and $_.CommandLine.Contains($Path) } | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine)
 @{profile=$Path;processes=$remaining} | ConvertTo-Json -Depth 5 -Compress
} else {
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$OwnedPid"
 if (-not $process) { throw 'Owned process missing' }
 @{pid=$process.ProcessId;parent=$process.ParentProcessId;path=$process.ExecutablePath;commandLine=$process.CommandLine;windowHandle=(Get-Process -Id $OwnedPid).MainWindowHandle.ToInt64()} | ConvertTo-Json -Compress
}
