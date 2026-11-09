# Ondersteuningsrapporten kopiëren en bewaren (#40)

Bronbasis: `main` op `f4a03889`. Windows x64, Node 24.22.1, Chromium via Playwright.

De rapportknop gebruikte rechtstreeks `navigator.clipboard.writeText`. In een
webview zonder die API veroorzaakte klikken een onbehandelde fout. De bestaande
Tauri-klembordkoppeling werd overgeslagen. Daarnaast bleef een oude kopieerfout
zichtbaar na het succesvol bewaren van het rapport als tekst.

## Herstel

De nieuwe `schrijfKlembordTekst` gebruikt op desktop de geïnstalleerde
clipboard-manager-module en buiten desktop de browser-API. Ontbrekende API's en
geweigerde toegang wijzen de promise af, zodat de rapportcomponent haar bestaande
vertaalde foutmelding kan tonen. Een geweigerde native opdracht valt niet terug
op een tweede browserroute. De desktopcapability verleent de benodigde
`clipboard-manager:allow-write-text` naast de bestaande leestoestemming.

Elke nieuwe kopieer- of bewaaractie wist de voorgaande status. Rapportinhoud,
bestandsnaam, Unicode en het UTF-8-tekstbestand blijven behouden. De bestaande
leesroute en de Spreadsheet- en Writer-klembordimplementaties zijn niet gewijzigd.

## Bewijs

`scripts/test-rapport-browser.mjs` opent een DOCX met onbekende XML-gegevens en
bedient de echte rapportknoppen in de productiefrontend. Zes gevallen omvatten
toegestane browsertoegang, geweigerde browsertoegang met tekstdownload, een
ontbrekende browser-API, desktop zonder browser-API, desktop met geweigerde
browser-API en een geweigerde native opdracht. De desktopgevallen gebruiken een
Tauri-IPC-stub en de daadwerkelijk geleverde JavaScript-plugin.

De oorspronkelijke productiebuild faalt op vijf van die zes gevallen. De nieuwe
build slaagt in alle zes, met correcte status en route, behoud van rapporttekst
en zonder `pageerror`-meldingen. Zie [de tegenproef](rapport-klembord-baseline-2026-11-09.json)
en [de nieuwe uitkomst](rapport-klembord-2026-11-09.json).

Acht nieuwe unitproeven controleren de schrijfroute en foutafhandeling. Een extra
IPC-proef controleert de exacte opdracht en tekst via de geleverde plugin. De acht
bestaande leesproeven blijven slagen. TypeScript en de Vite-productiebouw slagen.
De volledige Vitest-suite slaagt met 1.996 tests in 176 bestanden; tien bestaande
gevallen blijven overgeslagen.

Voor de browserproef: start de gebouwde frontend en voer
`node scripts/test-rapport-browser.mjs http://127.0.0.1:1453/` uit. Playwright en
Chromium zijn vereist; `OOS_PLAYWRIGHT_MODULE` kan een afzonderlijke installatie
aanwijzen. `--baseline` legt de uitkomst vast zonder bij bekende oude fouten te
stoppen.

## Begrenzing

Deze ronde bouwt en test geen nieuwe native binary en controleert het fysieke
systeemklembord niet. De IPC-opdracht, capabilityconfiguratie en foutafhandeling
zijn gecontroleerd. #40 blijft open voor de overige criteria rond importverlies,
formaatconversie en pakketbehoud. De gelijktijdige risicodetectiefix van een andere
chat in `pakketcontrole.ts` valt buiten deze branch.
