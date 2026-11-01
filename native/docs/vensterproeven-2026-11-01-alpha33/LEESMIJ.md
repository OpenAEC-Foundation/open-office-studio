# Werkelijke alpha-33-releasevensters

Broncommit `b047a17675f790fbb19b08a58bea7d7d300e294e`. De lokale en CI-Linux-programma’s zijn afzonderlijk op versie en SHA-256 vastgezet. Eigen bestanden, Xvfb, D-Bus en afgeschermde XDG-mappen; geen bediening van gebruikersvensters.

De stijlproef slaagt op beide programma’s voor twintig stappen: de doelalinea via systeemklembord bevestigen, het werkelijke menu openen, Kop 1 kiezen en direct typen of Enter/9 gebruiken, één bewaaropdracht per stap, afzonderlijke undo-stappen met exact bronherstel, heropenen, systeemklembord en schoon sluiten. Vier daadwerkelijk bewaarde DOCX zijn onafhankelijk teruggelezen op tekst, stijl-ID, Inter 20, directe runopmaak, tabel/secties/kopvoet en ongewijzigde styles.xml. Per programma zijn drie rustige heropenbeelden bytegelijk en volledig visueel geïnspecteerd. Het werkelijk geopende menu is eveneens volledig bekeken.

De originele Writer-invoerregressie slaagt op het CI-programma voor elf stappen; de spreadsheetregressie voor zes stappen zonder voorafgaande celklik. Deze proeven zijn aanvullend; zij zijn geen volledige fysieke GUI-, platform-, toegankelijkheids-, corpus- of suitegoedkeuring.

Drie eerdere afgekeurde stijlproeven blijven ongewijzigd bewaard. De eerste klikte door de afwijkende alineaspatiëring van de eigen stijlinvoer een tabelcel. De tweede bevestigde de juiste alineatekst maar bewees geen geopend menu: de staptekst beweerde dit ten onrechte, terwijl het volledige beeld een gesloten keuzelijst toont. Beide bronnen bleven bytegelijk aan de invoer; zij bereiken de gekozen stijlactie niet en keuren die dus ook niet goed. De derde bevestigde de exacte cursorprefix en wachtte op de beschikbare pijl en het zichtbare menu; haar bron bevat daarna werkelijk de opgemaakte 9, maar de proef stopte op een ontbrekende hulpfunctie `klopt`. Ook dit oorspronkelijke foutresultaat blijft bewaard.

De geslaagde hertest herstelt uitsluitend die ontbrekende proefhelper. Zij behoudt de doel- en gereedheidsvoorwaarden, echte muis/toetsen, één bewaren per stap en directe vervolginvoer na de optieklik. Geen toegevoegd focusherstel of herhaald bewaren om verlies te verbergen. De beelddetectie herkent alleen beschikbaarheid; alle bewaarde beelden blijven volledige ruwe opnamen. Zij is geen masker of tolerantie voor pixelpariteit.

De geslaagde stijlproef wacht op een beschikbaar menu. De vroegere snelle navigatie-/openingsroute zonder die gereedheidsvoorwaarde blijft afzonderlijk niet goedgekeurd. Alle tien migratiegebieden blijven open; geen stabiele native vrijgave.
