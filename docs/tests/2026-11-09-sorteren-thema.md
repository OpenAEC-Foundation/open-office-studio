# Leesbaarheid sorteervenster (#205)

De fout is onafhankelijk gereproduceerd tegen main e741e504. In Forge erven
alle zes kolom-/typeselectors tekstkleur rgb(242,242,240), maar hun achtergrond
is wit en de optieachtergrond transparant. Dat geldt ook voor de ingeschakelde
eerste kolom en het eerste type. Sorteren zelf werkt.

De fix geeft uitsluitend het sorteervenster expliciete themakleuren voor
selects en opties, plus het bijpassende native color-scheme. Uitgeschakelde
types blijven herkenbaar door verminderde dekking.

`node scripts/proef-tabel-sorteren-thema.mjs .local/dist` is geslaagd tegen de
productiebuild. De proef opent een echte DOCX-tabel in Forge en licht thema,
controleert de zes selectors en hun opties, schakelt de kopregel in en voert
een oplopende sortering uit. De gedownloade DOCX bevat de kop bovenaan en
Alfa vóór Zebra. Geen browserpaginafouten. Schermafbeeldingen zijn visueel
gecontroleerd. TypeScript en productiebuild zijn geslaagd.

Voor de controle vóór de fix kan `OOS_EXPECT_UNFIXED=1` gebruikt worden om de
werkelijke kleuren vast te leggen zonder de nieuwe kleurverwachtingen toe te
passen. De sorteerproef wordt dan nog steeds uitgevoerd.
