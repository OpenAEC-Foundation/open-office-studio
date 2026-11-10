# Integratieronde 2 — 10 november 2026

Bronintake gesloten om **13:15 Europe/Amsterdam**. Uiterste veilige overdracht: **15:30**. `main`, officiële releases en issue-sluiting zijn niet toegestaan.

Deze ronde voegt **21 vrijgegeven leveringen** toe aan basis `959f04830e1ccc58b70d0cd7d1d4ac1d86d37aa1`. Het gecombineerde broncodepunt vóór deze rapportcommit is `772a44a5983a24ab5d97e9d4c025ba69bdbbe494`. Totaal: **89 bron-PR's / 99 leveringen**, plus17 eerdere PR's in bundels. Exacte bronheads/mergecommits staan in het [centrale register](integratie-2026-11-09.md) en het [ronde-2-rapport](integratie-ronde2-2026-11-10.json).

De gerichte integratiecontroles slagen met **464 tests**. Dit is nog geen certificering van de volledige combinatie: de volledige suite, normale/hosted builds, echte browserroutes, nieuwe platform-CI en native Windows-acceptatie volgen op één vast codepunt. De eerder geïnstalleerde1e5-versie blijft de veilige referentie totdat de Windows-operator een expliciete nieuwe installatievrijgave ontvangt.

Opgenomen: Writer-schermthema/kleurbereik, lege bibliografiewaarschuwing, PDF-fontcache, reply-initialen, spellinggeometrie, review-Undo en tekenopmaakvergelijking, exacte afbeeldingsvervanging, PDF-veldlettertypen; Spreadsheet-CF/pivots/ingebouwde en impliciete tabelstijlen, structuurregressies en gecontroleerde startup/trendlijnkern; Presentatie-ODF-volume/medianamen/replay en helewoordenzoekoptie. De oude teruggetrokken reviewheads zijn niet opgenomen. Afhankelijkheden315→306 en304→316→328 zijn eenmaal toegepast en expliciet herleidbaar.

De Spreadsheet-kern is de gevalideerde **15-patch-superset**, SHA256 `2b1b74a572ad97bfe0f5bf25798fd123a46505a85b80a477792a180a13deddad`, **7794993 bytes**. De eerste14 patches zijn bytegelijk aan319; de15e is de onafhankelijke lineaire-trendlijnpatch. ZIPdigest, alle15 patchhashes, pinmetadata en identieke import/export-ABI zijn gecontroleerd. De strikte actieve checksum is naar precies dit bewezen artifact gesynchroniseerd; controles zijn niet uitgeschakeld. Dit bewijst geen volledige100k×30- of nativeplatformacceptatie.

Uitgesteld: #327 taalstatus en PR317/#30 gebundelde runtime hadden vóór13:15 geen ontvangen vrijgegeven bronpunt. Hun eigen branches/PR's blijven behouden voor volgende week. Geen extra bronintake na de cut, alleen noodzakelijke aangetoonde acceptatiecorrecties.

Alle platform-/native-/browserlimieten blijven afzonderlijk zichtbaar. Live Y-app-opslag blijft uitgesloten. Oude bron-CI geldt niet automatisch voor de nieuwe combinatie. Overbodige documentatie-only CI-kopieën van1e5 zijn geannuleerd met behoud van afgeronde job-/artifactbewijzen; de nieuwe combinatie krijgt eigen controles.

Vóór een latere expliciet toegestane main-merge moet ook de geërfde commit-sluittekst worden beoordeeld. De exacte gevonden commits/issues staan in JSON; een lege PR-sluitlijst neutraliseert zulke broncommits niet. Er wordt nu niets gesloten of naar main gemerged.
