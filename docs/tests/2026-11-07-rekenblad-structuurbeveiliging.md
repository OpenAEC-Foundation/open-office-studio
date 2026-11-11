# Rekenblad: bestaande structuurbeveiliging respecteren

Deze vervolgbundel loopt de tien rekenbladissues #59, #60, #61, #66, #67, #68,
#69, #71, #72 en #73 na. De nieuwe, zelfstandig bevestigde fout betreft de
structuurbeveiliging uit #72 en de bladbewerkingen uit #61. De brede issues
blijven open; andere nog ontbrekende functies zijn hiermee niet voltooid.

## Voorproef en reparatie

Een synthetische XLSX heeft twee bladen en expliciet
`workbookProtection lockStructure="1"`. Met de ongewijzigde rekenkern konden
bladen alsnog worden verplaatst, hernoemd en toegevoegd. In de bestaande
native app voegde Blad invoegen ook werkelijk een derde tab toe. De oorspronkelijke
bestandvlag is onafhankelijk in de ZIP/XML gecontroleerd.

De aansluiting installeert nu vóór de eerste invoer een begrenzing op de echte
werkmaphandle. Een opdracht die toevoegen, verwijderen, verplaatsen of hernoemen
bevat, wordt bij actieve structuurbeveiliging in haar geheel geweigerd. Ook een
gemengde opdracht krijgt geen gedeeltelijke wijziging. De foutmelding staat in
de negen aangeboden interfacetalen. Gewone celbewerkingen worden niet door deze
structuurvlag geblokkeerd.

De lezer volgt de interne hoofdrelatie en pakt uitsluitend de relatie en
werkmapmetadata uit. Zij maakt geen extra volledige werkbladexport om de vlag
te vinden. Een ontbrekende vlag, `0` en `false` geven geen structuurbeveiliging;
`1`, `true` en een onbekende aanwezige waarde worden niet als toestemming
uitgelegd. Het openen van een volgende werkmap gebruikt een eigen handle en
neemt deze toestand niet van de vorige over.

## Automatische controles

- Acht regressies gebruiken de echte rekenkern: actieve en inactieve vlaggen,
  alle vier structurele opdrachten, een gemengde opdracht zonder deelwijziging,
  toegestane celbewerking, opgeslagen bescherming en opnieuw openen.
- De metadatalezer volgt ook een afwijkend werkmappad uit de hoofdrelatie. Dit
  is een proef van de metadatalezer, geen volledige formaatacceptatie van die
  afwijkende werkmap.
- **1.995 tests in 176 bestanden slagen**, tien bestaande corpusgevallen
  overgeslagen; twee workers, 169,86 seconden, exitcode 0.
- Alle 58 Python-controles, TypeScript en de scripts voor echte kantoorengines
  en moduleopdrachten slagen.
- Productiefrontend en native bouw slagen. De native proef voert exact de
  vastgelegde productbronnen uit.

De eerste revisie `2ce72ec6` faalde lokaal en in CI op TypeScript TS18046.
Het eerste verslag vermeldde die controle ten onrechte als geslaagd. De
correctie vernauwt onbekende opdrachten vóór het lezen van `type`. Daarna
slagen de afzonderlijke typecontrole, volledige suite en nieuwe frontend/native
bouw; de onderstaande bediening en bestandscontrole zijn volledig herhaald
met die nieuwe binary.

## Native Linux en onafhankelijk bewaarde bestanden

Bediening gebeurt met echte muis- en toetsenbordinvoer in een eigen X11-omgeving
en een eigen profiel. Een beschermde en een vrije werkkopie zijn tegelijk open.

1. Blad invoegen wordt bij de beschermde werkmap geweigerd: twee tabs blijven.
2. Hernoemen, verwijderen en kopiëren tonen dezelfde duidelijke reden in hun
   venster, zonder een andere naam, extra blad of gewijzigde documentstatus.
3. A1 op het eerste blad wordt van 13 naar 17 veranderd en met Ctrl+S bewaard.
   De afhankelijke formule op het tweede blad geeft 34; handcontrole: 2 × 17.
4. De vrije werkmap staat invoegen, hernoemen en verwijderen wel toe. Daarna
   blijven de oorspronkelijke twee bladen over en kan het bestand worden bewaard.
5. Sluiten en opnieuw openen van het beschermde bestand via de echte
   tweede-instantieroute behoudt A1 = 17, de uitkomst 34 en de structuurvlag.
   Een volgende poging om een blad toe te voegen wordt opnieuw geweigerd.

Python leest de werkelijk door de app bewaarde ZIP/XML na. In het beschermde
bestand staan `lockStructure="1"`, beide oorspronkelijke namen, A1 = 17 en de
formule met cache 34. De vrije werkmap houdt `lockStructure="0"`, de twee namen,
13 en 26. Beide bestanden behouden het onbekende proefonderdeel bytegelijk.

De fixtures gebruiken uitsluitend neutrale namen en vaste proefwaarden. Hun
ZIP-datum is bij samenstellen expliciet 1 januari 2026; de proef hangt niet af
van de huidige kalenderdatum. De afzonderlijke bronbestanden blijven ongewijzigd.
Het door de app gemaakte resultaat wordt apart bewaard.

Vroege harnaspogingen hadden een onjuist aangebrachte XML-vlag, kozen na starten
het vrije document of wachtten op een statusklasse die alleen bij Writer bestaat.
Deze pogingen tellen niet mee als geslaagde productproef. De gecorrigeerde
voorproef controleert de echte vlag; de eindproef selecteert en controleert het
bedoelde document expliciet en wacht op zijn werkelijke blad- en bewaarstatus.
Alle eigen proefprocessen zijn na afloop afgesloten.

[Meetgegevens en hashes](rekenblad-structuurbeveiliging-controle.json),
[synthetische bronnen en werkelijk bewaarde bestanden](rekenblad-structuurbeveiliging)
en [het visueel gecontroleerde native scherm](../screenshots/test-structuurbeveiliging-2026-11-07.png).

## Grenzen

Dit voegt geen venster toe om bescherming met een wachtwoord in te stellen of
op te heffen. De verdere matrix voor beschermde cellen, toegestane acties en
verborgen formules blijft onderdeel van #72. Tabkleuren, verbergen/zichtbaar
maken, slepen, meervoudige bladbewerking en kopiëren tussen werkmappen blijven
onder #61 open. De bestaande algemene importwaarschuwing over onvolledige
beschermingsondersteuning blijft daarom terecht zichtbaar.

De bestaande Tauri/React-app is de scope. De openbare v2026.45.4-installers en
het parallelle native Rust-traject zijn niet gewijzigd.
