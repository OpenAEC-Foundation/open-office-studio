param([string]$ProjectMap = 'src-tauri')
$ErrorActionPreference = 'Stop'
cargo fetch --manifest-path "$ProjectMap/Cargo.toml" --locked --target x86_64-pc-windows-msvc
if ($LASTEXITCODE -ne 0) { throw 'Cargo-afhankelijkheden konden niet worden geladen.' }
$cargoMap = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE '.cargo' }
$lock = Get-Content "$ProjectMap/Cargo.lock" -Raw
$versie = [regex]::Match($lock, 'name = "webview2-com-sys"\s+version = "([^"]+)"').Groups[1].Value
if (-not $versie) { throw 'WebView2-versie ontbreekt in Cargo.lock.' }
$bronnen = @(Get-ChildItem (Join-Path $cargoMap 'registry/src') -Directory | ForEach-Object { Join-Path $_.FullName "webview2-com-sys-$versie/x64/WebView2Loader.dll" } | Where-Object { Test-Path $_ })
if ($bronnen.Count -ne 1) { throw 'De vastgelegde x64 WebView2Loader.dll is niet eenduidig gevonden.' }
New-Item -ItemType Directory -Force "$ProjectMap/resources" | Out-Null
Copy-Item $bronnen[0] "$ProjectMap/resources/WebView2Loader.dll" -Force
