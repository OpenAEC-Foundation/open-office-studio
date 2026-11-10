# Vervolgtekst na een nootverwijzing — #282

## Afgebakende fout

Op de Windows-devbuild van `4175e5f19bf052e0a03f4a87ab73e710f6f163a7`
vond de Windows-testchat bij Enter na een voetnoot een kleine, superscript
vervolgalinea. De Writer-chat heeft het opgeslagen synthetische DOCX onafhankelijk
gelezen: de alinea is `Normal`, maar de volledige nieuwe tekst draagt
`FootnoteReference`. De oorspronkelijke DOCX heeft SHA256
`46dbd3749906d4d4b9c07a09a56873cb1ade7465aefb33f0f2cd6f4b9b38861d`.
De Windows-chat bevestigde hetzelfde bronresultaat in de PDF.

Een eigen tegenproef in de productie-Yrs-kern bevestigt beide nootsoorten:
`splitParagraph` neemt `styleId` en `vertAlign` van de laatste verwijzing over
in `defaultTextFormatting` van de lege nieuwe alinea. Dit is afzonderlijk
geregistreerd als [#282](https://github.com/OpenAEC-Foundation/open-office-studio/issues/282),
gekoppeld aan functieoverzicht #51. De verloren selectie bij een vertraagde
herlaadsprong heeft eigen issue #284 en wordt door PR #266 opgelost.

## Correctie en betekenisvolle regressies

De bestaande gecontroleerde Enter-aansluiting gebruikt een lokale wrapper.
Alleen aan het echte alinea-einde, direct na een semantische `noteRef`, krijgt
de nieuwe lege alinea de opmaak van de voorafgaande tekst. Bij alleen een
verwijzing gelden de alineastandaarden. De verwijzing zelf wordt niet bewerkt.
De wrapper blijft in dezelfde native invoer-/Undo-bewerking.

De kern gebruikt het native alinea-span voor de eindpositie: een verwijzing
telt mee als één positie, een emoji als twee UTF-16-posities. Zo werkt ook
`w:next` van een kop die op een noot eindigt. De aansluiting weigert een
gewijzigde enginebron en verandert geen vendor- of WASM-bestand.

Twaalf nieuwe kernregressies controleren beide nootsoorten, Undo/Redo,
DOCX-opslag/heropenen, ongewijzigde verwijzingen, afwijkende markerstijl/kleur/
lettertype/grootte, bewust superscript/subscript, directe opmaak, alleen een
verwijzing, splitsen vóór de verwijzing en een kopovergang. Een apart rood
randgeval met rechtstreeks uitgezet superscript/vet op een superscript/vette
alineastandaard voorkomt dat oude standaardwaarden de correctie ondermijnen.
De bestaande vijf kopovergang- en 23 nootopmaaktests blijven groen.

## Productieproef

Na een productiebuild:

```powershell
node scripts/proef-writer-nootvervolg.mjs
```

Vier onafhankelijke browserdocumenten voeren echte muis-/toetseninvoer uit:
voetnoot, eindnoot, kop met voetnoot en bewust superscript vóór een eindnoot.
Iedere proef gebruikt End → Enter → typen → Undo/Redo → opslaan → openen van
de werkelijk opgeslagen bytes. De controles lezen native selectie/opmaak én
de opgeslagen XML; gewone vervolgtekst heeft geen referentiestijl. De
referentie blijft superscript en bewust superscript blijft behouden. Alle vier
slagen zonder JavaScript- of applicatiefoutmelding. Het machineleesbare resultaat
staat in [het proefrapport](2026-11-10-writer-nootvervolg.json).

TypeScript en de productiebuild slagen. De volledige suite op de huidige
integratiebasis `d978918d998bd00485bcafc4cef3072314c1b918` slaagt met 2.867 tests
in 275 bestanden; tien bestaande corpusgevallen zijn overgeslagen.

## Onafhankelijke Windows-acceptatie

Integratorchat9635 beheert de gezamenlijke kandidaat; buildchat750b maakt en
bedient de ene Windows-build. De native hertest blijft bij levering nog nodig:
in een nieuw document een verse voetnoot én eindnoot invoegen via References,
terug naar de verwijzing, End/Enter en gewone vervolgtekst typen. Controleer
weergave en lint, Undo/Redo, opslaan/sluiten/heropenen en de opgeslagen runstijl
op de exacte kandidaat-SHA. De bestaande foutief opgemaakte bronfixture blijft
bewijs; haar reeds opgeslagen expliciete opmaak wordt niet stilzwijgend gewist.
