# Bounded public-release binding, not a repeat of already accepted native UI cases.
# Runs only on an isolated GitHub Windows host; never installs on the user's PC.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Only the isolated GitHub Windows host is allowed'
}
$root = [IO.Path]::GetFullPath((Join-Path $PWD '.local/published-suite'))
if (Test-Path -LiteralPath $root) { throw 'Fresh evidence directory required' }
New-Item -ItemType Directory -Path $root | Out-Null
$install = Join-Path $root 'installed'
$payload = Join-Path $root 'payload'
$installer = Join-Path $root 'public-installer.exe'
$commit = 'b696ab86bd1c128729a079b68c0082e6df3d36a5'
$tree = 'e30879fd772871e690847c061ef66e6b81808a05'
$installerSha = '69a1fa6cd5e5ad84707a3f627ee26cfdefd8a7cc27193a2d543f92f42e2a3334'
$peSha = '48ff65c7a2a83c0bc60593ef518cde0ce2798745b034a0cfa58063fe6193176b'
$assetName = 'Open.Office.Studio_2026.48.1_x64-setup.exe'
$publicUrl = "https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.48.1/$assetName"
$report = [ordered]@{
    status = 'running'; harnessCommit = $env:GITHUB_SHA; run = $env:GITHUB_RUN_ID
    attempt = $env:GITHUB_RUN_ATTEMPT; applicationCommit = $commit; applicationTree = $tree
    version = '2026.48.1'; releaseId = 456623378; assetId = 786782581
    scope = 'Published Windows Suite download/signature/independent PE/private installation binding only'
    signatures = @(); checks = @(); cleanup = @{}
    reusedNativeEvidence = @{
        coreRun = 45196601365; coreArtifact = 14829555350; acceptedCoreChecks = 12
        originWholeCoreRunRemains = 'failed; its failed title case is excluded'
        titleRun = 45352763316; titleJob = 138303038323; titleAttempt = 1
        titleArtifact = 14901192137; titleHarness = 'f5363ce8cb0160190b3e4f75a305b8f72fbb239f'
        reviewCommit = '9d8ab9fa0a979112d16faeaab7c24b64d570c6c3'
        reviewSha256 = '0fa679433d93aabea962a4e52841d623b399c0f47d392f01753c70f0770a17e4'
        reportSha256 = 'ea37236c2e1d25098d28c83c3d178214526e5fa2528c23958a2637c4a69eb58a'
        meaning = 'Same immutable signed installer/PE; no fresh Writer UI or screenshot claim from this job'
    }
    limits = @('Suite/Writer only, not standalone apps or all-platform release acceptance',
        'Existing documented font/format/layout limits remain', 'No application GUI or capture session started by this preflight')
}
function Require($condition, [string]$message) { if (-not $condition) { throw $message } }
function Hash([string]$path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Api([string]$endpoint) {
    $raw = & gh api "repos/OpenAEC-Foundation/open-office-studio/$endpoint"
    if ($LASTEXITCODE -ne 0) { throw "GitHub API failed: $endpoint" }
    return ($raw | ConvertFrom-Json -AsHashtable)
}
function PublicRelease {
    $r = Api 'releases/tags/v2026.48.1'
    Require ($r.id -eq 456623378 -and -not $r.draft -and -not $r.prerelease) 'Wrong public release'
    Require ($r.target_commitish -eq $commit) 'Release source changed'
    $a = @($r.assets | Where-Object name -CEQ $assetName)
    Require ($a.Count -eq 1) 'Exactly one canonical Suite EXE required'
    Require ($a[0].id -eq 786782581 -and $a[0].size -eq 384579648 -and
        $a[0].digest -ceq "sha256:$installerSha" -and $a[0].browser_download_url -ceq $publicUrl -and
        $a[0].state -ceq 'uploaded') 'Public asset identity changed'
    return @{ release = $r.id; publishedAt = $r.published_at; asset = $a[0] }
}
function Signed([string]$label, [string]$path) {
    $s = Get-AuthenticodeSignature -LiteralPath $path
    Require ($s.Status -eq 'Valid' -and $s.SignerCertificate -and $s.TimeStamperCertificate) "$label must be valid and timestamped"
    Require ($s.SignerCertificate.Thumbprint -ceq '6CA044A50E18DA34A53465F42D15F62BA48B9D85') "$label signer changed"
    $report.signatures += @{label=$label; status=$s.Status.ToString(); sha256=(Hash $path)
        signerThumbprint=$s.SignerCertificate.Thumbprint; timestampThumbprint=$s.TimeStamperCertificate.Thumbprint}
}
function RemoveOwnedDirectory([string]$path, [string]$leaf) {
    $resolved = [IO.Path]::GetFullPath($path)
    Require ($resolved -ceq [IO.Path]::GetFullPath((Join-Path $root $leaf))) 'Cleanup target outside owned exact directory'
    Require ($resolved.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) 'Cleanup target escaped evidence directory'
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
$oldAppData = $env:APPDATA; $oldLocalAppData = $env:LOCALAPPDATA
try {
    $tag = Api 'git/ref/tags/v2026.48.1'
    $object = $tag.object
    for ($i=0; $object.type -eq 'tag' -and $i -lt 4; $i++) { $object = (Api "git/tags/$($object.sha)").object }
    Require ($object.type -ceq 'commit' -and $object.sha -ceq $commit) 'Tag does not resolve to exact P5'
    $source = Api "git/commits/$commit"
    Require ($source.tree.sha -ceq $tree) 'P5 tree mismatch'
    $report.tagCommit = $object.sha; $report.tree = $source.tree.sha
    $report.before = PublicRelease
    $reviewPath = 'docs/tests/windows-final-native-20261124/review.json'
    $nativePath = 'docs/tests/windows-final-native-20261124/report.json'
    Require ((Hash $reviewPath) -ceq $report.reusedNativeEvidence.reviewSha256) 'Reviewed native proof bytes changed'
    Require ((Hash $nativePath) -ceq $report.reusedNativeEvidence.reportSha256) 'Raw native proof bytes changed'
    $native = Get-Content -Raw -LiteralPath $nativePath | ConvertFrom-Json -AsHashtable
    Require ($native.status -ceq 'passed' -and $native.identity.applicationCommit -ceq $commit -and
        $native.identity.applicationTree -ceq $tree -and $native.packageSha256 -ceq $installerSha -and
        $native.executableSha256 -ceq $peSha -and $native.payloadExecutableSha256 -ceq $peSha) 'Native evidence source/package/PE binding mismatch'
    $report.checks += 'Exact public tag/tree and prior native proof bytes bound'
    Invoke-WebRequest -Uri $publicUrl -OutFile $installer
    Require ((Get-Item -LiteralPath $installer).Length -eq 384579648 -and (Hash $installer) -ceq $installerSha) 'Actual public download bytes differ'
    $report.download = @{url=$publicUrl; bytes=384579648; sha256=(Hash $installer)}
    Signed 'actual published installer' $installer
    New-Item -ItemType Directory -Path $payload | Out-Null
    $seven = 'C:\Program Files\7-Zip\7z.exe'
    Require (Test-Path -LiteralPath $seven) 'Independent 7-Zip reader unavailable'
    & $seven e -y -r "-o$payload" $installer 'open-office-studio.exe' *> (Join-Path $root 'payload-extraction.log')
    Require ($LASTEXITCODE -eq 0) 'Independent NSIS extraction failed'
    $pe = Join-Path $payload 'open-office-studio.exe'
    Require ((Get-Item -LiteralPath $pe).Length -eq 88121248 -and (Hash $pe) -ceq $peSha) 'Independent payload bytes changed'
    $stream = [IO.File]::OpenRead($pe)
    try {
        $reader = [IO.BinaryReader]::new($stream)
        Require ($reader.ReadUInt16() -eq 0x5a4d) 'Missing MZ header'
        $stream.Position=0x3c; $offset=$reader.ReadUInt32()
        Require ($offset -ge 64 -and $offset + 26 -le $stream.Length) 'Invalid PE offset'
        $stream.Position=$offset
        Require ($reader.ReadUInt32() -eq 0x4550 -and $reader.ReadUInt16() -eq 0x8664) 'Not an x64 PE'
        $stream.Position=$offset+24
        Require ($reader.ReadUInt16() -eq 0x20b) 'Not PE32+'
    } finally { $stream.Dispose() }
    Signed 'independently extracted public payload' $pe
    $report.payload = @{bytes=88121248; sha256=(Hash $pe); architecture='x64 PE32+'}
    $env:APPDATA=Join-Path $root 'profile/Roaming'; $env:LOCALAPPDATA=Join-Path $root 'profile/Local'
    New-Item -ItemType Directory -Path $env:APPDATA,$env:LOCALAPPDATA | Out-Null
    $p=Start-Process -FilePath $installer -ArgumentList @('/S',"/D=$install") -Wait -PassThru -WindowStyle Hidden
    Require ($p.ExitCode -eq 0) 'Public installer failed'
    $exe=Join-Path $install 'open-office-studio.exe'
    $uninstaller=Join-Path $install 'uninstall.exe'
    Require ((Get-Item -LiteralPath $exe).Length -eq 88121248 -and (Hash $exe) -ceq $peSha) 'Installed PE differs from independently extracted public payload'
    $version=(Get-Item -LiteralPath $exe).VersionInfo.ProductVersion
    Require ($version -cin @('2026.48.1','2026.48.1.0')) 'Installed version mismatch'
    Signed 'installed published application' $exe
    Signed 'installed published uninstaller' $uninstaller
    $report.installed = @{bytes=88121248; sha256=(Hash $exe); productVersion=$version; installerExitCode=$p.ExitCode}
    $report.after = PublicRelease
    Require ($report.before.asset.updated_at -ceq $report.after.asset.updated_at) 'Public asset mutated during preflight'
    $report.checks += 'Actual public download == reviewed signed NSIS; independent x64 payload == installed PE'
    $report.checks += 'All four actual Authenticode signatures and timestamps valid; exact installed version'
    $report.status = 'passed'
} catch {
    $report.status='failed'; $report.error=$_.ToString(); throw
} finally {
    try {
        $uninstaller = Join-Path $install 'uninstall.exe'
        if (Test-Path -LiteralPath $uninstaller) {
            $p=Start-Process -FilePath $uninstaller -ArgumentList @('/S',"_?=$install") -Wait -PassThru -WindowStyle Hidden
            Require ($p.ExitCode -eq 0) 'Owned private uninstaller failed'
            $report.cleanup.uninstallerExitCode=$p.ExitCode
        }
        RemoveOwnedDirectory $install 'installed'
        RemoveOwnedDirectory $payload 'payload'
        RemoveOwnedDirectory (Join-Path $root 'profile') 'profile'
        $report.cleanup.privateInstallRemoved= -not (Test-Path -LiteralPath $install)
        $report.cleanup.extractedPayloadRemoved= -not (Test-Path -LiteralPath $payload)
        $report.cleanup.privateProfileRemoved= -not (Test-Path -LiteralPath (Join-Path $root 'profile'))
        if (Test-Path -LiteralPath $installer) { Remove-Item -LiteralPath $installer }
        $report.cleanup.downloadRemoved= -not (Test-Path -LiteralPath $installer)
    } catch {
        $report.status='failed'; $report.cleanup.error=$_.ToString(); Write-Error $_ -ErrorAction Continue
        $global:LASTEXITCODE=1
    }
    $env:APPDATA=$oldAppData; $env:LOCALAPPDATA=$oldLocalAppData
    $report.cleanup.environmentRestored=($env:APPDATA -ceq $oldAppData -and $env:LOCALAPPDATA -ceq $oldLocalAppData)
    $report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $root 'report.json') -Encoding utf8
    if ($report.status -ne 'passed') { exit 1 }
}
