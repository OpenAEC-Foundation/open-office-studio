# Native Windows G: afgebakende Writer-tabelronde

De gebruiker hervatte deze lokale test expliciet in Windows-chat 750b. Bron **`9e0ad565402815082e8edf11a4c23943455fb6ce`**, versie 2026.46.2, Windows 11 Home 10.0.26200 x64. Dit is dezelfde appbron als de gezamenlijke G-CI; geen nieuwe productcode.

Canonieke desktoprun [43856368812](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43856368812), Windows-job `133261556431`, artifact `14223362239`, ZIP-SHA `c15cb5e1950d0f73566401aa96e34157f91a81687bf00e31c0e79a9be3d466ef`. Installer: 384.538.478 bytes, SHA `33fd74a2a17e648b8302c9ff12359af7589c03ca5c7fc90c4dc8e96ccafd32ca`; geïsoleerde installatie exit 0. Werkelijke exe: 88.171.520 bytes, SHA `4d070f3674ff4febaba4b57c4ccc998a78411fad40e0501433227e30ca856f07`. Root heeft installer- en geïnstalleerde exe-hashes zelfstandig gecontroleerd. De afzonderlijke vergelijking met een uit de NSIS geëxtraheerde exe ontbreekt; lokaal is geen 7z beschikbaar.

## Werkelijk uitgevoerde controle

Een synthetische tabel met drie kolommen en twee rijen is via het lint ingevoegd. Celinvoer en Tab naar een bestaande cel slagen; Tab uit de laatste cel maakt precies één nieuwe rij met drie cellen. Tekst en rij kunnen met Undo/Redo afzonderlijk worden teruggedraaid/hersteld. Shift+Tab keert naar de laatste cel van de vorige rij terug.

Kolommen links en rechts invoegen lukt. Directe Ctrl+Z na **Insert Column Left** laat echter tweemaal vier kolommen staan, ook na extra observatie. Klik in de documentbody plus Ctrl+Z, of Home → Undo, herstelt drie kolommen. De rechterknoproute plus Ctrl+Z werkt in deze sessie. Deze ene afgebakende afwijking is na open/gesloten duplicaat- en beschrijvingscontrole geregistreerd als [#361](https://github.com/OpenAEC-Foundation/open-office-studio/issues/361); oorzaak onbekend, geen fixclaim. Labelcontrole `43872127396` slaagt.

Native Ctrl+S/Save As, volledig app afsluiten, nul eigen processen, dezelfde exe starten met nieuwe PID **20640 → 4716**, en Recent-heropenen slagen voor opgeslagen tekst en tabelstructuur. Alle pakket-XML is zelfstandig geparseerd; één tabel, drie gridkolommen en precies deze negen celteksten:

|       |      |       |
| ----- | ---- | ----- |
| alpha | beta |       |
|       |      | omega |
| delta |      |       |

DOCX: 36.883 bytes, SHA `645ef61571f22392e29c7c2f0626c407ba4d85927384dae341774578a004cc24`. De hash blijft na heropenen gelijk. Root heeft de werkelijke DOCX opnieuw gehasht, alle XML geparseerd en de volledige 3×3-structuur/teksten bevestigd; alle vier screenshot-hashes zijn tegen de bronbestanden gecontroleerd. Het [JSON-receipt](2026-11-16-native-windows-g.json) bewaart hashes, controles, herstart en beperkingen. Privé bronbestanden/beelden zijn ook naar de eigen `.local/nov16-g-native-windows-final` gekopieerd.

## Grenzen en cleanup

Dit is één Writer-tabelroute, geen volledige Writer-certificering. De voorbereide taalfixture is alleen ongewijzigd geopend/gesloten: **geen #327-native taalacceptatie op Windows G**. #361 is niet op Linux/macOS/browser gereproduceerd. Rijhoogte lijkt op een heropeningsbeeld groter; dat is uitsluitend een afzonderlijke screenshotwaarneming, niet onderzocht, geen tweede issue en geen pixelgelijke-opmaakclaim.

Bij de afgeronde testhandoff zijn alle eigen tabs en de app normaal gesloten; root controleert dan aanvullend nul processen van deze exacte G-exe. De operator heeft de eigen `mcp__node_repl`-kernel gereset met toolbevestiging; daarna geen nieuwe opname. Voorkeuren, broncode en andere processen zijn ongemoeid. Het verdwijnen van de nieuwe gele rand en sluiting van alle helperresources zijn niet afzonderlijk visueel/technisch bewezen; de eerdere F-bevestiging wordt niet overgedragen. Een latere gebruikersmelding betreft opnieuw geopende G met nieuwe lintuitsneden: de testcleanup is geen actuele sluitings-/nulprocessenclaim over dat latere gebruikersgebruik. Root heeft die app niet gesloten of bediend.
