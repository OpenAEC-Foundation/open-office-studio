# @openaec/voorbeeld

Zelfstandig React-voorbeeld voor DOCX, XLSX en PPTX, alleen-lezen en volledig
in de browser. Geen Office-shell, Tauri, accountgegevens of conversieserver
nodig. De host haalt de bron op met zijn bestaande rechten en geeft bytes
door. OLE-documenten (DOC/XLS/PPT), RTF en OpenDocument vragen expliciet om
conversie. Dit pakket voert die conversie niet uit.

## Aansluiten

De host heeft React 18 of 19 nodig. Kopieer tijdens diens build de statische
renderer naar een map op dezelfde oorsprong:

```js
import { kopieerVoorbeeldAssets } from '@openaec/voorbeeld/kopieer-assets';
await kopieerVoorbeeldAssets('public/openaec-voorbeeld');
```

```tsx
import { useMemo } from 'react';
import { KantoorVoorbeeld } from '@openaec/voorbeeld';

function Bijlage({ bijlage }) {
  // Houd deze bron stabiel totdat de bijlage of de gebruikerscontext wisselt.
  const bron = useMemo(() => ({
    bestandsnaam: bijlage.naam,
    grootte: bijlage.grootte,
    laad: async (signal) => {
      const antwoord = await fetch(bijlage.url, { signal, credentials: 'same-origin' });
      if (!antwoord.ok) throw new Error('Bijlage kon niet worden opgehaald.');
      return new Uint8Array(await antwoord.arrayBuffer());
    },
  }), [bijlage]);
  return <KantoorVoorbeeld bron={bron} assetBasis="/openaec-voorbeeld/" />;
}
```

Voor hosting onder een submap moet `assetBasis` die submap bevatten, bijvoorbeeld
`/y-next/openaec-voorbeeld/`. De gekopieerde assets gebruiken relatieve URL's.
De host-CSP moet het eigen frame toestaan (`frame-src 'self'`). Het frame heeft
eigen CSS, React en fontinstellingen, zodat het bestaande Office-editors of de
host niet wijzigt. Serveer `.wasm` als `application/wasm` en JavaScript als
JavaScript. Kopieer de complete map; cache bij voorkeur op pakketversie.

## Rechten, status en grenzen

- De host bepaalt welke bron opgehaald mag worden. Private bijlagen gebruiken
  dezelfde aanmeldsessie als het bestaande attachmentverkeer; dit pakket kent
  geen ERPNext-route, token, gebruikersnaam of anonieme proxy.
- `laad(signal)` wordt bij vervangen/verwijderen afgebroken. Een late bron
  wordt genegeerd. De oorspronkelijke buffer wordt nooit overgedragen of
  bewerkt; iedere renderer krijgt een eigen kopie.
- `onStatus` meldt `laden`, `gereed`, `conversie`, `onbekend`, `teGroot` of `fout`.
  De host kan naast de status zijn bestaande downloadknop laten staan.
- `maxBytes` is standaard 64 MiB. Ook de werkelijk ontvangen omvang wordt
  gecontroleerd. ZIP-metadata is begrensd op 20.000 delen en 256 MiB uitgepakt.
  `laadTimeoutMs` begrenst ophalen én eerste weergave (standaard 90 seconden).
- Een preview is geen sandbox voor vijandige programmacode. De statische
  renderer is vertrouwde code op de eigen oorsprong; documentinhoud wordt aan
  de engines gegeven en nooit als HTML in de host geïnjecteerd. Het frame mag
  niet downloaden, navigeren naar de bovenliggende pagina of pop-ups openen.
- De drie engines, WASM en fontbestanden worden pas na openen en herkenning
  van het document opgehaald. Neem de volledige assetmap niet op in de
  automatische precache van een mailpagina.
- Statusmeldingen en frametitel zijn via `teksten` te vertalen. Enginebediening
  gebruikt vooralsnog de ingebouwde standaardtaal.

## Ontwikkelen

Vanuit de Office-repository: `node scripts/bouw-voorbeeld.mjs`. De bekende
enginecorrecties worden bij het bouwen meegenomen; de distributie heeft geen
runtime-imports uit de Office-app. `npm pack` in deze map verpakt ook de
statische renderer, WASM, fonts en licenties. Publicatie naar een pakketregister
is een afzonderlijke stap.

## Bundel- en laadafspraken voor Y-next

De hostcomponent mag maximaal 8 KiB gzip toevoegen, buiten de reeds aanwezige
React-runtime. Het uitgepakte distributiepakket mag maximaal 128 MiB zijn;
`voorbeeld:build` weigert een overschrijding en schrijft `dist/bundel.json`.
Dat pakket bevat ook de grote CJK-fontbestanden, die alleen worden opgehaald
wanneer nodig. De opslagomvang is dus geen initiële maildownload.

Een gesloten voorbeeld haalt nul renderer-, WASM- en fontbestanden op.
Na inhoudsherkenning wordt uitsluitend de gekozen engine geladen. De
browserproef meet ook verkeer uit workers via de statische HTTP-server.
De drie referentiedocumenten mogen per eerste opening maximaal 40 MiB aan
ongecomprimeerde rendererassets ophalen. Bronbytes tellen apart mee met de
ingestelde bestandsgrens. Het bereikbare tijdsdoel op een rustige lokale
referentiemachine is 10 seconden tot `gereed`; dit is geen garantie voor
iedere computer of documentinhoud. De echte, instelbare laadtijdgrens van
90 seconden omvat ook een trage bron en een onbereikbaar frame. Een eerdere
bijlage mag na wisselen geen status of document meer terugplaatsen.

`voorbeeld:test` verpakt eerst een tarball en bouwt daarmee een losse host.
Deze test vraagt om Chromium (`CHROME_PAD` of een Playwright-cache) en npm
(`NPM_CLI` kan een alternatieve `npm-cli.js` aanwijzen). Er is geen Office-
server of Tauri-proces bij betrokken. CI bewaart tarball, status-/verkeers-
rapport en screenshots als controleerbaar bouwresultaat.
