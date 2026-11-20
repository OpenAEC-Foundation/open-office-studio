# Release pipeline audit — 20 november 2026

Vastgelegd: 2026-11-20T13:55:08.256443+00:00. Alleen lezen; uitsluitend eigen genegeerde `.local`-rapporten geschreven. Geen gedeelde bestanden, productcode, workflow, tags, releases of main gewijzigd; geen GUI/opname of binaire downloads gestart.

## Besluit voor integratie

Buildrun [44747669364](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44747669364) bouwt `e92b93a607c1bc6b2e37b56273ccc5047498f9e6` (2026.47.1). Om13:53UTC was de versiecontrole geslaagd en waren drie platformjobs bezig. De ondertekeningsvoorcontrole slaagde, maar de eigenlijke ondertekende builds/verificaties waren nog niet uitgevoerd. `publiceren=false` staat een onondertekende proefrun toe. Dit rapport geeft geen publicatiegoedkeuring.

Brononderzoek: `771fd66e0e4bd612dba4f7b6e34b517f39d52e86`; het workflowblob is identiek op `e92b93a607c1bc6b2e37b56273ccc5047498f9e6`. De geteste I3-appbron is `7f126f4b8e5269a54388cf78c48c78d2acc0daa1`, tree `8bc608488760e48919d7fb4e72a42569175b52a4`. De acht wijzigingen op e92 betreffen uitsluitend versiebestanden; bestaande logische regressieresultaten kunnen waar geldig worden hergebruikt, maar bewijzen de nieuwe installerhandtekeningen en installatie niet.

## Apps en pakketten

| App | Programma | Vier verwachte pakketten |
|---|---|---|
| Open Office Studio | `open-office-studio` | Windows x64 NSIS, macOS ARM64 DMG, Linux x64 DEB + AppImage |
| Open Writer Studio | `open-writer-studio` | Windows x64 NSIS, macOS ARM64 DMG, Linux x64 DEB + AppImage |
| Open Spreadsheet Studio | `open-spreadsheet-studio` | Windows x64 NSIS, macOS ARM64 DMG, Linux x64 DEB + AppImage |
| Open Presentation Studio | `open-presentation-studio` | Windows x64 NSIS, macOS ARM64 DMG, Linux x64 DEB + AppImage |
| Open Email Studio | `open-email-studio` | Windows x64 NSIS, macOS ARM64 DMG, Linux x64 DEB + AppImage |
| Open Notition Studio | `open-notition-studio` | Windows x64 NSIS, macOS ARM64 DMG, Linux x64 DEB + AppImage |
| Open Database Studio | `open-database-studio` | Windows x64 NSIS, macOS ARM64 DMG, Linux x64 DEB + AppImage |

Totaal: **28 installers** en **14 Windows/Linux-pakketrapporten**. Geen belofte voor IntelMac, WindowsARM64 of LinuxARM64. De [GitHub-runnerdocumentatie](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) bevestigt de huidige architectuur van de gebruikte hosted runners. [Appdefinities](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/assets/studios.json#L1); [uitgavecontrole](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/scripts/controleer-uitgave.mjs#L14).

De metadata van de bestaande stabiele v2026.46.2 (cf65…) bevat alle28 verwachte bestandsnamen, elk groter dan1MB, en14 rapporten. GitHub-digests zijn aanwezig. Geen daarvan is door deze audit gedownload, onafhankelijk gehasht of als nieuwe2026.47.1 getest. De oude Office-download was veel kleiner dan de huidige runtimevariant; oude looptijden zijn indicatief.

## Bevindingen

### R1 — Version and source identity

Bewijscategorie: observed. Integration771 is still2026.46.2, already published fromcf65. Version-only commit e92 is2026.47.1 (8 files), same release workflow blob3c22538974c15f3f089ff36bacdcb69b95bbe9ee. Next tag and release returned404 at13:48:50UTC. Build and verify final artifacts from immutable e92 or replacement explicitly approved point; old I3 executable is not final installer proof.

Bronnen: [bron 1](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/scripts/weekversie.mjs#L25), [bron 2](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/versie.json#L2).

### R2 — Signing preflight

Bewijscategorie: observed configuration; current availability partly unknown. Repository secret metadata count0; organization secret names unavailable403. Current preflight success permits an unsigned manual build when publiceren=false; signed build and verification steps remain pending at13:53UTC. Historical signed gates succeeded but do not prove current credentials.

Advies, niet toegepast: For a future focused workflow change, check all applicable Azure credential/profile fields before building; include applicable Apple API key content/issuer/certificate fields and validate OpenPGP availability before a publishing run. Never display secret values. No patch applied.

Bronnen: [bron 1](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L69), [bron 2](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L78), [bron 3](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L168), [bron 4](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L417).

### R3 — Preparation before release tests

Bewijscategorie: static parity gap; not a reproduced build failure. Release workflow runs pnpm test and Cargo tests without the explicit office runtime preparation and pretest spelling WASM preparation found in desktop.yml. Later native build preparation is not evidence that earlier tests had those inputs. Current build result still pending.

Advies, niet toegepast: If addressed later, reuse the desktop runtime preparation before Rust tests and the spelling Rust/WASM checks before Vitest. Root owns workflow changes; no modification made and no assertion that current build must fail.

Bronnen: [bron 1](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L148), [bron 2](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L158), [bron 3](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/desktop.yml#L57), [bron 4](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/desktop.yml#L73), [bron 5](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/desktop.yml#L75).

### R4 — Publication permission and duplicate runs

Bewijscategorie: observed configuration. publiceren job runs only on a tag or publiceren=true, grants contents:write, and creates a draft prerelease targetingGITHUB_SHA. Creating that draft may create a missing tag. Current false dispatch is a build only. Branch and tag concurrency groups differ, so do not dispatch duplicate attempts for the same version. No main merge/tag/release action performed.

Advies, niet toegepast: Record one final source commit and reuse its artifacts; obtain explicit human approval for intended main/tag/release writes. No automatic stable release claim.

Bronnen: [bron 1](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L381), [bron 2](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L447).

### R5 — Updater not enabled

Bewijscategorie: observed configuration. Office public updater key and endpoints are empty; focused variants explicitly disable updater artifacts and clear configuration. Office latest.json is optional and skipped without signature files. Codesigning success alone does not enable auto-updates.

Advies, niet toegepast: State manual installation for this release. A later updater rollout requires a matching public/private pair and correctly configured endpoint; treat separately.

Bronnen: [bron 1](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/src-tauri/tauri.conf.json#L1), [bron 2](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/scripts/studio-config.mjs#L114), [bron 3](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/scripts/maak-latest-json.mjs#L1), [bron 4](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L107).

### R6 — Seven packages versus functional acceptance

Bewijscategorie: coverage boundary. Workflow targets7 apps and28 installers, with14 Windows/Linux package reports; Office bundled runtime probes do not demonstrate native GUI acceptance of every app. A successful build, signature check, or old package metadata is not a functional pass for final installers. Linux/macOS Writer limitations remain with integration; browser route needs its own exact-point result.

Advies, niet toegepast: Keep build, package integrity, native functional checks and supported browser checks separate per exact source point; reuse valid earlier logical results only where version-only changes do not invalidate them.

Bronnen: [bron 1](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/assets/studios.json#L1), [bron 2](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/scripts/controleer-uitgave.mjs#L14), [bron 3](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L351).

## Ondertekening: uitsluitend namen en beschikbaarheid

Repositorysecretlijst:0. Organisatiesecretmetadata:HTTP403, dus onbekend. Repo-adminrechten voor de huidige gebruiker bewijzen geen workflowtoegang tot organisatiesecrets. De log-API voor de drie lopende jobs gaf een fout; geen ruwe logs of waarden bewaard. Een groene beschikbaarheidsstap bewijst bij deze proefrun geen ondertekening.

- Windows Azure: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_CERTIFICATE_PROFILE_NAME`.
- macOS Apple: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_CONTENT`, `APPLE_TEAM_ID`.
- Linux/checksums OpenPGP: `OPENAEC_GPG_PRIVATE_KEY`, `OPENAEC_GPG_PASSPHRASE`.
- Optional Tauri updater: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Certificate password may legitimately be empty for an unprotected certificate; Apple team applicability depends on signing configuration. Key passwords depend on encryption. Do not declare all listed fields individually mandatory.

De Windows-gate test slechts drie namen; setup/ondertekening gebruikt ook profiel en authenticatievelden. Het Windows-script pint Microsoft.ArtifactSigning.Client1.0.146, controleert de downloadhash en gebruikt RFC3161/SHA256. De workflow verifieert installer, geïnstalleerde exe en uninstaller met timestamp/publisher. macOS controleert codesign, Gatekeeper en stapling voor alle apps. Linux ondertekent14 pakketten en checksums pas in de publicatiejob; deze build-only run voert die job niet uit. De publieke GPG-vingerafdruk is `13F6D414ADEE4ED4CD09AC60601D86C93C504D29`.

[Windows-script](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/scripts/windows-sign.ps1#L26), [Windows-verificatie](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L263), [macOS-verificatie](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L308), [Linux/signatures](https://github.com/OpenAEC-Foundation/open-office-studio/blob/771fd66e0e4bd612dba4f7b6e34b517f39d52e86/.github/workflows/release.yml#L417). [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/) en [updaterdocumentatie](https://v2.tauri.app/plugin/updater/) onderscheiden codeondertekening van updaterhandtekeningen.

## Historische doorlooptijd

| Run | Totaal | Linux build | Windows build | macOS build |
|---|---:|---:|---:|---:|
| [43329143298](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43329143298) | 50m16s | 39m29s | 48m00s | 39m32s |
| [43030810271](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43030810271) | 54m34s | 27m25s | 52m12s | 43m38s |
| [43021548128](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43021548128) | 54m03s | 43m48s | 41m28s | 41m01s |
| [42270333483](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42270333483) | 70m20s | 68m47s | 46m40s | 20m13s |
| [42262956453](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42262956453) | 39m27s | 26m44s | 37m54s | 35m28s |

Five earlier successful runs took39m27s to70m20s end-to-end, three recent50m16s/54m34s/54m03s. Larger current runtime payload can increase time. Run started14:49CET;15:50CET leaves61 minutes including packaging/manual checks and no assured retry margin.

## Vereist op het definitieve codepunt

- Freeze final approved version/source commit and preserve source-to-artifact mapping.
- All3 platform builds must finish; confirm selected signed Windows and signed/notarized Mac build branches and actual verification gates, not only availability steps.
- Verify all28 final installers and14 package reports from the same final commit; check actual hashes and package validation records.
- Verify Linux detached signatures and signed SHA256SUMS against public fingerprint13F6D414ADEE4ED4CD09AC60601D86C93C504D29; publication=false skips that publication job.
- Perform installation/start/primary document flow for applicable native packages; distinguish Office runtime probes from7-app GUI acceptance.
- Retain outstanding Linux/macOS Writer limits and browser-route results explicitly; do not relabel blocked/unperformed checks as pass.
- Obtain explicit human approval for intended publication/tag/main actions.

## Bewijs en begrenzing

API-metadata en tijdstippen staan in `release-pipeline-audit-2026-11-20/api-evidence.json`. Het runmoment staat in `current-run-preflight.json`. De19 bytegetrouwe bronbestanden en SHA256/blob/regelreferenties staan in `sources.json`; alle19 hashes zijn bij oplevering gecontroleerd. Het JSON-hoofdrapport bevat de volledige7-appmatrix,28 oude verwachte namen, bronidentiteiten en gerichte adviezen.

Dit is geen nieuwe functionele acceptatietest. Linux/macOS Writer-beperkingen en de echte browserroute blijven bij de centrale integratiechecklist; eerdere ontbrekende controles worden niet als geslaagd aangemerkt. Geen issue aangemaakt en geen bestaande issueclaim overgenomen.
