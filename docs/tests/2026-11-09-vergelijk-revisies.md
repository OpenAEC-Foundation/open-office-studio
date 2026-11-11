# Bestaande revisies vóór versievergelijking (#57)

Basis: `f4a03889` (`main`), 9 november 2026.

`heeftWijzigingen` zocht uitsluitend naar vier letterlijke `w:`-tags in
`word/document.xml`. Daardoor sloeg ‘bestaande wijzigingen eerst accepteren’
invoegingen met een andere namespaceprefix en opmaakrevisies over. De echte
vergelijkingsengine weigerde het document vervolgens met `existing-revisions`.

De detectie leest nu echte XML-elementen en hun namespace, inclusief lokale
herbindingen. Ze herkent tekst-, opmaak-, cel- en verplaatsingsmarkeringen en
volgt het hoofddocument uit de pakketrelatie. XML-commentaar en CDATA met
voorbeeldmarkeringen gelden niet als revisie. Alleen de pakketrelaties en
het hoofddocument worden uitgepakt; mediabestanden worden overgeslagen.

## Controles

- 28 nieuwe proeven: 26 falen tegen de oorspronkelijke code, alle 28 slagen
  met de reparatie.
- Met de bestaande wijzigings- en vertaalproeven: 35 tests geslaagd.
- Twee proeven gebruiken de echte Yrs- en `compareDocx`-engines: een
  invoeging met afwijkende XML-prefix en een alineaopmaakrevisie. Zonder
  vooraf accepteren volgt terecht `existing-revisions`. Met de optie aan
  worden de oude revisies in een kopie geaccepteerd en ontstaat een nieuw
  vergelijkingsdocument met revisies. De originele bytes blijven gelijk.
- TypeScriptcontrole en Vite-productiebouw geslaagd. De sandbox gebruikte
  `--configLoader runner`; de repositoryconfiguratie is niet gewijzigd.

Herhalen:

```powershell
pnpm exec vitest run src/tekst/wijzigingen/vergelijken-engine.test.ts src/tekst/wijzigingen/wijzigingen.test.ts src/tekst/wijzigingen/vertaling.test.ts
pnpm exec tsc --noEmit
pnpm build
```

Dit is een deelfix voor #57. De detectie betreft het hoofddocument. De
vergelijkingsengine kan documenten met verschillende hoofdstructuren of
sectie-eigenschappen nog weigeren met `structure-change`; de integratieproeven
vergelijken twee versies van hetzelfde document. Volledige vergelijking van
opmaak, tabellen en verplaatste tekst en het samenvoegen van revisies blijven
open. De native Windows-app is niet herbouwd of opnieuw functioneel getest.
