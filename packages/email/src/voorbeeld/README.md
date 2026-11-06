# Voorvertoning van bijlagen (`voorbeeld/`)

Uitbreidbaar raamwerk om bijlagen (en later andere bestanden in de
kantooromgeving) te tonen zonder ze te openen. Los van de mail-UI: alles wat
het nodig heeft is een `VoorbeeldBron`.

Voor hergebruik van echte DOCX-, XLSX- en PPTX-weergave buiten Office bestaat
nu het afzonderlijke [pakket `@openaec/voorbeeld`](../../../voorbeeld/README.md).
De [Y-next-aansluiting](../../../../docs/herbruikbare-kantoorvoorbeelden.md)
beschrijft de overdracht van bytes, statische assets en rechten. Dat pakket
heeft een eigen broncontract met `laad(signal)`; deze bestaande mailviewer en
zijn Office-bestandskaart worden daarmee niet automatisch vervangen.

## Gebruik

```tsx
import { BijlageVoorbeeld, maakBron } from "./voorbeeld";

const bronnen = bericht.bijlagen.map((b) =>
  maakBron(b, () => backend.bijlage(account.id, bericht.map, bericht.uid, b.index)),
);

<BijlageVoorbeeld
  bron={bronnen[i]}
  bijlagen={bronnen}            // ←/→ tussen alle bijlagen van het bericht
  sluit={() => zetVoorbeeld(null)}
  opslaan={(bron) => …}         // "Opslaan"
  openExtern={(bron) => …}      // "Openen met standaardprogramma"
  openInModule={(soort, naam, bytes) => …} // "tekst" | "rekenblad" | "presentatie" | "database"
  openLink={(url) => …}         // Markdown-links, na bevestiging
  weergave="modaal"             // of "paneel"
/>
```

`maakBron` cachet `bytes()`, zodat wisselen tussen bijlagen niet opnieuw
downloadt. Toetsen: Esc sluit, ←/→ wisselt, +/−/0 zoomt, R draait (afbeelding).

## Opbouw

| Bestand | Rol |
| --- | --- |
| `contract.ts` | `VoorbeeldBron`, `Voorbeeldsoort`, `Weergever`, register, `LIMIETEN`, `maakBron` |
| `herkenning.ts` | soort op extensie, MIME-type en magische bytes; inhoud wint, met waarschuwing |
| `codering.ts` | UTF-8 (± BOM), UTF-16 (BOM), anders Windows-1252 |
| `pdf-meta.ts` | versie, pagina's, Info-dictionary, versleuteling (ook objectstromen) |
| `cad-meta.ts` | DWG-versietabel + ingebed miniatuur; DXF: `$ACADVER`, `$INSUNITS`, entiteiten, lagen |
| `ifc-meta.ts` + `ifc-worker.ts` | streamende STEP-lezer: kop, telling per type, project/terrein/gebouw/verdieping |
| `afbeelding-meta.ts` | afmetingen uit de kop, EXIF-oriëntatie, limieten |
| `platform.ts` | webviewherkenning (WebKitGTK krijgt geen PDF-iframe) |
| `weergevers/*` | de ingebouwde weergevers (prioriteit 0) |
| `BijlageVoorbeeld.tsx` | venster/paneel, navigatie, toetsen, focusbeheer |

## Een weergever aanmelden

```ts
import { registreerWeergever } from "./voorbeeld";

const afmelden = registreerWeergever({
  naam: "dwg-rust",
  soort: "dwg",
  prioriteit: 100,               // ingebouwde weergevers hebben 0
  kan: (bron, herkenning) => isDesktop() && bron.grootte < 500 * 1024 * 1024,
  Component: DwgRustWeergever,   // krijgt WeergeverProps
});
```

`kiesWeergever` neemt per soort de hoogste prioriteit waarvan `kan()` waar is
(een `kan()` die een fout gooit wordt overgeslagen); niets gevonden → de
weergever voor `onbekend`. De rest van de code hoeft niet te wijzigen.

## Aansluitpunt voor de Rust-viewers (nog niet gebouwd)

De JS-weergevers voor PDF, DWG/DXF en IFC zijn tijdelijk. De definitieve
viewers komen in Rust, als Tauri-opdracht (desktop) of WASM (browser). Ze
melden zich aan met prioriteit ≥ 100 en hun `Component` roept de opdracht aan.
Verwachte opdrachten (namen zijn een voorstel; invoer altijd de bytes van de
bijlage, of een pad naar een tijdelijk bestand voor grote bestanden):

| Opdracht | Invoer | Uitvoer |
| --- | --- | --- |
| `voorbeeld_pdf_info` | `{ bytes }` | `{ paginas, titel?, auteur?, versleuteld, paginaformaten: [{ breedte, hoogte }] }` |
| `voorbeeld_pdf_render` | `{ bytes, pagina, schaal, wachtwoord? }` | PNG-bytes van één pagina (lui per pagina, met cache) |
| `voorbeeld_dwg_render` | `{ bytes, breedte, hoogte, layout?: string }` | `{ svg }` of PNG-bytes + `{ lagen: string[], layouts: string[], eenheid }` |
| `voorbeeld_dxf_render` | idem als DWG | idem als DWG |
| `voorbeeld_ifc_model` | `{ bytes }` | `{ meshes: [{ id, type, vertices: Float32Array, indices: Uint32Array, kleur }], structuur }` voor een WebGL-weergave; `structuur` = project → terreinen → gebouwen → verdiepingen |
| `voorbeeld_ifc_eigenschappen` | `{ bytes, globalId }` | eigenschapssets van één element |

Afspraken:

- **Grote bestanden**: geef bij voorkeur een pad door (`{ pad }`) in plaats
  van bytes over IPC; de mail-backend kan de bijlage daarvoor in een tijdelijke
  map zetten.
- **Annuleren**: lange opdrachten krijgen een `taakId` en een
  `voorbeeld_annuleer({ taakId })`; voortgang via een Tauri-event
  `voorbeeld://voortgang` met `{ taakId, fractie }`.
- **Veiligheid**: de Rust-kant geeft nooit HTML terug. SVG-uitvoer wordt als
  `<img>` met een blob-URL (`image/svg+xml`) getoond, nooit inline.
- **Terugval**: als de opdracht niet bestaat of faalt, toont de weergever de
  bestaande metadatakaart (die blijft in deze map bestaan).

### PDF

Nu: de ingebouwde PDF-weergave van de webview in een `<iframe>` met een
blob-URL (alleen Chromium/WebView2, WKWebView en Firefox, en alleen als de
inhoud aantoonbaar `%PDF-` is). Op WebKitGTK (Linux-desktop) een kaart met
pagina's/titel/auteur uit de eigen parser. Bewust geen pdf.js of andere nieuwe
afhankelijkheid: de definitieve PDF-weergave komt via de Rust-route
(`voorbeeld_pdf_render`). Het PDF-iframe kan geen `sandbox` krijgen
(Chromium weigert de PDF-viewer dan); daarom alleen met type
`application/pdf` en geverifieerde inhoud.

## Veiligheid

- Niets van een bijlage gaat als HTML de hoofd-DOM in: tekst als tekstknoop,
  Markdown zonder rauwe HTML (`skipHtml`, geen rehype-raw), SVG alleen als `<img>`.
- Alle blob-URL's worden ingetrokken als het onderdeel verdwijnt of wisselt.
- Markdown: alleen `http(s)`/`mailto` klikbaar, pas na bevestiging; externe
  afbeeldingen standaard geblokkeerd.
- De inhoud bepaalt de soort; een misleidende extensie geeft een waarschuwing.
  Onbekende bestanden krijgen geen knop "Openen met standaardprogramma".
- Limieten (`LIMIETEN`): afbeelding 40 MB / 100 megapixel, tekst en Markdown
  2 MB getoond, DXF 64 MB ontleed, IFC 200 MB (in een Web Worker, annuleerbaar).
