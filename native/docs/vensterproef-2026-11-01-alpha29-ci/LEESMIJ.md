# Werkelijke Writer-vensterproef, alpha 29

De vastgezette CI-Linux-release uit ronde `41265333745` van bron `cf35322ccf19fc8981ee63592d4892f54349e5fd` slaagt op achttien gerichte stappen. Toetsen en systeemklembord lopen via een eigen X11-, D-Bus- en XDG-sessie; uitsluitend eigen DOCX-kopieën worden gewijzigd.

[Het rapport](rapport.json) bewaart de afzonderlijke stappen en programmahash. Enter en directe vervolginvoer, beide samenvoegtoetsen, echte tussentijdse bronwijzigingen vóór undo, zachte regelovergang, bronexact herstel, schoon sluiten en opnieuw openen zijn gecontroleerd. Drie volledige [vensterbeelden zijn bekeken](visuele-beoordeling.json).

Dit is geen bewijs voor alle Writer-functies, volledige interfacepariteit, fysieke hardware, Windows/macOS-bediening, IME of schermlezers. Screenshots kunnen tijdens asynchrone klembordacties tijdelijke lintstatus tonen; de bron- en cursoraanspraken worden afzonderlijk gecontroleerd.

De Linux-build en de verpakte bron slagen afzonderlijk. De oorspronkelijke gezamenlijke CI-taak blijft afgekeurd wegens haar oude verwachting van 49 beelden. Deze vensterproef keurt die CI-taak niet alsnog goed.
