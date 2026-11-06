# Goedgekeurde studiobeeldmerken

De zes geselecteerde Store-afbeeldingen van 6 november 2026 staan ongewijzigd
onder `public/studios`. Bron-URL, goedgekeurde SHA-256 en issue staan per app
in [de studiocatalogus](../assets/studios.json). Dit zijn **512 × 512
raster-PNG's**, geen vectorbestanden. Grotere afgeleide iconen bevatten geen
extra brondetail. De kalenderachtige afbeelding voor Spreadsheet is de
daadwerkelijk gekozen bron van #167 en wordt niet vervangen door een ander ontwerp.

| App | Issue | Afgeleide platformiconen |
| --- | --- | --- |
| Office | #165 | `src-tauri/icons/office` |
| Writer | #166 | `src-tauri/icons/writer` |
| Spreadsheet | #167 | `src-tauri/icons/spreadsheet` |
| Presentation | #168 | `src-tauri/icons/presentation` |
| Notition | #169 | `src-tauri/icons/notition` |
| Email | #170 | `src-tauri/icons/email` |

De bedrijfsidentiteit van OpenAEC, eigen document-/bedrijfslogo's en de
afzonderlijke Database-identiteit worden niet vervangen. Namen, app-id's,
profielen, bestandstoewijzingen en updaterinstellingen blijven gelijk.

## Reproduceren en controleren

Installeer de afhankelijkheden met de vastgelegde lockfile en voer uit:

```sh
node scripts/maak-studio-iconen.mjs
node scripts/controleer-studio-iconen.mjs
```

Een afzonderlijke sleutel kan ook, bijvoorbeeld `writer`. Bij een andere
versie van het gereedschap moeten alle zes sets opnieuw worden gemaakt.
[Het iconenmanifest](../assets/studio-iconen.json) bewaart de versie en alle
afgeleide checksums. De generator weigert een bron die van de goedgekeurde
checksum afwijkt. Hij haalt geen afbeeldingen van het netwerk op.

De Tauri-CLI maakt de PNG-, ICO- en ICNS-bestanden. Daarna normaliseert het
script uitsluitend twee technische eigenschappen van de afgeleide bestanden:

- ICNS-records krijgen een vaste volgorde op type; hun inhoud blijft bytegelijk.
- De vier hoekpixels van PNG-/ICO-afbeeldingen krijgen alpha nul wanneer de
  resizer daar een waarde van 1 tot en met 8 heeft achtergelaten. RGB en alle
  andere pixels blijven gelijk. Een zichtbare hoek wordt geweigerd in plaats
  van weggeknipt. De zes bron-PNG's blijven volledig ongewijzigd.

Twee volledige herbouwrondes leveren dezelfde 120 platformbestanden en zes
favicons op. Onafhankelijke pixelcontrole van alle zes ruwe CLI-uitvoeren
vindt alleen de vier genoemde alphawijzigingen op 24 px; 32 en 48 px blijven
pixelgelijk. Alle PNG- en ICO-hoeken op die drie maten zijn volledig
transparant. De ICNS-bestanden zijn onafhankelijk geopend.

`kopieer-assets.mjs` controleert de bestanden vóór de frontendbouw. Verouderde
iconen, afwijkende favicons of een Office-configuratie die naar de vroegere
algemene iconen wijst, laten de bouw stoppen. Iedere variant krijgt eigen
icoonpaden; een generieke icoongeneratie in de oude hoofdmap overschrijft die
sets niet. Vite kiest titel en favicon vóór de eerste browserweergave; de
app gebruikt de bijbehorende bron in titelbalk, startscherm, module-ingangen
en het venster Over.

## Vrijgave

De bron- en herbouwcontrole is geen geïnstalleerde-appcontrole. #165–#170
blijven open totdat de nieuwe beelden ook in de werkelijke apps en de
normaal uitgebrachte installerbestanden zijn gecontroleerd. De bestaande
downloads 2026-W45.1 en 2026-W45.2 blijven behouden; deze ronde wordt voorbereid
voor 2026-W45.3.
