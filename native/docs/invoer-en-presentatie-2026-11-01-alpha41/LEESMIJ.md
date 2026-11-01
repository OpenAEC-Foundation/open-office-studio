# Aanraakposities, schermpresentatie en bronbytes: alpha 41

De aanvullende alpha40-aanraakproef activeert rechts na een tik links. Alpha41 gebruikt voor drukken, verplaatsen, loslaten en annuleren de eigen positie van iedere aanraakgebeurtenis. Die proef en de drie bestaande muis-/cacheproeven slagen.

De afzonderlijke oorspronkelijke X11-kleurproef presenteert één kleur, maar de waarnemer ziet nog de oude achtergrond. Alleen expliciet verzenden van bestaande XCB-verzoeken maakt de kleur zichtbaar; er wordt geen nieuwe tekenronde of invoer gebruikt. De lokale softbuffercorrectie verstuurt die verzoeken na presenteren, zonder een extra roundtrip af te wachten. Dezelfde onafhankelijke contractfixture faalt tegen de oorspronkelijke bibliotheek en slaagt met de correctie. De reguliere Linux-integratietest start een eigen tijdelijk Xvfb-scherm, gebruikt een tweede waarnemerverbinding en vergelijkt alle 9600 pixels zonder extra flush of volgend frame. De startup heeft een vaste tijdslimiet. Dit is geen fysieke bediening op alle platforms.

Windows keurt alpha40 al vóór compileren af omdat Git de nieuwe runtimebron naar CRLF omzet. Een tijdelijke eigen index met core.autocrlf=true reproduceert afwijkingen in alle vijftig bestanden van de twee nieuwe vendors. Twee gerichte bytevaste vendorregels brengen dat terug naar nul. Oorspronkelijke bronhashes, bestaande logregels en referenties blijven behouden. De overige 649 dependencyversies en registrychecksums zijn gelijk aan alpha40.

Vijf gerichte proeven, Clippy en bronpins slagen. De eerste metadata-opstelling activeerde onbedoeld de KMS-standaardfeature; die is hersteld naar uitsluitend de al geteste X11-devfeatures. Een eerste contractopstelling bevatte een CStr-typefout; een latere Clippy-controle vroeg om de actuele array-chunk-API. Oorspronkelijke bronnen en logs blijven bewaard. De assertions en verwachte pixelkleur zijn niet versoepeld.

De volledige alpha41-ronde op 727 bytevast vastgelegde bronbestanden loopt nog. Alle bestanden zijn onafhankelijk vanuit de basiscommit en volledige patch hersteld. Geen voltooiingsclaim voor de suite.

De echte debugvensters blijven op de drie-seconden-menucontrole afgekeurd. Met langere wachttijd verschijnt de juiste toestand zonder extra invoer; die langere wachttijd is een diagnose en verlaagt de acceptatiegrens niet. De geoptimaliseerde alpha40-Linux-build van dezelfde alpha40-bron toont de menu-/Escape-toestand wel in de eerste opname. Een geoptimaliseerd alpha41-venster moet nog worden gecontroleerd. De oorspronkelijke debugafkeuringen zijn niet vervangen door de snellere vergelijking.

De ruwe bytes staan gekoppeld in bewijskopieen.json. Log- en patchbestanden zijn deterministisch gzip verpakt. Alle dertig migratieacceptaties blijven false; geen stabiele native vrijgave of volledige pixelpariteit.
