# #381 — derde Linux-getuige: twee exacte nieuwe `.uuid`-paden

Run [45387643024](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45387643024), job138422666059, attempt1, eindigt FAIL na3m7s. Uitvoerbronb660bab3ff11181dead7c8227b3ee44b42fa91b7; bevroren harnas d186c4f9dddc61feae5ce0fed7f000e1e9821837. Applicatie P5b696ab86/treee30879fd/2026.48.1; productvoorstelb9233f3c onveranderd. De afzonderlijk goedgekeurde prefixisolatiee463583c is gebruikt. Geen productie-runtimepin, integratiebranch, main of publicatie gewijzigd.

Aanvraag/nonce/bronhashes/queue/runtimeverifier slagen. Beide echte librarybuilds slagen opnieuw: controlSHA00186a57c76193646e28aa6b06a67eeaff5a1d39f109b0c1d1339878181017ad en patchedSHAe9f8123ab66523071efcef37790c29cd6cb19201d258df7d937e644bb6f03932. SONAME/NEEDED/ORIGIN/ldd en het beperkte API-contract slagen; dit is geen volledige ABI-acceptatie.

De packaged-variant voert de originele library uitsluitend uit een verse DERIVED-privateprefix uit. Echte WQ2→XLSX-conversie eindigt0; LD_DEBUG bewijst de geladen oorspronkelijke libSHAc6f5c5dc…, bronbytes blijven gelijk en er zijn geen eigen profielprocessen achtergebleven. De private eindinventaris faalt echter op exact twee extra bestanden, zonder ontbrekende of veranderde bestaande entries:

| Pad onder `payload/usr/libexec/Open Office Studio/kantoorruntime/` | Bytes | Mode | SHA256 |
| --- | ---: | --- | --- |
| `program/resource/common/fonts/.uuid` |36|0644|d75e32724649cd9597d7745731230d112d47ce9570d9c2cb0e4fb0a90619be96|
| `share/fonts/truetype/.uuid` |36|0644|fcd1f717a467fef7c519cbf03078500637d068f01a7ea8a44d547f7ae2e59fb9|

De canonieke prefix is vóór/na de bouw en na de private conversie volledig onveranderd:15082 entries, oorspronkelijke paden/types/modes/bytes/hashes; gzipinventorySHA89751255ff5f62cf1399360713f10481272977853e14c271c2d112e55cbbb212. De private kopie heeft daarna15084 entries, inventorySHA637e870a9769d361366ea95345acc76770c0ad87c12e486c7de04bf9444932a6. Alle14 originele snapshots zijn lokaal read-only op hun SHA/gzip/entrycount gecontroleerd; de voor/na-delta is onafhankelijk herberekend. De ZIP bevat alle oorspronkelijke snapshots. Twee geselecteerde voor/na-inventarissen zijn hier apart toegankelijk.

Het loaderlog toont `calling init: /lib/x86_64-linux-gnu/libfontconfig.so.1`. Dit bewijst niet welk codepad de twee bestanden schreef; inhoudelijke UUIDbytes zijn niet apart in het artifact opgenomen. Geen generieke cache-uitzondering, mode-normalisatie, acceptatieverlaging of automatische herproef toegepast. De precieze entrydelta van de oude45381046100 blijft historisch onbekend: deze nieuwe observatie wordt daar niet achteraf als bewezen oorzaak ingevuld.

Het converterrapport blijft `passed=false`. De control-/patched-conversies, onafhankelijke61-cell/4-formula-oracle in deze run, engine-edit/UndoRedo/save/nieuw-proces-heropenen zijn **NIET UITGEVOERD**. Oude begrensde oorspronkelijke converterfouten blijven geldig op hun eigen bron. Native/browser/andere OS en productie-integratie zijn evenmin bewezen. #381 blijft open.

Artifact14916663707 is éénmaal opgehaald en tegen officiële grootte12659429B/SHA256 `276080f66922453ed000976f19b0a07cbed53d7476200f513afcb4fb182bb357` volledig gecontroleerd;68 members zijn veilig uitgepakt en geïnventariseerd. De blijvendeZIP, officiële metadata inclusief expiry en ruwe faallog staan hier. `proof.json` bindt de geselecteerde originele bestanden. Absolute epochs: start1795520935=11:48:55Z, prep11:58:55Z, build/test12:23:55Z, finale12:33:55Z. Deadline en engine/SSR-cleanup slagen. Geen lokale GUI, opname of eigen testserver gebruikt. Op integratie-instructie geen nieuwe CI/runtime/correctie terwijl de afzonderlijke combinatiecontrole loopt.
