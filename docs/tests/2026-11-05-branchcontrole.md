# Controle van resterende branches — 5 november 2026

Controle uitgevoerd tegen `main` op `acd32bc04fc6cf77d9d58f9a7b1c74698e2ead81`.
Daarna is de wijziging voor Engelstalige issues via PR #150 samengevoegd.
Deze controle verandert de bron van de gepubliceerde uitgave 2026-W45.1 niet.

## Al opgenomen

De volgende remote branches zijn volledig voorouder van `main`; er hoeft
geen code meer uit te worden samengevoegd:

- `codex/ifcx-office-voorstel`
- `codex/office-release-2026-45`
- `codex/tauri-issues`
- `feat/zelfstandige-studios`

Branches zijn bij deze controle niet verwijderd.

## Parallel traject

`codex/native-rust-office` en `codex/windows-dev-2026-11-03` bevatten werk aan
de parallelle Rust-interface. De laatste branch bevat onder meer de
Rust-WebView en de gedeelde documentwerker. Beide zijn buiten de samenvoeging
van de bestaande Tauri-suite gehouden. PR #116 blijft daarom open.

## Werk aan de bestaande suite

| Branch | Proefsamenvoeging | Bevinding |
| --- | --- | --- |
| `lo-rekenblad` | Zonder Git-conflict | Gegevensgereedschap en tekstkolommen; bevat nog een tijdelijke engineproef zonder inhoudelijke assertions. Nieuwe Laotiaanse vertalingen ontbreken. |
| `lo-sjablonen-pdf` | Zonder Git-conflict | PDF-uitbreiding; typefout in `src/export/pdf/pdfa-beveiliging.test.ts:190` bij `BufferSource`. Nieuwe Laotiaanse vertalingen ontbreken. |
| `lo-spelling` | Zonder Git-conflict | Gedeelde spellingbediening is nog niet volledig aangesloten: `useVeldSpelling` heeft geen aanroepende editor. Nieuwe Laotiaanse vertalingen ontbreken. |
| `lo-tekst` | Conflict in `src/editors.tsx` | Expliciet werk in uitvoering. Commitbeschrijving meldt een falende proef voor afzonderlijke kopteksten; de editorwijziging voegt een tijdelijke `window.__PROBE` toe. |
| `readme` | Drie conflicten | Conflicten in beide README-versies en het schermafbeeldingenoverzicht. Tekst bevat verouderde informatie, waaronder de claim dat de interface alleen Nederlands is. |
| `codex/bewaren-vensterindeling-2026-11-02` | Meerdere conflicten | Oude vensterindeling verwijdert of vervangt onderdelen die inmiddels verder zijn ontwikkeld, waaronder meldingen en venstertitels. Geen veilige rechtstreekse samenvoeging. |
| `promo-video` | Zonder Git-conflict | Opnamescripts en videoscènes, expliciet werk in uitvoering. Geen productbouw- of opnamevalidatie uitgevoerd; een conflictvrije merge bewijst geen werkende opname. |

De vier kandidaten zonder Git-conflict zijn dus niet automatisch gereed voor
opname. De bovenstaande afwijkingen moeten eerst worden hersteld en de
betreffende gebruikersroutes moeten daarna worden gecontroleerd.

## Uitgevoerde controles

- Remote branches opgehaald en per branch voorouderschap en aantallen
  achterlopende/eigen commits gecontroleerd.
- `git merge-tree --write-tree` voor de zeven niet-Rust-kandidaten hierboven.
- De branches `lo-rekenblad`, `lo-sjablonen-pdf` en `lo-spelling` samen lokaal
  samengevoegd in een afzonderlijke controlewerkboom; deze samenvoeging is
  niet naar de remote gepusht.
- Gerichte tests: twee bestanden, veertien geslaagde tests.
- Volledige testset van die combinatie: 145 bestanden; 144 geslaagd en één
  mislukt. Tests: 1.614 geslaagd, één mislukt en tien overgeslagen. De
  mislukking betreft 71 ontbrekende Laotiaanse vertaalsleutels.
- Typecontrole van die combinatie faalt op de hierboven genoemde PDF-test.

Deze resultaten beoordelen de bestaande branches, niet de inmiddels
gepubliceerde release. De release zelf heeft de volledige bouw- en
platformcontroles doorlopen.
