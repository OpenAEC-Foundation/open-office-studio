# Open Office Studio en de OpenAEC SuperCloud

Hoe Open Office Studio documenten uit de SuperCloud opent en weer opslaat. Afgestemd met de SuperCloud-sessie op 2026-10-29. Het werkplek-deel is een **voorstel** dat nog getoetst moet worden aan `openaec-supercloud/docs/apps-harmoniseren.md` en `openaec-bench/docs/werkplek.md`.

## Desktop: via de sync-client

De sync-client `openaec-cloud-desktop` zet de bestanden in een gewone lokale map. Office Studio opent ze daar, en Ctrl+S schrijft terug. De sync-client uploadt het resultaat als nieuwe versie. Hiervoor is geen SuperCloud-code nodig.

- Opslaan gaat atomair via een tijdelijk bestand `.~oos-XXXXXX.tmp` in dezelfde map (`src-tauri/src/main.rs`, `schrijf_atomair`). De sync-client slaat `*.tmp` over. Pas de rename naar de echte naam wordt een nieuwe versie.
- Later eventueel: automatisch vergrendelen via de Storage-API (`vergrendel`/`ontgrendel`). Daarvoor is een eigen OAuth-client voor de studio's nodig.

## Web: de werkplek

De SuperCloud laadt de gehoste bouw (`pnpm build:hosted`, uitvoer `dist-hosted/`) als statische bundel onder `/werkplek/app/office/`. Dat gebeurt in een iframe met een opaque sandbox (`sandbox="allow-scripts …"` zonder `allow-same-origin`).

- De app krijgt nooit een token en doet geen eigen netwerkverkeer: alles zit in de bundel. `scripts/controleer-hosted.mjs` controleert dat.
- De gehoste bouw zet `VITE_OPENAEC_HOST=werkplek` (`.env.hosted`). Een gewone bouw doet hetzelfde met `?host=werkplek` in de URL.
- **De server moet de bundel leveren met `Access-Control-Allow-Origin: *`.** Vanuit een opaque oorsprong laadt de browser modulescripts, workers en WASM alleen met CORS. Workers starten daar via een data-URL (`src/startWorker.ts`).

### Hostcontract in de app

`window.openaecHost` (`src/host.ts`):

```ts
interface OfficeHost {
  save(naam: string, bytes: Uint8Array, basisVersie?: number): Promise<{ naam?; versie?; conflict? } | void>;
  open?(): Promise<{ naam; bytes; versie?; alleenLezen? } | null>;
  saveAs?(naam: string, bytes: Uint8Array): Promise<{ naam?; versie?; conflict? } | void>;
  melding?(soort: "info" | "waarschuwing" | "fout", tekst: string): void;
}
```

Een gastomgeving kan dit object zelf zetten. In de werkplek zet `src/werkplek.ts` het als adapter op postMessage.

### Berichten (postMessage)

Alle berichten hebben `kanaal: "openaec-werkplek"`. Verzoeken van de app hebben een oplopend `id`, en het antwoord van de host noemt hetzelfde `id`. Het antwoord heeft `ok: true` met de velden hieronder, of `ok: false, fout: "<tekst of code>"`. De app accepteert alleen berichten van `window.parent`.

| Van app | Antwoord van host | Wachttijd |
|---|---|---|
| `{ type: "hallo", app: "office", versie }` | `{ ok: true }` (mag ontbreken) | 5 s |
| `{ type: "bestand.open" }` | `{ ok: true, naam, mime, versie, bytes: ArrayBuffer, alleen_lezen }` of `{ ok: true, bestand: null }` | 60 s |
| `{ type: "bestand.bewaar", naam, bytes: ArrayBuffer, basis_versie }` | `{ ok: true, naam, versie, conflict }` | 180 s |
| `{ type: "bestand.bewaar_als", naam, bytes: ArrayBuffer }` | `{ ok: true, bestand, naam, versie }` | 180 s |
| `{ type: "melding", soort, tekst }` | geen | — |

- De bytes gaan als overdraagbare `ArrayBuffer` mee, in beide richtingen.
- `basis_versie` is de `huidige_versie` uit Storage. De host doet `upload_start(…, basis_versie)` → PUT van de delen → `upload_klaar`, en geeft `conflict` en de nieuwe naam terug. Bij een conflict maakt Storage een conflictkopie. De app meldt dat en bewaart de volgende keer in de kopie.
- Foutcodes van Storage, zoals `quotum_ruimte_vol` en `quotum_pool_vol`, mogen als `fout` terugkomen. De app toont ze.

### Gedrag in de app

- Bij de start vraagt de app `bestand.open`. Het document opent via de gewone openroute (docx/xlsx/pptx, md, mdb/accdb), met de versie onthouden.
- Ctrl+S op dat document gaat direct naar `bestand.bewaar` met de basisversie, zonder venster Opslaan als.
- Opslaan als met een nieuwe naam gaat naar `bestand.bewaar_als`.
- Alleen-lezen: de app meldt dat. Opslaan stuurt toch `bestand.bewaar`, en de host maakt dan een conflictkopie.

### Assistent: `window.__OPDS_APP__`

De AI-assistent van de SuperCloud bedient het open document via de brug van de werkplek (`werkplek-brug.js` in openaec-bench), die `window.__OPDS_APP__.run(naam, argumenten)` in het frame aanroept. Hetzelfde contract als Open Planner, Calc en PDF Studio (zie `supercloud-koppeling.md` in OpenAEC-Blueprint):

```ts
window.__OPDS_APP__ = {
  tools(): string[];                                   // de namen, alle met voorvoegsel office_
  definitions(): Promise<{ name; description; inputSchema }[]>;
  run(naam: string, argumenten?: object): Promise<JSON>; // een fout is Error("code: korte uitleg")
};
```

Alleen in de browserbouw (niet onder Tauri); `src/assistent/appTools.ts` zet het in `main.tsx`. De tools werken op het document in het zichtbare tabblad (`src/assistent/actieveEditor.ts`), via de versie-gecontroleerde engine-API's (`readParagraphs`/`readCells`/`readContent` en `applyEdits`), niet via de DOM. Geen netwerk en geen extra `postMessage`.

| Tool | Soort | Wat |
|---|---|---|
| `office_stand` | alle | naam, soort, alleen-lezen, pagina's/alinea's, bladen of dia's, selectie |
| `office_tekst_lezen` | docx | alinea's met nummer, tekst, stijl, kopniveau (`vanaf`, `aantal`) |
| `office_tekst_invoegen` | docx | regels als nieuwe alinea's na alinea `na` (0 = vooraan) |
| `office_tekst_vervangen` | docx | `zoek`/`door` (optioneel `alles`), of `alinea` + `tekst` |
| `office_cellen_lezen` | xlsx | getoonde tekst plus formules van een bereik (standaard het gebruikte deel), hooguit 2000 cellen |
| `office_cellen_zetten` | xlsx | waarden vanaf `cel`; `=…` is een formule, `null` maakt leeg |
| `office_dias_lezen` | pptx | tekst per dia per tekstvak, met notities |
| `office_dia_tekst` | pptx | tekst van vak `vak` op dia `dia`, of `zoek`/`door` op die dia |
| `office_dia_toevoegen` | pptx | nieuwe dia na `na` met de indeling van die dia; `teksten` vult de vakken (zo nodig nieuwe tekstvakken) |
| `office_undo` | alle | laatste bewerking ongedaan maken |

Elke bewerking is één ongedaan-stap, behalve `office_dia_toevoegen` met teksten (twee; het antwoord noemt `ongedaanStappen`). Foutcodes: `geen_document`, `verkeerde_soort`, `niet_gereed`, `alleen_lezen`, `ongeldig_argument`, `onbekende_tool`, `onbekend_blad`, `buiten_bereik`, `niet_gevonden`, `te_groot`, en de codes van de engine (`stale_version`, `locked_target`, …). Bekende beperking: de presentatie-engine haalt geen alinea's weg; schrijf je minder regels in een vak dan het alinea's heeft, dan blijven de overige leeg.

### Nog te bouwen aan SuperCloud-kant

Nog niet toegezegd; de beslissing ligt bij Jan-Adriaan:

- de berichten `bestand.open`, `bestand.bewaar` en `bestand.bewaar_als` in `openaec-werkplek`;
- "Openen met" in `/opslag`, met de MIME-types hieronder;
- CORS-kop op de bundel;
- eventueel een OAuth-client voor de studio's (desktop-vergrendeling).

| Extensie | MIME |
|---|---|
| docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |
| pptx | application/vnd.openxmlformats-officedocument.presentationml.presentation |
| md | text/markdown |
| mdb | application/x-msaccess |
| accdb | application/msaccess |

## Proef

Een nagebootste werkplekpagina laadt `dist-hosted` in een opaque sandbox, met CORS-kop en onder `/werkplek/app/office/`. Uitkomst van de proef van 2026-10-29:

- het document opent (versie 4);
- Ctrl+S bewaart met basisversie 4 en daarna 5;
- een conflict geeft de melding, en de volgende opslag gaat naar de conflictkopie met versie 1;
- de spellingcontrole werkt via de data-URL-worker.
