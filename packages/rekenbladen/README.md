# Rekenbladen

UI-onafhankelijke XLSX-adapter voor de vastgezette `@betteroffice/xlsx`-kern. De app gebruikt dezelfde adapter om ontbrekende formule-uitkomsten voor exports te berekenen. De module is als TypeScript-bron te hergebruiken; er is nog geen afzonderlijke npm-uitgave.

`openSpreadsheet(bytes, { mode: "local", wasm })` opent een werkboek voor Node of een bestaande lokale engine. `mode: "worker"` gebruikt de asynchrone workerroute van de kern, met optioneel een `worker`-fabriek, gecompileerde `wasm` en een `AbortSignal`. Geef in eigen toepassingen de gewenste WASM-versie expliciet mee. Lokale verwerking blijft synchroon binnen de async-aanroep; kies workerverwerking om berekeningen van de browserthread af te houden.

De adapter heeft één async-contract: `version`, `readCells`, `validateEdits`, `applyEdits`, `exportStructured`, `save` en `dispose`. Edits gebruiken een versietoken en krijgen de oorspronkelijke toelatingsweigering terug. `withSpreadsheet` ruimt de engine ook bij fouten op. Opslag gebruikt de productie-serializer, inclusief berekende formulecaches en behouden onbekende OOXML-onderdelen.

ODS, XLS en XLSB worden buiten deze module door de gecontroleerde conversieroute naar XLSX omgezet. Appvensters, vertalingen, filter- en tekenobjectoverlays zijn geen afhankelijkheden van deze bronmodule. De bestaande synchrone editorhost is nog niet naar dit async-contract gemigreerd; de grote-werkboek- en toegankelijkheidscriteria van #3/#74 blijven afzonderlijk te verifiëren.
