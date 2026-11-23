param([Parameter(Mandatory)][string]$Executable,[Parameter(Mandatory)][string]$ProductName,
 [Parameter(Mandatory)][ValidatePattern('^org\.openaec\.database-studio$')][string]$Identifier)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Disposable GitHub host only' }
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'Actual installed executable required' }
# Read actual installer-created OS properties; never create/save a shortcut or alter ACLs.
$shell=New-Object -ComObject Shell.Application
$linkshell=New-Object -ComObject WScript.Shell
$links=@()
foreach ($base in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms'))) {
 if (-not $base -or -not (Test-Path -LiteralPath $base)) { continue }
 foreach ($file in @(Get-ChildItem -LiteralPath $base -Recurse -File -Filter "$ProductName.lnk")) {
  $folder=$shell.NameSpace($file.DirectoryName)
  $item=$folder.ParseName($file.Name)
  $actualId=[string]$item.ExtendedProperty('System.AppUserModel.ID')
  $link=$linkshell.CreateShortcut($file.FullName)
  $links+=@{path=$file.FullName;identifier=$actualId;target=$link.TargetPath;bytes=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
 }
}
if ($links.Count -lt 1) { throw 'BLOCKED: actual installer-created Database Start-menu shortcut absent' }
$ids=@($links | ForEach-Object identifier | Select-Object -Unique)
if ($ids.Count -ne 1 -or $ids[0] -cne $Identifier) { throw 'BLOCKED: actual Windows AppUserModelID differs from pinned app identifier' }
@{identifier=$ids[0];source='Read-only System.AppUserModel.ID on actual installer-created shortcut; target matched to independently payload-bound signed installed PE by caller';shortcuts=$links} | ConvertTo-Json -Depth 6 -Compress
