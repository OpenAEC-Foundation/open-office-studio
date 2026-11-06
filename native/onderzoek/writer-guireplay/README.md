# Exacte Writer-GUI-invoer opnieuw door de Rust-kern

Afzonderlijk Linux-onderzoek met één eigen vaste documentkopie. Geen wijziging
van appcode, gebruikersprofielen, documenten, referentiebinaries of releases.
Vereist de behouden lokale bronnen, binaries, afhankelijkheden en GUI-tools.
De uitvoermappen moeten nieuw zijn; bestaande proeven worden niet overschreven.

```sh
python3 native/onderzoek/writer-guireplay/opnemen.py
node native/onderzoek/writer-guireplay/herhalen.mjs
python3 native/onderzoek/writer-guireplay/cijfers.py
OFFICE_GUIREPLAY_UIT="$PWD/.local/doorwerk-2026-11-06/guireplay/tellerherhaling" node native/onderzoek/writer-guireplay/herhalen.mjs --cijfers
```

De opname gebruikt de volledige bestaande fysieke toets-/raster-/bronproef,
met eigen Xvfb, DBus, XDG en documentkopie. Alleen een test-WebView-fetchwrapper
wordt toegevoegd. Zij bewaart maximaal 256 sequentiële aanvragen/antwoorden en
16 MiB JSON-tekens. Dit is bewust een opname van de **eigen openbare fixture**,
inclusief volledige eerste bronbytes en getypte tekst; geen observator voor
gebruikersdocumenten. Niet installeren in de gewone app of een gebruikerssessie.
De argumenten, antwoordobjecten en oorspronkelijke transportfouten blijven
behouden. Overschrijding of overlap keurt deze onderzoeksopname af. Stoppen
herstelt fetch; de read-only invoke-functie wordt niet vervangen.

De herhaling gebruikt alle werkelijk opgenomen aanvragen, dus ook hun echte
batchgrenzen, client, vector, basis en documentbinding. Vier ronden in ABBA-
volgorde op de behouden gemeten referentie en cachekern. Alle antwoordvelden
behalve de gemeten voorbereidingsduur moeten exact gelijk zijn aan de GUI-
antwoorden, met uitsluitend de bestaande protocolverpakking van schema 1
naar schema 2. Er worden geen voorstelbytes opnieuw uit tekst afgeleid.

Een onafhankelijke SDK-sessie voert dezelfde tekstacties uit. Alle verhalen,
opmaak, identiteiten, selectie, Undo/Redo en uitgepakte DOCX-onderdelen worden
vergeleken; heropening controleert alle alinea-/celteksten. Het native faselog
moet iedere voorbereiding bevatten en alle vervolgaanvragen als hergebruik
melden. Dit is rechtstreeks kernbewijs voor deze herhaling; geen intern
uitgelezen reused-vlag van de oorspronkelijke GUI of algemeen stabiliteitsbewijs.

De tellerversie kopieert de bewaarde replicacachebron en zijn Cargo-cache naar
een nieuwe eigen map buiten de native workspace. Alleen twee kernbestanden
veranderen: een leesaccessor voor reeds bestaande teller-/gewichtvelden en
extra stderr-metadata rond het bestaande snapshot. Encoder, cache, grenzen,
bronbinding en antwoordbytes blijven gelijk. Bronhashes en afzonderlijke ELF-
identiteit zijn verplicht. De tellerversie draait dezelfde volledige inhouds-
poort, maar haar tijd is geen extra vergelijkingsronde. Boekhoudgewicht is geen
allocator-/RSS-grens. Er worden geen oude targets of negatieve binaries vervangen.

De eerste vier ronden blijven afzonderlijk bewaard. Een latere scriptversie
voegt de expliciete `--cijfers`-route en eigen scriptdigest toe; ook die complete
vier-rondenroute wordt opnieuw uitgevoerd. Zie het bijbehorende testverslag
voor de werkelijke uitslagen, eventuele afkeuringen en acceptatiegrenzen.

De extra definitieve ABBA-herhaling heeft een waargenomen andere compiler en
telt uitsluitend als gegevenscontrole. De eerste reeks blijft apart; geen
nieuwe desktop-/algemene snelheidsacceptatie. `vastleggen.py` controleert de
bron-/binaryhashes, negen kernronden, documentpixels en alle bewijsbestanden.
Gebruik `--controleer` om het bestaande archief zonder overschrijven te toetsen.
