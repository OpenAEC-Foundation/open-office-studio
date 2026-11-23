# Linux native pakketcontrole #368 / #369, 23 november 2026

De afgebakende Linux Find/Replace- en toetsenbordlintcontroles slagen op het
daadwerkelijk geïnstalleerde **2026.47.1**-pakket van APP
`420af640c10ab9ada6c66c844c0098caea87c493`, tree
`c1334c8f4d92914e9d2114d56e467ef11eab9646`. Dit is geen algemene native
goedkeuring en geen pakketcontrole van de latere P2-kandidaat.

[receipt.json](receipt.json) bevat volledige pakket-, uitvoerbare-bestands-,
harness-, rapport- en beeldhashes, criteria en beperkingen. De zes originele
GitHub-artifact-ZIPs staan ongewijzigd onder `artifacts/`; hun bytes zijn
onafhankelijk tegen de officiële artifact-digest gecontroleerd. Ze bewaren
ook de mislukkingen, originele PNGs, DOM-metingen, DOCX-bestanden en cleanup.

## Pakket en echte bediening

Desktopbuild **44753496663**, Linux-artifact **14639121545**, archief-SHA256
`3ba6fcdc910803e107b881f57273373db0bfd7f423e6c1e8eb80a78e1cddf7da`.
De geïnstalleerde DEB is afzonderlijk gehasht:
`c68ccacc61421afec6e7a30a26d9ef38f9cb954e86fd5ff9f31c4146a61261e9`;
de daadwerkelijk bediende ELF:
`ea4b4eaf1ac8929a19dba67b7f0dc80561dce119fb66a082a0c8d87d093e6f17`.

Ubuntu 22.04, WebKitGTK/WebKitWebDriver **2.50.4-0ubuntu0.22.04.1**,
tauri-driver **2.1.0**, echte GTK-app onder een eigen headed X11/Xvfb-display.
W3C-muisbediening en XTest-toetsen zijn aan exacte PID, executable, starttijd,
XID, foreground en zichtbaar documentfocus gebonden. DOM-inspectie is alleen
lezend; geen CSS, scripted focus, editorbridge of driver-execCommand. Originele
X11-PNGs komen uitsluitend van het gevalideerde eigen venster.

Een korte preflight bewijst invoerfocus, een native teken, één Undo/Redo,
Ctrl+S met onafhankelijke DOCX/XML-controle, volledig afsluiten en een nieuwe
processtart met de exacte opgeslagen inhoud. Iedere vervolgrun voert die
preflight opnieuw uit. De eerdere brede preflight-marker veronderstelde ten
onrechte één document-editgroep; die mislukking blijft bewaard. De kernproef
`abc` → één Ctrl+Z in de zoekvelden is ongewijzigd strikt.

## Geslaagde afgebakende controles

| Bewijs | Resultaat |
| --- | --- |
| [45143046662](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45143046662), QA `3b79f664` | Find 29 en Replace 16 controles geslaagd. `abc` verdwijnt na één Ctrl+Z; beide Redo-sneltoetsen herstellen het. Daarna `abcq`, werkende zoekopdracht, lege invoerhistory, intacte documenthistory en documentisolatie. Volledige FINAL-marker plus vierde kolom blijven behouden na save/full quit/fresh-process reopen. Het totale rapport blijft **failed** vanwege de latere lintdriverklik. |
| [45143888379](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45143888379), QA `d5f079e3` | 258 lintcases / 1284 knopmetingen, 24 collapsed-triggercases, 24 pointer→ArrowDown/Right-ingangen en 36 Home/End-controles. Light/Forge, 1600/923/800 px. Zichtbare labels en iconen passen; geen afgekapte inhoudsknoppen. Alle triggers hebben `focusVisible=true`, ringruimte 4 px en `clippedY=false`. Pointer-only tabfocus blijft `focusVisible=false`. |
| [45145243773](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45145243773), QA `795f7c3a` | Aanvullende echte pointer→Down→Right→Enter-route naar Insert Column Right: vier zichtbare focustargets, één toegevoegde kolom, document-input keert terug, native `K` wordt in het document ingevoerd. Onafhankelijke save/XML-controle en volledig nieuwe processtart behouden exact `Kalpha` en de 3×4-tabel. |

De acht originele Delete-triggerbeelden bij 923/800 px, beide thema's,
vóór Enter en na Escape zijn serieel beoordeeld: rand boven/onder, pictogram
en label zijn compleet. Ook de originele brede Text/Alignment/Data/Delete-
focusbeelden en Find/Replace/save/reopen-beelden zijn serieel beoordeeld en
gehasht. Tussenliggende bediening wordt bewezen door de raw input-, DOM- en
XML-registratie; een eindbeeld alleen bewijst geen hele toetsenreeks.

## Exacte gedeeltelijke grens en overblijvende controles

De lintmodule blijft **partial / nativePass=false**, uitsluitend wegens zes
niet bereikte disabled-Delete-varianten: light/Forge × 1600/923/800 px.
Op het echte geselecteerde, bewerkbare 2×3-document zijn **Delete Row,
Delete Column en Delete Table allemaal ingeschakeld**. Buiten tabelcontext
verdwijnt de contexttab. Er is geen ondersteunde Writer-readonlybediening
bereikt waarmee deze knoppen nog zichtbaar maar uitgeschakeld blijven.

De bron koppelt deze knoppen aan de enabled-staat van de engine
(`src/lint/tekst.tsx`, `src/lint/gedeeld.tsx`, `src/Ribbon.tsx`). De bestaande
DocxEditor-configuratie biedt hier geen readonly-UI; verborgen tabbladen
worden met `inert` afgeschermd. Dit is een concrete fixture-/bereikbaarheidsgap,
geen zelfstandig gereproduceerde fout in disabled-weergave. Er is geen
disabled-attribuut of stijl geïnjecteerd om er een native pass van te maken.
De ontbrekende verificatie blijft: bereik een ondersteunde echte disabled-
Delete-staat en controleer herkenbaarheid en verticale passing bij dezelfde
zes combinaties. #362 vraagt expliciete registratie van onbeschikbare native
controls; deze grens bewijst op zichzelf geen resterende productbug.

**Import-active is wel compleet**: 12 cases voor Bottom en Repeat Header Rows
over alle zes thema/breedtecombinaties. **Echt disabled Split Table** is bij
alle zes combinaties gemeten. Er ontbreekt dus geen imported-active-case.

Vier raw `clippedX=true`/combined-observaties blijven zichtbaar: Text-trigger
bij 800 px, beide thema's, voor/na Escape. `clippedY` blijft daar false.
#362 betreft verticale passing; er is geen all-axes-clippingvrij-claim.

Voor de hier geteste Linux #369-route ontbreken na de aanvullende Enter/
documentreturn-proef geen van de genoemde keyboardcriteria. Windows/macOS/
browservergelijking en de latere P2-pakketten vallen onder integratie en zijn
geen claim van deze receipt. IME/composition, readonly/disabled zoekinvoer en
reeds afgehandelde events zijn hier geen native UI-proeven; hun gerichte
bron/unittests blijven afzonderlijk bewijs. Fonts-substitutionmeldingen en
een nog ladende Home-stijlgalerij na heropenen zijn zichtbaar; dit is geen
algemene typografie- of documentrenderinggoedkeuring.

## Bewaarde mislukkingen en cleanup

De eerste vier pogingen zijn volledig bewaard: GTK-initialisatiefout na 36
positieve controles, onvolledige native tekstburst na 34 controles, de foute
preflight-editgroepaanname, en de onderschepte tab-middenklik bij 800 px.
Bij die laatste bleef een deel van dezelfde tab werkelijk bereikbaar: de
QA-correctie gebruikt een alleen-lezende hit-test en een echte muisklik op
dat vrije deel, en stopt bij volledige afdekking of ambiguïteit. Geen
productcode is voor deze acceptatie gewijzigd.

HOME, DISPLAY en XAUTHORITY zijn in latere sessies behouden en geregistreerd;
de vierde GTK-startfout heeft daarmee nog geen bewezen oorzaak. `-noreset`
is een hostmaatregel met onbewezen causale attributie. De oude ArrowDown-
focusfouten en oorspronkelijke Tab/screenshot-timeout van I3 blijven apart
behouden in het bestaande controlbewijs; ze zijn niet als 420-pass hernoemd.

Alle zes runs bevestigen eigen app-PIDs leeg en eigen driver afgesloten.
Alle vier lintmodule-cleanups zijn fulfilled. Er is lokaal geen GUI- of
opnamesessie gestart; geen gedeelde processen, main, tags of publicatie zijn
aangeraakt. De lokale protocolcontroles slagen 27/27; Linux heeft daarbij
één verwachte platformguard-skip. Een build of die tests vervangen geen native
acceptatie.
