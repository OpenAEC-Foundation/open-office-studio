# #381 — echte Linux-converter en P5-engine-roundtrip geslaagd

[Run45404556426](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45404556426), job138481622164, attempt1: SUCCESS na5m16s. UitvoerQA3a8d209555e10709f13277ed1e1eb7b9c6762abf; frozenSource81d065aec275e0e74208f1a877446f4f9f8848d0; productvoorstelb9233f3c61322cd1f2d27aca49138829c8b7bc9c. P5app/engine blijft b696ab86bd1c128729a079b68c0082e6df3d36a5/treee30879fd772871e690847c061ef66e6b81808a05/2026.48.1. Officieel runtime-input14805600515 behoudt zijn oorspronkelijke P2-parentbinding; de variantkopieën zijn uitsluitend DERIVED private QA, geen officiële runtime.

| Werkelijk uitgevoerde variant | Onafhankelijke61-cel/4-formule-oracle | VLOOKUP-kolommen |
| --- | --- | --- |
| Oorspronkelijke library c6f5c5dc… | Verwachte oorspronkelijke FAIL |1,2,3,4|
| Opnieuw gebouwde ongewijzigde control00186a57… | Verwachte oorspronkelijke FAIL |1,2,3,4|
| Werkelijk gepatchte library e9f8123a… | PASS, inclusief numerieke en teksttypen |2,3,4,5|
| Echte P5-engine-save na edit/Undo/Redo | PASS |2,3,4,5|
| Afzonderlijk nieuw engineproces: reopen en resave | PASS |2,3,4,5|

De werkelijke `bereidOpenen`-productiefunctie adviseert `TESTLU.xlsx`, met het echte CLI-resultaat via de private adapter. De P5-WASM controleert steeds57 constante cellen en vier getypeerde formuleresultaten. A15=4005 geeft683.93/3134.2/tekstc/tekstsal; wijziging naar4007 geeft685.35/3134.58/tekstc/tekstl. Undo herstelt het origineel en Redo de wijziging; A13 behoudt de afzonderlijke tekstedit. Werkelijk opgeslagen en opnieuw geëxporteerde XLSX zijn bytegelijk: SHA689439d56d720978700d839247996e6585fdb8f6648f591f0cc71cbcd8110e83. EnginePID7601 is afgesloten vóór de onafhankelijke heropening in nieuwPID7851.

De echte hostinitialisatie levert nu de verplichte readertrace. Fontconfig2.13.1-4.2ubuntu5/ELF7d688909… wordt in hetzelfde converterPID als de geselecteerde libwps aangetroffen, bij alle drie varianten. De zes gepinde UUIDfiles zijn vóór de conversies toegevoegd en blijven exact36B/0644/met vaste hashes. Beide UUID-directorycaches zijn per variant daadwerkelijk in de eigen verse cache geschreven. De observercache, convertercache en andere variantcaches blijven gescheiden. Geen resterende eigen conversieprofielprocessen; canonical15082entries blijven volledig onveranderd. Private kopieën verschillen uitsluitend door de expliciete librarydelta en twee vooraf verklaarde metadatafiles.

Alle55 originele gzipinventories zijn lokaal op SHA/entrycount gecontroleerd. Hun volledige payloadgegevens zijn onafhankelijk vergeleken met de oorspronkelijke manifestSHA79204b36… en de precieze toegestane derivaties. De vijf oorspronkelijke XLSX-oraclecontroles zijn na de download opnieuw op de echte originele uitvoer uitgevoerd: beide controls terecht rood, patched/editedsave/freshreopen groen. Dit betreft alleen postdownload-Python/XML-audits, geen nieuwe runtime- of CI-run. `independent-audit.json` en de meegeleverde auditcode bewaren de exacte controles.

Artifact14925097859 is éénmaal opgehaald, tegen officiële29454092B/SHA `6ffd15ec37d659a0ecd62649ae2e4f0952d5f1cd30d556ab4c5aea13095bdd51` volledig geverifieerd en veilig208members uitgepakt. De ZIP bewaart alle oorspronkelijke outputs, logs en snapshots. Selecties staan hier afzonderlijk, met oorspronkelijke referentiefixture expliciet gelabeld als reference. Officiële metadata bevat de expiry; `proof.json` bindt de aanvullende bestanden.

De toegewezen kritieke Linux-wachtrij is vlak vóór de markerpush aanvullend op de oorspronkelijke P5-gate gecontroleerd met alle mainruns en expliciete OS-labels: beide main-Linuxjobs waren al in_progress, uitsluitend Mac stond queued. De aanvullende operatorsnapshot en scriptSHA staan in de oorspronkelijke request; de gebruikte operatorscriptbytes staan hier. Er is geen guardpass voor een onbekende of niet-gelezen mainqueue geclaimd. Start1795527165=13:32:45Z/14:32:45CET; prep+600, build/test+2100, final+2700=15:17:45CET. Finishreceipt heeft2383s reserve; engine/SSR en eigen converterprocessen zijn opgeruimd. Geen lokale GUI/opnamesessie/server gestart.

**Resterend:** de officiële productie-runtime is niet gewijzigd of geïntegreerd. Windows/macOS-converterbuilds/nativeappacceptatie, echte browser-GUI, Tauri-IPC en volledige ABI-/WQ2-formatdekking zijn niet bewezen. Dit is de afgeronde begrensde Linux-converter/engineproef. #381 wordt hiermee niet automatisch gesloten; main/integratie/version/runtimepin/release zijn ongewijzigd en de vier historische FAILs blijven behouden.
