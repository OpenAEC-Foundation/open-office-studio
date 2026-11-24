# #381 — tweede echte Linux-getuige: geblokkeerd vóór gepatchte conversie

Run [45381046100](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45381046100), job138399833987, attempt1. Uitvoerbron75efe1bc1845f8b91fb931a54e844987a9260a9f; bevroren harnas25ccc32710526d54ab2ce83066eaa806e2f84903; productvoorstelb9233f3c61322cd1f2d27aca49138829c8b7bc9c. Applicatie blijft exact P5b696ab86/treee30879fd/2026.48.1. Geen wijziging van de officiële runtimepin.

De verse aanvraag, kritieke queuecontrole, bronfixture en volledige originele runtime-ZIP/tar/manifest/verifier zijn geslaagd. Zowel de ongewijzigde libwps-control als de gepatchte library zijn werkelijk gebouwd. SONAME, NEEDED, `$ORIGIN`, ldd en het beperkte API-symbolcontract slagen. Dit bewijst geen volledige ABI-compatibiliteit.

De originele gebundelde library en de opnieuw gebouwde control hebben beide de echte WQ2→XLSX-conversie uitgevoerd. LD_DEBUG toont de werkelijk geladen, juiste ELFbytes. De onafhankelijke oorspronkelijke oracle controleert61 cellen/vier formules en blijft bij beide terecht rood: VLOOKUP-kolomindices1–4 in plaats van2–5. Bronbytes blijven behouden en na elke voltooide conversie zijn geen eigen profielprocessen aangetroffen.

De gepatchte fase stopt vóór converterstart op de tweede volledige entrysetcontrole van de afgeleide private prefix: `Unexpected runtime entries`. Dezelfde prefix had de controlconversie uitgevoerd. De afwijkende paden zijn niet opgenomen in het faalbewijs; de precieze oorzaak is daardoor onbekend. Er is geen verifier versoepeld, productcode aangepast of herproef gestart. De gepatchte conversie, typed-resultaten, edit/Undo/Redo/save/nieuw-proces-heropenen zijn **NIET UITGEVOERD**.

De buildreceipt bewijst alleen dat de canonieke library vóór conversie onveranderd was. De originele control voert de uitgepakte canonieke prefix uit; een volledige inventaris ná die conversie ontbreekt. Volledige post-run-onveranderlijkheid van die prefix is dus niet aangetoond. Een volgende afzonderlijk toegewezen proef moet deze bewijsgrens expliciet oplossen en de concrete entrydelta bewaren; geen tolerantere payloadcontrole.

Het oorspronkelijke artifact14913128859 is éénmaal opgehaald, volledig vergeleken met officiële grootte3777450B/SHA256 `2eb191f39ab30479a535f0f2125d188c47bd48a2d3a9b1884b12030f9e71d509` en veilig uitgepakt. De blijvende ZIP en alle77 memberhashes staan hier. De ruwe originele reports zijn selectief apart bewaard; de ZIP bevat de volledige uitvoer inclusief drie library-ELFs en loaderlogs. Officiële metadata bevat de expiry. `proof.json` bindt de aanvullende bestanden.

Absolute epochs: start1795518363=11:06:03Z, prep11:16:03Z, build/test11:41:03Z, eind11:51:03Z. De run stopte na2m35s; deadline/uitvoeropruiming zijn geslaagd. Engine/SSR-cleanup is vastgelegd. Geen lokale app-, opname- of testservers gestart. Windows/macOS/browser/nativeacceptatie en productie-integratie blijven open; #381 blijft open.
