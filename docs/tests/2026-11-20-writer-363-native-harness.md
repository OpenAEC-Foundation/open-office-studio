# #363 — externe native sessiemodule

`scripts/proef-writer-363-native-labels.mjs` is een afzonderlijk harness voor de centrale Linux-caller. Het verandert geen applicatiebron en vereist geen nieuwe appbuild. Het frontendbewijs blijft bron23394 / bewijsfdaf; de centrale integratiebron wordt afzonderlijk door de caller aangeleverd.

```js
import { runWriter363NativeLabels } from "./proef-writer-363-native-labels.mjs";

const result = await runWriter363NativeLabels({
  endpoint: "http://127.0.0.1:4444",
  sessionId: existingSessionId,
  outDir: dedicatedProofDirectory,
  source: { commit, tree, packageSha256, executableSha256 },
  ownedProfile: true,
  signal: AbortSignal.timeout(60000),
});
// The caller must explicitly require result.status === "passed".
```

De caller bezit een bestaande geïnstalleerde Linux-app, een eigen profiel en een bestaande W3C-sessie en verifieert zelf de bron, het pakket, de PID en de geïnstalleerde executable. De module eist Linux, `ownedProfile === true`, volledige Git-SHA's en pakket-/executable-SHA-256, een loopback-HTTP(S)-endpoint en echte zichtbare Writer-DOM met het native Tauri-object zonder bekende diagnostic/editorbridges. Aangeleverde bron- en pakketidentiteit worden expliciet als **delegatedProvenance** bewaard, zonder zelfstandige OS-/pakketverificatie te claimen. `browserOnly` wordt pas `false` na deze gate. Een onbereikbare of ongeschikte sessie levert `failed`; een niet-ondersteunde actuele UI-taal levert `skipped`, nooit `passed`.

De module leest de huidige EN/NL-taal en het vorige zichtbare ribbon-tabblad, activeert Stijlen via echte W3C-viewport-pointeracties en leest groepsnaam, vijf beheerknoppen, ARIA-namen, tooltips, disabled- en zichtbaarheidsstatus. Naaminterpolatie moet dezelfde bestaande stijl gebruiken. Verborgen gemounte documenten/lints worden uitgesloten. De module injecteert geen taal, roept geen editorbridge/model aan en klikt geen stijlactie. Bij een ingeklapte/onzichtbare of geblokkeerde control faalt hij eerlijk; hij wijzigt hiervoor geen layout of vensterinstellingen.

Het resultaat wordt bewaard als `writer363-native-labels.json`; bij geslaagde labelcontroles wordt een W3C-native screenshot `writer363-native-labels.png` met SHA-256 toegevoegd. De module probeert in `finally` inputacties vrij te geven en het oorspronkelijke tabblad via dezelfde native pointer te herstellen. Cleanup heeft eigen korte deadlines, ook als de caller annuleert. Oorspronkelijke fouten en cleanupfouten blijven behouden en elke cleanupfout maakt de proef `failed`. Een fout bij rapportopslag wordt uitgeworpen met de beschikbare feiten in `error.probeReport`. De module maakt of verwijdert geen sessie, start of sluit geen applicatie en beëindigt geen opname; dit blijft de taak van de caller.

Gerichte contractcontrole op Windows: **24 tests geslaagd**, plus syntaxis-/Prettiercontrole. De tests gebruiken een expliciet synthetische loopback-W3C-server en een gemockte Linux-hostfunctie, zonder browser of native GUI. Ze dekken EN/NL, unsupported-taal, host/profiel/endpoint/provenance/DOM-gates, verborgen extra lints, pointerblokkade en gedeeltelijke uitvoering, ontbrekende labels/tooltips/interpolatie, screenshotfout, herstel-/releasefouten, annulering en rapportopslag. **Dit is geen native Linux-acceptatiebewijs.** De echte native run en platformvergelijking blijven centraal op het vastgelegde applicatiepunt.
