# Bladnavigatie bij veel werkbladen (#61)

Basis: `f4a03889eff1306fe503a72d7acb21c754d5ac8d`. Dit is een afgebakende
verbetering binnen #61; de brede issue blijft open.

## Gedrag

- Vaste knoppen Vorig blad en Volgend blad naast Alle bladen.
- De knoppen volgen de werkelijke bladvolgorde en slaan hidden/veryHidden over.
  Aan de uiteinden en bij één zichtbaar blad staan ze uit.
- De actieve tab komt horizontaal in beeld na navigatie of een wijziging van
  de vensterbreedte, zonder het raster of de pagina verticaal te scrollen.
- Lange bladnamen blijven op één regel. De navigatieknoppen blijven buiten
  het scrollgebied, zodat ze geen tabs afdekken.
- Labels in alle negen aangeboden interfacetalen.

Geen wijzigingen aan werkmapinhoud, bladstructuurbescherming, notities of
pakketrelaties. Geen nieuwe sneltoetsen.

## Controle

`scripts/proef-bladnavigatie.mjs` maakt een echte werkmap met 26 lange
bladnamen en drie verborgen bladen, waaronder één veryHidden. De proef
opent die in de volledige productiebouw in Chromium en controleert:

- 23 zichtbare tabs, verborgen bladen overslaan in beide richtingen;
- uitgeschakelde eindknoppen;
- navigatie naar het laatste/eerste blad via Alle bladen;
- actieve tab zichtbaar in beide richtingen, ook bij 640 px vensterbreedte;
- activeren van de volgende-knop met Enter;
- geen overlap tussen navigatie en tabs, lange namen op één regel;
- beide knoppen uit na het openen van een werkmap met één blad;
- geen paginafouten.

Dezelfde proef met `OOS_PROEF_BASELINE=1` tegen een bouw met de originele
`RekenbladExtra.tsx` en tab-CSS bevestigt dat de pijlen ontbreken en de
actieve laatste tab na selectie uit de lijst buiten beeld blijft.

TypeScript en Vite-productiebouw slagen. De browserproef en visuele controle
van de smalle weergave slagen. De bestaande testsuite met twee workers geeft
1.986 geslaagde tests, tien bestaande corpusoverslagen en één fout wegens
de aanvankelijk ontbrekende navigatielabels in zeven talen. Na toevoeging
van die labels slaagt de volledige betreffende i18n-testfile (17 tests),
inclusief de controle van alle aangeboden talen/namespaces. Daarmee zijn
alle 1.987 uitgevoerde tests geslaagd over deze runs. Er is geen tweede
volledige run na de labelcorrectie uitgevoerd.

De eerste onbeperkte run liep onder gelijktijdige builds tegen vijfseconden-
timeouts aan. De run met twee workers lost die op. Ook een afzonderlijke
i18n-run had eerst zo'n timeout; de succesvolle hertest kreeg 30 seconden
en voltooide de 17 tests in circa één seconde.

## Lokale bouwomgeving

De bestaande vastgezette node_modules zijn via een lokale junction gebruikt.
Omdat `@tauri-apps/plugin-clipboard-manager@2.3.2` daar ontbreekt, wijst een
genegeerde `.local/vite.check.ts` naar het exacte pakket dat een andere
issuecheckout al beschikbaar had. De TypeScriptcontrole gebruikt dezelfde
alias. De repositoryconfiguratie en afhankelijkheden zijn niet aangepast.
De volledige assetvoorbereiding stopte bij de ontbrekende extra-fontcache;
de productiebouw en browserproef gebruiken de meegeleverde fonts.

Een nieuwe native Windows-installer is niet gebouwd of getest. Deze wijziging
claimt geen afronding van de overige onderdelen van #61 (onder meer
verbergen/zichtbaar maken, tabkleuren, gegroepeerd bewerken en kopiëren
tussen werkmappen).
