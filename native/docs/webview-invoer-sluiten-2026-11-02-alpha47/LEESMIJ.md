# Rust-WebView: snelle invoer en veilig sluiten

Versie `2026.45.0-alpha.47`, voortbouwend op commit
`9d2d6ed2ad1656b0ee09a915c9a57c3f7b4f7436`. Dit is een ontwikkelpreview,
geen volledige migratie of visuele goedkeuring.

## Hersteld

De eerste vensterproef verloor tekens bij snelle invoer: de verwachte titel
`Notitie uit Rust WebView` werd `NtteutRust WebView`. Native DOM-updates konden
nieuwere browserinvoer terugzetten. De invoervelden krijgen nu een beginwaarde;
gewone invoer vervangt hun levende waarde niet. Navigatie en undo/redo geven de
editor een nieuwe generatie, zodat herstel wel de juiste Rust-bron toont.
De documentidentiteit en generatie blijven ook aan vertraagde bediening gebonden.

Systeemsluiten met onopgeslagen wijzigingen verborg bovendien het venster zonder
de sluitvraag terug te tonen. Het venster komt nu terug via de native vensterlus,
zodat het niet op een tekenactie van de verborgen WebView hoeft te wachten.
Expliciet Verwerpen zet het sluitgedrag op werkelijk sluiten. De oorspronkelijke
negatieve vensters, bronnen en controles staan in `afkeuringen/`.

Ook geweigerde invoer krijgt een nieuwe generatie. Een regressieproef met
500.002 UTF-8-bytes bevestigt dat de bron en geschiedenis intact blijven, het
ongeaccepteerde browserconcept wordt vervangen en geldige invoer daarna werkt.
De negatieve proef vóór herstel staat eveneens in `afkeuringen/`.

De titelbalk volgt de bestaande naamgeving. Start toont eenmaal de appnaam;
het notitietabblad heet Notities. De bestandsnaam blijft voor opslag behouden.

## Controles

- Elf gerichte WebView-tests slagen, waaronder DOM-mutaties, escaped
  documenttekst, eigenaarschap, veilige opslag, onbekende bronvelden en herstel.
- Clippy slaagt voor de volledige werkruimte, alle targets en desktopfeature,
  met waarschuwingen als fouten. De eerdere fout blijft bewaard.
- De echte Linux-debugvensterproef slaagt met 45 volledige clientbeelden en
  tien inhouds-/afsluitcontroles. Typen gebruikt 12 ms tussen tekens.
  Titel, canvas, meerregelige Markdown, bewaren, heropenen, undo/redo,
  Bestand/Escape, Start, thema, sluitvraag, annuleren en verwerpen zijn bediend.
  De bewaarde bron wordt na annuleren/undo bytegelijk hersteld; verwerpen
  verandert het schijfbestand niet.
- De brede eindronde slaagt met 469 Rust-tests, niets overgeslagen,
  onafhankelijke document- en conversieteruglezers en acht Python-tests.
  `eindronde.json` en `ruw/` bevatten de zeven afgesloten fasen.
  Deze ronde ging vooraf aan de laatste drie gewijzigde bestanden; daarna
  zijn elf gerichte tests, volledige Clippy en de vensterproef herhaald.
  Een eerdere afgebroken terminalronde is geen geslaagde eindronde.

De herhaalbare vensterproef staat in
[`proef-webview-venster.py`](../../scripts/proef-webview-venster.py).
De workflow bouwt de preview voor Linux, Windows en macOS; Linux krijgt ook
deze proef met het werkelijk gebouwde releaseprogramma. De workflowwijziging
bewijst op zichzelf geen geslaagde platformbouw of fysieke installatie.

`programmaproof.json` bevat de hash van de gebruikte debugbinary.
`bronverband.json` benoemt precies de drie gewijzigde bestanden na de brede
ronde en de daaropvolgende controles. De eerdere GUI-bouw en haar bewijs
blijven onder de namen met `voor-afwerking` bewaard. `patchherstel.json` controleert
het bytegelijke herstel van de acht gewijzigde bestanden vanaf de basiscommit.
De ruwe patch en het bronmanifest zijn verliesloos met gzip opgeslagen.
De font-, stijl- en eerdere referentiebestanden zijn niet gewijzigd.

## Nog afgekeurd of niet volledig getoetst

De nieuwe Notities-pixelvergelijkingen zijn beide afgekeurd. Beide gebruiken
de oorspronkelijke voorbeeldbron, Forge, 1058 × 892 pixels en nul tolerantie,
zonder maskers, schaalwijzigingen of bewerking van de bronbeelden:

| Oorspronkelijke referentie | Afwijkende pixels van 943.736 |
| --- | ---: |
| Browser 2026-W44.8 | 160.710 |
| Linux-desktop 2026-11-01 | 124.649 |

Dit is geen percentage van voltooide functionaliteit. De oorspronkelijke
Markdown-bronstructuur en het contrast van de boekkiezer zijn hersteld.
Er ontbreken nog oorspronkelijke lintopdrachten,
nette datumnotatie, onderdelen van de canvasbediening en andere modulefuncties.
De vaste referenties zijn behouden. De acceptatievlaggen blijven onwaar.

Writer, Spreadsheet, Presentation en losse EML gebruiken voorlopig het
documentbeeld met veldbediening; hun oorspronkelijke editors en volledige
linten zijn nog niet overgezet. Mailaccounts en de database-interface zijn nog
niet aangesloten. Documentacties lopen in deze WebView-aansluiting nog op de
UI-draad. Volledige IME-/toetsenbordbediening, alle systeemdialogen, automatische
bewaring/herstel, alle formaten, installaties en echte Windows-/macOS-vensters
zijn met deze ronde niet goedgekeurd.

Een eerste meerregelige `xdotool type`-proef gaf afwijkende invoer. Die wordt niet
als geslaagd geteld. De herhaalbare proef verstuurt echte afzonderlijke
Return-toetsaanslagen en controleert de opgeslagen regelovergangen.
