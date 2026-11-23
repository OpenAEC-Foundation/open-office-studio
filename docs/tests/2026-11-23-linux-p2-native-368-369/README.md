# P2 Linux native acceptatie #368 / #369, 23 november 2026

De vier afgesproken native scopes slagen op het echte geïnstalleerde P2-pakket
**2026.48.1**, APP `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`.

[Run45148819548](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45148819548)
gebruikt QA `b15892cd491b5bfef6b765f6f9af43d62873a0d5`. Het gedownloade
bewijsartifact **14805173075** is onafhankelijk tegen de officiële ZIP-digest
gecontroleerd: `55a62c612872f94aa6ed1883d9b00174220a8d40f89e9f83389bf9005d2c9202`.
De ongewijzigde bytes staan in [native-artifact.zip](native-artifact.zip).
[receipt.json](receipt.json) bevat alle bron-, pakket-, harness-, rapport-,
beeld- en cleanupbindingen; de originele raw rapporten en PNGs zitten in de ZIP.

## Pakketbinding vóór appstart

De aparte recoveryinput uit run45146535263/artifact14804990580 is volledig
gedownload en gehasht; de 811MB Desktop-ZIP is door deze consumer niet opnieuw
gedownload. De producer had de parent-ZIP en uitgepakte DEB/ELF geverifieerd.
De vastgepinde [descriptor](native-input-descriptor.json), Git7c5c4d9f,
heeft canonical-LF SHA256
`fc296348a7029ecd9740575664a18ab4bbc0a501f6bc7d90a8657e91a9809a92`.

- Input-ZIP: `dad8d71594470ed7216c9f5d48f65fc2531d9c2b8de1b80b213d823a1e34606f`.
- DEB: `23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`.
- Daadwerkelijk geïnstalleerde ELF:
  `62923344ce4d11f6892ed1b1d4064ff5b85ce50c0286bb0a527bd121e46dd287`.

De consumer controleert officiële artifact/run/source/size/digest-metadata,
de kleine canonieke pakketrapport-ZIP en zijn exacte rapportbytes, de volledige
recovery-ZIP, de unieke DEB-member met CRC/size/hash, alle DEB-controlvelden,
de uitgepakte ELF en de werkelijke geïnstalleerde ELF. P2-bron/tree/versie en
een schone APP-checkout zijn verplicht vóór executie. De geslaagde exacte
Linux Desktopjob137586343061 volstaat; andere platformjobs blokkeren deze
onafhankelijke native controle niet. Een eerdere unrelated producer-canaryfout
is geen Office-appbediening of native pass.

## Echte functionaliteit

Ubuntu22.04, WebKitGTK/WebKitWebDriver **2.50.4-0ubuntu0.22.04.1**, tauri-driver
**2.1.0**, eigen headed X11/Xvfb met softwaregraphics. Iedere native input is
aan eigen PID/starttijd/executable/XID/foreground/zichtbare documentfocus
gebonden. DOM-inspectie blijft alleen lezend. Geen scripted focus, CSS,
disabled-attribuut, editorbridge of driver-execCommand is geïnjecteerd.

De preflight bewijst echte invoer, één Ctrl+Z/Ctrl+Y, Ctrl+S met onafhankelijke
DOCX/XML-controle, volledig afsluiten en een nieuwe processtart met de exacte
opgeslagen inhoud. Daarna slagen **63 geregistreerde functionele controles**:

| Scope | Daadwerkelijk resultaat |
| --- | --- |
| #368 Find what | `abc` → één Ctrl+Z → leeg; beide Redo-sneltoetsen herstellen `abc`. Verder typen geeft `abcq`; zoeken naar `alpha` geeft één echt resultaat. Lege inputhistory en input-Undo bewaren de kolomhistory. Sluiten herstelt documentinvoer; één document-Undo verwijdert de toegevoegde kolom. |
| #368 Replace with | Dezelfde invoer/Undo/Redo/synchronisatie/zoek- en documenthistorycontroles slagen onafhankelijk. De onopgeslagen proef schrijft de bron-DOCX niet. |
| Documentisolatie en opslag | Twee documenten behouden eigen Undo/Redo. De volledige FINAL-marker en 3×4-tabel blijven exact behouden na native save, volledige quit en nieuwe processtart. |
| #369 keyboardcommand | Pointer→Down→Right bereikt Insert Column Right met zichtbare 4 px focusruimte. Enter voegt één kolom toe; echte document-input keert terug; native `K` verschijnt in het document. Save/full quit/fresh-process reopen behoudt exact `Kalpha` en de 3×4-tabel. |
| #369 / #362 lintmatrix | Light/Forge × 1600/923/800 px: 258 inhoudscases/1284 knopmetingen, 24 collapsed-triggercases, 24 pointer→ArrowDown/Right-ingangen en 36 Home/End-controles. Pointer-only tabfocus blijft invisible; keyboardfocus is zichtbaar met4 px ringruimte. Delete bij 923/800 vóór Enter en na Escape past verticaal in beide thema's. |

Er zijn geen afgekapte inhoudsknoppen, niet passende iconen of niet passende
zichtbare labels gemeten. Alle 24 groeptriggers hebben `clippedY=false`.
Vier `clippedX=true`/combined-observaties blijven raw behouden: Text bij 800 px,
beide thema's, vóór/na Escape. #362 betreft verticale passing; dit is geen
all-axes-clippingvrij-claim.

## Beeldreview en exacte gedeeltelijke grens

Negentien relevante originele PNGs zijn op SHA256 beoordeeld. Vijftien zijn
**exact dezelfde bytes** als reeds serieel beoordeelde 420-beelden, waaronder
alle acht Delete-triggergrenzen bij 923/800/light/Forge/vóór en na Escape,
de brede Text/Alignment/Data/Delete-focus en Find/Replace/final-reopen.
Die zijn op exacte hash hergebruikt. De vier gewijzigde originelen
(preflight save/reopen en keyboardcommand focus/reopen) zijn nieuw serieel
bekeken. Ieder beeld blijft aan zijn eigen actuele P2-capture en native PID
gebonden; de 420-rapporten zijn niet als P2-resultaat hernoemd.

De lintmodule blijft **partial / nativePass=false**, uitsluitend vanwege zes
niet bereikte echte disabled-Delete-staten: twee thema's × drie breedtes.
Delete Row/Column/Table zijn in de geselecteerde bewerkbare tabel alle drie
ingeschakeld; buiten tabelcontext verdwijnt de contexttab. Er is geen
ondersteunde readonly-UI bereikt waarmee deze knoppen zichtbaar maar disabled
blijven. Dit is een fixture-/bereikbaarheidsgrens, geen zelfstandig
gereproduceerd disabled-renderingdefect. De ontbrekende controle blijft echte
disabled-Delete-herkenbaarheid/verticale passing in die zes combinaties.
#362 verlangt expliciete registratie van onbeschikbare native controls.

**Imported-active is compleet**: 12 cases voor Bottom en Repeat Header Rows.
**Echt disabled Split Table** is in alle zes combinaties gecontroleerd.
Voor de hier geteste Linux #369-keyboardroutes en command/documentreturn
ontbreken geen van de afgesproken controles. Native IME/composition,
already-handled en readonly/disabled zoekinvoer zijn hier niet als UI-proef
geclaimd. Fontsubstitutie en een nog ladende Home-stijlgalerij bij heropenen
blijven zichtbaar; dit is geen algemene renderinggoedkeuring.

## Herkomst, tests en cleanup

De module/input/capture/readiness-logica is de bewezen 420-harness met alleen
padnamen aangepast. Dezelfde oorspronkelijke 2×3-headerfixture behoudt
SHA256 `ba26f890485dcee41cbfdf694969014ae7b9951b34cbbbc01bc820a15491b3f9`.
De synthetische FINAL-testtekst is voor vergelijking gelijk gebleven; die tekst
is geen pakketversie. De 420-proof 45ccd784 en de oorspronkelijke I3 ArrowDown-, Tab/screenshot- en
latere 420-driverfouten blijven ongewijzigd apart bewaard.

De remote protocolchecks geven 26 geslaagde Node-tests en 1 verwachte Linux-platformguard-skip,
plus 4 geslaagde Python-tests voor provenance en ZIP-controles, plus syntaxchecks. De exacte logregels staan in
[protocol-checks.log](protocol-checks.log). Dit is afzonderlijk van de echte
native pakketacceptatie hierboven.

Alle vier scopes bevestigen eigen app afgesloten. De uiteindelijke app-PIDs
zijn leeg, de driver is afgesloten en alle vier lintmodule-cleanups zijn
fulfilled. Er is lokaal geen GUI/capturesessie gestart. Productcode,
gedeelde rootbestanden, main, tags en publicatie zijn niet gewijzigd.

Deze receipt dekt uitsluitend de genoemde P2-DEB. Een later releasepakket
vereist eigen payloadidentiteitsvergelijking of passende finale controles.
Windows, macOS en browser blijven de verantwoordelijkheid van de integratie;
dit bewijs geeft geen algemene native/all-platform-releasegoedkeuring.
