# Begrensde diagnose van de eigen native Writer-invoer

Onderzoek op de behouden 45.49-ELF en één vaste eigen documentkopie, met eigen
Xvfb/DBus/XDG. Geen apppatch, gebruikerssessie of snelheidsacceptatie. Vereist de
bestaande lokale binaries, rasterreferentie, GUI-tools en afhankelijkheden.

`meten.py` maakt een nieuwe uitvoermap en voegt aan de bestaande fysieke proef
uitsluitend de testobservator toe. `meting.js` zoekt de unieke invoerwachtrij
via het eigen verborgen invoerveld; dat veld kan buiten de documentcontainer
staan. Overlap met andere documenten is geen geaccepteerde meetopzet.

De observator omwikkelt `admit`, twee bronmutatiemethoden, geselecteerde
synchrone bronlezingen en native fetch. Het oude taak-/transportresultaat wordt
teruggegeven, fouten blijven behouden. Bij Promise-taken observeert één extra
reactie het einde; dit is instrumentatie, geen passieve snelheidsvergelijking.
Toetsen worden alleen geteld; geen letters, document-ID, bronbytes of selectie-
inhoud in de metadata. Maximaal 4.096 gebeurtenissen en 4.096 rAF-metingen,
met expliciete overschrijdingsteller. Lezingen zijn inclusieve wandtijden;
methoden kunnen genest zijn en mogen niet als losse CPU-seconden worden opgeteld.

De verdiepte versie volgt tevens workerberichten: alleen eigen workerindex,
richting, beperkte protocoletiketten en veldnamen, nooit veldinhoud. Niet
herkende berichttypen blijven `ander`; veldnamen maken antwoorden herkenbaar.
De JS-regressie toetst ook behoud van postMessage-argumenten/retourwaarde en
herstel van methode-eigendom en toegevoegde luisteraars. Stoppen herstelt alle
methoden, luisteraars en de optionele bestaande fasemeting.

Tijdens de rasterpolls wordt één begrensde tussenopname opgehaald, zonder
editor-/bron-/layoutquery; dit is ook een reden om geen passieve tijdclaim te
doen. Bij rasterafkeuring worden nog beschikbare metadata en fouten vóór het
sluiten vastgelegd. De proef bevat alle oude bron- en pixelasserties.

Twee geslaagde versies blijven apart. De eerste heeft alleen wachtrij/
transport/mutaties en de bestaande fasemeting; de tweede voegt bronlezingen en
workerberichten toe. Geen onderlinge snelheidsvergelijking. `analyseren.py`
vereist complete taakparen, alle echte tekens en bijbehorende native aanvragen,
geen afwijzingen/overgeslagen data en exact behouden verhaalteksten. De
Python-rasterstart en JS-meetstart gebruiken aparte klokken: teken-naloop is
een benadering. rAF-intervallen zijn geen echte beeldscherm-FPS.

De eerste selectoropzet, een syntaxfout in de teststub en een volledige
90-secondenrasterafkeuring blijven behouden. Die rasterafkeuring heeft geen
bruikbare tijdlijn; haar oorzaak is niet vastgesteld. De latere geslaagde
proeven verklaren of herstellen haar niet. Geen tijdgrens/assertie versoepeld.
Een andere compiler in een afzonderlijke bronkopie is waargenomen; deze proeven
zijn uitsluitend voor fase-/wachtrijdiagnose.

De benodigde plaatselijke volgorde staat in het verslag. De normale
`meten.py`-uitvoermap moet nieuw zijn; bestaande bewijzen worden nooit vervangen.
`vastleggen.py --controleer` verifieert het gepubliceerde bewijsarchief.
