# PR #349 — Linux-paginabeeld, 16 november 2026

Dit onderzoek vergelijkt native Writer-paginabeeld met opgeslagen documentdata. Een geslaagde toetsenbord-/opslagproef is geen visuele acceptatie. Er is geen applicatiecode aangepast en niets naar `main` samengevoegd.

Afgebakende vervolgmelding: [#355](https://github.com/OpenAEC-Foundation/open-office-studio/issues/355). Open en gesloten mogelijke duplicaten zijn inhoudelijk vergeleken; dit is een apart probleem van de Linux/Xvfb-validatie, geen uitbreiding of afhandeling van #327.

## Vastgelegde herkomst

- Applicatie **e1f84f84f4d72e5ce8ab967e376a6f38344edf39** (F), tree **2e6123201cd3a357ac3b2df8126fa15760fce865**. De applicatie-inputs zijn bytegelijk aan PR #349-head **cb99e79ed2e1c9468f24bf69903572b6dc29ad82**; F bevat daarnaast integratie-/bewijsbestanden.
- Alle onderstaande paintproeven installeren hetzelfde oorspronkelijke DEB uit [build 43838167666](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43838167666), zonder herbouw: SHA256 **14d588cdfcebc6e50607033a324c3e6c37a77f440a5aebd36b5a6356d4ea3eb5**.
- De uitgepakte én geïnstalleerde executable hebben SHA256 **170a7caaf7a9e44ef8616becc5a3492bace4d78d14f0ac081d2e011a9b6e8b85**.
- Paint-harness **3a66aecb056ab563db86c252d4b9b7045851ecc9**, op een eigen diagnostische branch. Ubuntu 22.04 / Xvfb / `GDK_BACKEND=x11` / `LIBGL_ALWAYS_SOFTWARE=1`; Node 22.23.4, tauri-driver 2.1.0, WebKitGTK en WebKitWebDriver **2.50.4-0ubuntu0.22.04.1**. Driver-SHA256 **a71b247ca519f3ed02a364cd8692d71d381ffe81279c94c6ed65ec300d217868**.
- Elk rapport bewaart applicatiepunt, harnesspunt/-hash, pakket-/payloadhash, runtime, procesidentiteit, tijdstippen en opnamevolgorde afzonderlijk.

## Meetwijze

Werkelijke geïnstalleerde app, native toetsenbordbediening en echte backendopslag. Na openen, typen en Ctrl+S wordt het app-proces volledig afgesloten; een nieuw proces heropent dezelfde opgeslagen DOCX en vindt de marker via de zichtbare zoekfunctie. Het document bevat exact `NATIVE_LINUX_SAVED_MARKER Synthetic native Linux document.`. Paginavoorkeuren wijzigen de opgeslagen bytes niet.

In het eerste harness per meetpunt: WebDriver-screenshot → X11-rootbuffer (`import -window root`) → tweede WebDriver-screenshot. DOM-/CSS-uitlezing gebeurt pas daarna. Daarmee wordt een latere paint tussen twee opnames niet automatisch aan de opnamemethode toegeschreven. De Xvfb-root is 1280×1024 en het appvenster 1440×950; de onderzochte tekstregio ligt volledig binnen beide. Dit certificeert niet de buiten beeld vallende rechterstrook.

Opnames worden herhaald na `document.fonts.ready` plus twee animatieframes en na verdere wachttijd, tot ruim 16 seconden na de eerste opname. Dit wacht op het fontset van het document, niet rechtstreeks op een intern SDK-workerfontset. In het eerste harness volgt daarna pas canvasreadback en de echte View → Dark page-voorkeur, gevolgd door herstel. OffscreenCanvas-placeholderreadback levert in de baseline lege bestanden op, ook wanneer tekst zichtbaar is; deze bestanden zijn **geen bruikbaar bewijs van de canvasinhoud**.

## Eerste baseline

[43845558754](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43845558754), artifact **14214737564**, ZIP-SHA256 **0c9ef91127dc397787431cfc187a8fb1cd9449db7e40544da4a75f26e060a8d5**:

- De vier native data-/proceschecks slagen; appcleanup bevestigd. Onafhankelijke DOCX-uitlezing bevestigt de exacte tekst. Opgeslagen SHA256 **e866533a78e592f5a56e91c791262c17f232aa9c92c1f1cd671462fd0c7ece34**.
- De pagina na opslaan is leesbaar in beide opnameroutes. De pagina na heropenen is in alle opnames leeg grijs met een geel zoekhighlight. Dit blijft zo na fonts/frames en ruim 16 seconden rust. De Find-lijst toont de juiste tekst en één resultaat.
- Dark page uitschakelen maakt de lege pagina zwart, terugschakelen weer grijs; de glyphs keren niet terug. Op de leesbare opgeslagen pagina werkt dezelfde voorkeur wel normaal (donkere of witte pagina met contrasterende tekst). Alleen het CSS-filter verwijderen herstelt de fout dus niet.
- De tekstregio is na heropenen bij alle drie de opnames per getimed meetpunt gelijk: vijf RGB-kleuren, geen donkere tekstpixels, dominante achtergrond `(229,229,229)`. In papierstand is de dominante achtergrond zwart. Opgeslagen tekst en stijlen zijn niet veranderd door de diagnose.

Na de eerste WebDriver-opname is de leegte ook zichtbaar in de X11-buffer: een puur verschil tussen de twee exportformaten verklaart het niet. Omdat de eerste screenshot in deze versie steeds via WebDriver ging, is een effect van die snapshot op het schermbeeld hiermee nog niet uitgesloten. De CSS-inversie verklaart de grijze kleur van een zwart beeldvlak; zij bewijst niet waarom dat vlak zwart is. Gewoon langer wachten op documentfonts/paintframes en de paginakleurvoorkeur omschakelen herstellen het beeld niet.

## Renderpad-tegenproeven en aangepaste meetvolgorde

Het eerste harness is ook gebruikt met uitsluitend een extra child-procesvariabele:

| Modus | Run / artifact / ZIP-SHA256 | Uitkomst |
| --- | --- | --- |
| `WEBKIT_DISABLE_DMABUF_RENDERER=1` | [43846600054](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43846600054), 14216410007, `21eee5d993a77c1db4b39de012d8689ba3538959205797eb5e7b400583df5930` | Openen en opslaan slagen, opgeslagen pagina leesbaar; latere View-click timeout, daarna app-exitcheck mislukt. Geen heropenfase. |
| `WEBKIT_DISABLE_COMPOSITING_MODE=1` | [43846640690](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43846640690), 14215074111, `096a34bef1e9ea30a5d3b536ccd12c8f5bf3dba98fd41713d1efb9cccea9b114` | Dezelfde beperking: geen geldige heropenvergelijking. |

Beide runs bewaren de fout en eindigen als mislukt, met uiteindelijke eigen procescleanup wel bevestigd. De fout treedt na canvasreadback op; daarmee is die readback niet als oorzaak bewezen. Er volgt geen productfix of succesclaim uit deze twee onvolledige proeven.

Harness **678e06e06c4a993263a39d7c214292c9bb96ad1e** verandert uitsluitend de meetmethode: in iedere verse opgeslagen/heropende fase eerst **X11 → WebDriver → X11 → WebDriver**, vóór de gebruikelijke aparte opgeslagen-/heropend-screenshot. Canvasreadback en View-toggles zijn verwijderd. Baseline en beide graphicsmodi gebruiken onderling exact ditzelfde harness en hetzelfde F-pakket.

| Modus | Run / artifact / geverifieerde ZIP-SHA256 | Data/proces | Paginabeeld saved / reopened |
| --- | --- | --- | --- |
| Baseline | [43847299219](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43847299219), 14216705176, `8f6cd621402f2b8373fd1b7a99c9e1d04c8b7d4b2ff0a5f903bfaaa1ec5763fc` | Alle vier checks slagen | Leeg / leeg, al in eerste X11 vóór WebDriver; na >17s nog leeg |
| Alleen DMABUF uit | [43847314987](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43847314987), 14216880248, `fe0e200f3815dd9d72cd895ac7781fb8628cd3ccb17ad8dfda3c3904cddd73d5` | Alle vier checks slagen | Leesbaar / leesbaar, vanaf eerste X11 en in alle latere opnames |
| Alleen compositing uit | [43847320011](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43847320011), 14216700570, `ec661daa4d65a82374ea6c65e53c06e08776606ee0c03320338c0150c14dd091` | Alle vier checks slagen | Leesbaar / leesbaar, vanaf eerste X11 en in alle latere opnames |
| Baseline herhaald | [43847848206](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43847848206), 14214824873, `b088125eefa9a9efbb97b5150c15cb50fc1329903ec4b647fe0d9d899d444e86` | Alle vier checks slagen | Opnieuw leeg / leeg, ook eerste X11 en na rust |
| Alleen DMABUF uit herhaald | [43847853040](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43847853040), 14215144055, `f18a2e874ce195f5c24a50003b5beba726895fa33c1f16178429542fccbb6e14` | Alle vier checks slagen | Opnieuw leesbaar / leesbaar, inclusief eerste X11 en na rust |

Onafhankelijke DOCX-controle vindt in alle drie exact de verwachte tekst en de gerapporteerde opgeslagen hash. De oorspronkelijke pakket-, executable- en driverhashes komen overeen. Alle eigen app-processen zijn afgesloten. Alle gedownloade artifact-ZIP's zijn lokaal gehasht en komen overeen met de Actions-digest.

De eerste X11-baseline sluit een door de eerste WebDriver-screenshot veroorzaakte initiële leegte uit in deze proef. De heropende baseline-tekstregio heeft na rust vijf kleuren zonder glyphcontrast; beide alternatieve renderpaden tonen daar 315 kleuren, donkere pagina, contrasterende tekst en zoekhighlight. Niet alleen de documentdata, maar ook de leesbare native pixels zijn bij die alternatieven gecontroleerd.

Dit wijst naar de versnelde WebKitGTK/DMABUF-renderroute in deze Xvfb/software-omgeving. Het is geen lokalisatie tot één WebKit- of SDK-functie en geen bewijs van een algemeen probleem op fysieke Linux-computers. [Tauri documenteert deze twee Linux-graphicsopties](https://tauri.app/develop/debug/linux-graphics/); een globale productoverride zou ook gebruikers met een werkende snelle renderroute treffen. Daarom blijft het voorstel beperkt tot de disposable CI-nativecontrole.

De twee X11-first-baselines tonen ieder lege saved én reopened pagina's. De twee DMABUF-tegenproeven tonen ieder leesbare saved én reopened pagina's, met identieke heropende tekstregiometrics in alle capturevarianten. De compositing-tegenproef ondersteunt dezelfde renderroute-verklaring. Dit is voldoende onderscheid voor een **CI-only workaroundvoorstel**; geen uitspraak over de prestaties van fysieke zwakke computers. De [JSON](2026-11-16-pr349-linux-paint.json) bewaart alle acht pogingen, inclusief de twee onvolledige eerste graphicsproeven, met artifact-/screenshotdigests, exacte tekstcontrole, capturetijdstippen, regio/pixelmetingen en beperkingen. Kleuraantallen zijn ondersteunende metrics; leesbaarheid is daarnaast in de originele PNG's geïnspecteerd.

## Bounded voorstel voor de integratiechat

Voeg uitsluitend aan de `env` van de native Linux/Xvfb-uitvoerstap toe:

```yaml
WEBKIT_DISABLE_DMABUF_RENDERER: "1"
```

Dat betreft de native uitvoerstap in `.github/workflows/desktop.yml` en de corresponderende artifact-hercheck, niet de pakketbouw of de productlauncher. De bestaande helper erft `process.env`; een globale flag in de applicatie is niet nodig. Leg in het runtime-rapport ook de effectieve `GDK_BACKEND`, `LIBGL_ALWAYS_SOFTWARE`, `WEBKIT_DISABLE_DMABUF_RENDERER` en `WEBKIT_DISABLE_COMPOSITING_MODE` vast. Laat compositing verder ongemoeid. Valideer daarna de **daadwerkelijke centrale helper** op hetzelfde F-pakket, inclusief visuele inspectie van saved en reopened; de eigen paint-helper vervangt die integratiecontrole niet. De gereserveerde centrale helper en workflows zijn in deze branch niet aangepast.

## Grenzen

De oorspronkelijke F-proef faalde eerder bij opslaan en bevatte wél leesbare paginaglyphs. De daaropvolgende readiness-gecorrigeerde proef slaagde voor opslag/heropenen, maar had lege pagina's. Alle resultaten blijven geldig als afzonderlijke waarnemingen: een incidenteel leesbare pagina bewijst geen stabiele werking. De readiness-correctie of PR #349 is daarmee niet als oorzaak van het beeldprobleem aangetoond.

Deze proef betreft alleen Writer via de geïnstalleerde DEB op een virtuele Linux-display. Geen fysiek Linux-/Waylandbewijs, AppImage-bedieningsbewijs of volledige native taalstatusacceptatie. Bestaande Windows-, macOS- en echte browserresultaten behouden hun eigen bronpunten en beperkingen; deze Linux-proef vult die niet automatisch aan. De integratiechat houdt de gezamenlijke platformmatrix bij.
