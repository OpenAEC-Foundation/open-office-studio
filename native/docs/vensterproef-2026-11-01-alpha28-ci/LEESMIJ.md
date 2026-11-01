# Echte Spreadsheet-vensterproef alpha 28

Het vastgezette **CI-Linux-programma 2026.44.9-alpha.28** slaagt op 21 gerichte stappen in een eigen Xvfb-/D-Bus-sessie. De XDG-mappen zijn vóór de sessiebus geïsoleerd. [herkomst.json](herkomst.json) koppelt de exacte broncommit, beide programmaversies en hashes. De hele uitgepakte pakketbron is bytegelijk aan het vaste Git-archief gecontroleerd.

De achttien controles uit alpha 27 blijven behouden: muisbereik, anker, opmaak, herberekening, platte blokkopie, directe plak/Enter/bewaren, opeenvolgende celinvoer, bronexacte undo, Unicode via systeemklembord, Bestand en een schoon gesloten en heropend eigen venster. De [proefbron](proefbron.py) vermeldt per oudere controle haar afzonderlijke wachttijd en eventueel herhaald bewaren.

Drie aanvullende stappen controleren **F2/Home/7/Enter en één bewaren zonder tussenpauzes**, met B2=73 als resultaat. Daarna volgt **8/Enter en één bewaren zonder nieuwe klik, adreslezing of focusherstel** tussen bewaren en de volgende invoer: B3=8 en bestemming B4. Het bestand wordt uitsluitend geobserveerd; geen extra bewaaropdracht kan een verloren Ctrl+S verbergen. Twee undo-opdrachten en één bewaren herstellen de oorspronkelijke bronbytes.

De drie in het [beoordeelde rapport](rapport.json) genoemde volledige beelden zijn bekeken: B2=73/B3=8 met B4 als bestemming, het werkelijke bestandsscherm zonder documentlint/raster en het huisteken in G10 na bewaren en opnieuw openen. [automatisch-rapport.json](automatisch-rapport.json) blijft ongewijzigd. Dit is gerichte visuele goedkeuring, geen volledige pixelpariteit.

Geen fysieke hardware, volledige suite-/Unicode- of functiedekking, Windows/macOS-bediening, echte IME-compositie, systeemdialoog of schermlezerproef. De eerste onvoldoende Bestand-controle van alpha 27 blijft in haar eigen dossier afgekeurd; deze proef gebruikt vanaf het begin de aangescherpte schermtoestandscontrole.
