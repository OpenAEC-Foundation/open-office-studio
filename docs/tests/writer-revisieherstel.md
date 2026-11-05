# Gerichte revisiecorrectie 45.43

De Rust-codec kon na een volledige reconstructie dezelfde revisie-ID opnieuw
uitgeven. In de oorspronkelijke negatieve proef verwijdert het verwerpen van
auteur A daardoor ook de tekst van auteur B. Die bron, uitvoer en negatieve
testidentiteit blijven afzonderlijk bewaard.

`2026.45.43` / Rust `alpha57` gebruikt voor native revisies een eigen naamruimte
en een blijvende teller per client in de bevestigde Yrs-bron. Alleen overgenomen
voorsteldelta's maken de teller blijvend. Bestaande eigen revisies vormen een
ondergrens; GC na verwerpen mag een identiteit niet vrijgeven. Ongeldige of
uitgeputte tellers geven geen gedeeltelijke delta. Iedere nieuwe revisie
reserveert ook de oorspronkelijke lokale tellerstap, zodat de allocatievolgorde
van andere nieuwe identiteiten, zoals alinea's, gelijk blijft.

De afgekeurde bronjournaal- en callbackoptimalisaties uit 45.40–45.42 zijn niet
behouden. De React-, styling- en dependencybron is gelijk aan de gecontroleerde
45.39-basis. Dit is een gerichte codecstap, geen volledige Rust-interface.

## Controles en grenzen

35 Rust-proeven, gerichte Clippy, zes pakketformatcontroles, TypeScript,
1.819 frontendtests, 77 Python-tests en de Linux-productiebouw slagen.
De warme/coude bronproef vergelijkt 80 stappen met wisselende auteurs en
celverhalen byte-exact, zonder revisie-ID-normalisatie.

41 rijke plakgevallen en 15 tekstgevallen vergelijken alle verhalen, opmaak,
bestaande identiteiten, cursor, Undo/Redo en alle uitgevoerde DOCX-onderdelen.
Uitsluitend nieuw gemaakte revisies krijgen een gecontroleerde bijectie tussen
de oude SDK-naamruimte en de native naamruimte. Auteurs, rollen, verhalen en
bereiken blijven gelijk. Zeven gerichte controleproeven weigeren onder meer
samengevoegde/gesplitste revisies, gewijzigde bestaande ID's, verkeerde auteurs,
gewijzigde alinea-ID's en ongeldige tellers. De eerdere strikte afkeuring met
verschoven nieuwe alinea-ID's blijft bewaard; de tellerstap herstelt die volgorde.

Acht afwijzingen leveren geen gedeeltelijke uitvoer. De grote bron groeit van
128 naar 256 tabellen, met 1.537 verhalen, bronexacte geschiedenis en heropenen;
alle 14 DOCX-onderdelen zijn bytegelijk aan de referentie. Een aparte echte
Wasm-/DOCX-proef verwerpt drie auteurs onafhankelijk, ook na heropenen.
Deze debugprotocoltijden zijn geen prestatievergelijking.

Tien gewone native GUI-scenario's slagen op de bevroren Linux-binary
`3ea2fb22…`. Vier fysieke invoerronden meten 22.380 / 23.893 / 23.640 / 23.088 ms
voor 39/43/43/39. De nieuwe ronden zijn in deze beperkte reeks gemiddeld circa
4,5% later. De ernstige invoervertraging blijft open; geen snelheidswinst of
algemene prestatieacceptatie wordt geclaimd. Alle 3.329 alinea-/celteksten blijven
exact. De documentuitsneden zijn buiten de knipperende cursor pixelgelijk.

De [twee aanvullende native revisie-GUI-proeven](2026-11-04-writer-native-revisie-ui.json)
zijn afgekeurd. Rechtstreeks de provider met één publicatiecallback aanroepen
is geen volledige SDK-mutatiecyclus; de bron verandert, de weergave blijft achter.
De echte huidige invoer- en plakcallbacks sluiten wijzigingsregistratie van de
native route uit en gebruiken daar de SDK. Die gebruikersflow is dus nog niet
naar de native codec gemigreerd. De gewone tien GUI-scenario's bewijzen daar
geen oplossing voor.

[Bronidentiteit, ruwe proeven, beelden en pakketvergelijkingen](2026-11-04-writer-revisieherstel.json).
Geen issue of migratievlag is gesloten. De nieuwe platform- en zeveneditiecontrole
moet afzonderlijk slagen; er is geen officiële release gepubliceerd. Eerdere
worker-/geheugen- en grafische afkeuringen blijven open.

## Afgekeurde eerste platformronde

De eerste 45.43-ronde op `99358ac` faalt op tien platformtaken vóór de appbouw:
een nieuwe zelfstandige `node:test`-controle werd door haar `.test.mjs`-naam
ook door Vitest verzameld. Het log meldt `No test suite found`. De eerdere
lokale frontendronde was uitgevoerd vóór het toevoegen van dit zelfstandige
bestand en dekte deze testindeling dus niet.

Het bestand is met ongewijzigde inhoud hernoemd naar
`controleer-revisie-bijectie.mjs`; beide expliciete Node-CI-opdrachten zijn
bijgewerkt. De volledige lokale herhaling slaagt met 1.819 Vitest-tests in
173 bestanden en dezelfde zeven Node-controles. Runtimebron en de bevroren
Linux-binary blijven ongewijzigd. De nieuwe platform-/editiehertest moet nog
afronden. [Afkeuringen, bytegelijke controle en hertest](2026-11-04-writer-testindeling-43.json).
