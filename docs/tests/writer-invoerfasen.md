# Brongebonden Writer-invoermeting

45.49 voegt uitsluitend een optionele lokale tijdregistratie toe aan de eigen
Rust-invoerkoppeling. Dit is geen snelheidsreparatie of herstel van de
incidentele Wasm-geheugenfout. De Rust-werkruimte blijft alpha57 en de
bruikbare interface blijft React/TypeScript binnen Tauri.

De registratie staat standaard uit: de invoerroute vraagt dan geen meetklok
op en maakt geen meetobject aan. Een expliciete lokale start via
`window.__OPENAEC_WRITER_INVOERMETING__.start()` registreert maximaal 1.024
bewerkingen, ook wanneer aanvragen nog onderweg zijn. `stop()` beëindigt de
opname en geeft een kopie van de tellers terug. Late meetpunten kunnen niet
in een opnieuw gestarte opname belanden. Sessies en levensduren hebben alleen
lokale volgnummers; er worden geen teksten, bestandsnamen, paden,
documentidentiteiten, bronvectoren of foutberichten opgeslagen.

De bestaande bron-/eigenaar-/versiebewaking, transport-promise, invoerwachtrij,
bronmutaties, terugvalroutes en foutafhandeling blijven behouden. Er zijn geen
extra awaits, timers of aangepaste native transportfuncties. De stappen zijn
cursorbinding, bronopbouw, hash, aanvraagopbouw, transport, antwoordbinding,
mutatie en selectie. Transport en hash bevatten ook wachttijd op de
hoofdthread; de bestaande `preparationMs` is uitsluitend de beperkte
Rust-binnenmeting van geaccepteerde antwoorden. SDK-publicatie en werkelijk
tekenen volgen deels na deze koppeling en zijn hiermee niet volledig gemeten.

Zes registratieproeven toetsen de uitgeschakelde klok, sessies/levensduren,
stop/herstart, de harde grens inclusief lopende aanvragen, gegevenskopieën
en geldige binnenmetingen. Vier aanvullende werkelijke SDK-proeven toetsen
bronupdates, selectie, Undo/Redo, late antwoorden en transportfouten.
De eerste bytevergelijking maakte twee onafhankelijke SDK-antwoorden aan;
de afkeuring toont een verschillende attribuut-/klokvolgorde. Die log blijft
bewaard. De definitieve controle speelt dezelfde werkelijk aangemaakte
delta's af met de registratie aan en uit en eist bytegelijke bronupdates,
bronvectoren, inhoud en selectie. Er wordt geen bytegelijkheid tussen twee
onafhankelijk gegenereerde SDK-antwoorden geclaimd.

De volledige 1.860 frontendtests, TypeScript, 77 Python-tests, engines,
tien opdrachten en weekcontrole slagen. De eerste Linux-bouw faalt op precies
een ontbrekend gegenereerd updater-permissiebestand. Alleen de bijbehorende
Cargo-pakketcache is opnieuw opgebouwd; de eerste afkeuring en de gerichte
cachehandeling blijven behouden. Bronhashes zijn vóór en na de bouw bewaakt.
Platformen en zeven edities moeten voor deze bron afzonderlijk in CI worden
gecontroleerd. De eerdere groene 45.48-matrix bewijst dat niet voor 45.49.

De native ronde bevestigt 68 geaccepteerde bewerkingen binnen dezelfde
sessie/levensduur, zonder overgeslagen meetpunten. De eigen koppeling kost
samen 8.913 ms, waaronder 7.408 ms transport en 6.536 ms beperkte Rust-binnentijd.
Cursorbinding kost slechts 82 ms; bronopbouw 177 ms, hash 165 ms, aanvraagopbouw
13 ms, binding 58 ms, bronmutatie 394 ms en selectie 614 ms. De volledige alinea
is na 23.295 ms getekend. De overige tijd bevat onder meer invoerplanning,
SDK-publicatie en tekenen, maar is niet verder bewezen uitgesplitst.

De vier rustige ronden 48/49/49/48 duren 22.648 / 22.422 / 23.519 / 22.676 ms.
Het kandidaatgemiddelde is circa 1,36% hoger; dit levert geen snelheidswinst
of algemene prestatieacceptatie op. Alle 3.329 teksten in 1.537 verhalen blijven
exact. De documentuitsnede 820×740 heeft nul verschillende RGB-pixels met alleen
de vaste cursorzone uitgesloten. Dit bewijst geen volledige UI-pixelpariteit.

Negen native scenario's slagen: de vier vergelijkingsronden, de ingeschakelde
fasemeting, native tekstinvoer/selectie, 500 pagina's met bewaren/heropenen en
herstel plus twintig GC-ronden, acht rijke plakronden, en vasthouden van native
antwoorden met bewaren/verwerpen. De eindbeelden van de fasemeting en de
herstelde kopie zijn bekeken. De oorspronkelijke CI48-geheugenafkeuring is
hiermee niet verklaard of hersteld. Alle 118 opnieuw geïnventariseerde issues,
tien migratiegebieden en dertig acceptatievlaggen blijven open.

Vervolg: SDK-publicatie/tekenen en het Rust-binnenwerk afzonderlijk profileren.
De kleine cursorfase is geen aangetoonde grote optimalisatiekans. Het eerder
fysiek tragere mutatiejournaal wordt niet blind opnieuw ingevoerd. De
gecontroleerde Linux-devdownload blijft 45.48 totdat een nieuw pakket zijn
eigen controle heeft doorstaan. Er is geen officiële release gepubliceerd.

[Exacte bronnen, eerdere afkeuringen, metingen, proeven en beelden](2026-11-05-writer-invoerfasen-49.json).
