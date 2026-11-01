# Windows-checkout bewaart de parserbronbytes

De Windows-taak van ronde `41268771798`, bron `c752341ab177ad4685dcd29abe71e687dcaf1292`, stopt terecht op de vastgepinde spreadsheetparserhashes. Voor de nieuwe vendormap ontbrak de regel die Git-tekstconversie uitschakelt. De oorspronkelijke CI-afkeuring blijft behouden; zij wordt niet omzeild door de bronhashes te wijzigen.

Een uitbreiding van de bestaande checkoutproef met zowel LF als CRLF reproduceert de fout: de LF-bron wordt CRLF. Na dezelfde `-text -whitespace`-regel als voor de overige gepinde vendors slagen alle zeven Python-tests. Een aanvullende werkelijke Git-index en checkout met `core.autocrlf=true` bewaart alle 43 oorspronkelijke parser-/noticebestanden byte voor byte. Dit is een lokale simulatie; de nieuwe Windows-CI-taak moet nog slagen.

De herstelcommit verandert uitsluitend checkoutattributen, de bijbehorende Python-proef en deze documentatie. De 333 Rust-tests en zes runtimeproeven horen bij de daarvoor bytegelijke Rust-productiebron van `c752341`. De lopende lokale releasebouw blijft bewust aan dat onveranderde Git-archief gebonden. Dit is geen volledige Windows-GUI- of installatiegoedkeuring.
