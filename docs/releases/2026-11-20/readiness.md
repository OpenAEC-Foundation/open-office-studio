# Releasegereedheid — 20 november 2026

Read-only audit van integratie 771fd66e0e4bd612dba4f7b6e34b517f39d52e86; applicatie 7f126f4b8e5269a54388cf78c48c78d2acc0daa1, tree 8bc608488760e48919d7fb4e72a42569175b52a4. Alleen bestaande resultaten beoordeeld; geen nieuwe tests, GUI of publicatie.

Advies: GEBLOKKEERD voor publicatie/main. Releasevoorbereiding kan door, maar stabiele release is niet gereed. Ook een prerelease-label vervangt ontbrekende risicoacceptatie niet; publicatie daarvan is evenmin geadviseerd of toegestaan. Linux/Mac-risico’s zijn niet geaccepteerd. Alleen #366 is expliciet uitgesteld.

| Issue | Fix | Bestaand bewijs en grens |
| --- | --- | --- |
| #356 | EPUB via bestaande veilige HTML/DOCX-import; behoud leesvolgorde en gerefereerde media. | 6 routes op 3 OS; import, offline edit, save/reopen en invalid-input tabbehoud. Windows NSIS, Linux DEB/AppImage, macOS DMG: echte save, onafhankelijke XML/PNG-oracle en nieuw-PID-heropenen. Native EPUB-editing niet getest; afwijkende Windows-savebestemming onverklaard, werkelijk opgeslagen bestand wel gecontroleerd. |
| #361 | Documentinvoerfocus herstellen na Insert Column zodat direct Undo/Redo werkt. | 162 combinatiechecks; 3 OS en beide routes. Oorspronkelijke Mac tweede-Undo-fout bewaard; combinatie en 18 diagnosechecks slagen. Windows historie/save/reopen en aparte Ctrl+H → Find abc → precies één Ctrl+Z → leeg, exact grid gelijk. Linux 17 kern- en 16 vervolgrecords, maar Find-input Undo faalt. Mac tabelroute geblokkeerd. Geen volledige native platformacceptatie. OudG toont hetzelfde Linux Find-symptoom met afwijkende openingsroute; dit bewijst geen oorzaak en wist I3-fout niet. |
| #362 | Writer-linthoogte/compacte stapels en verticale ruimte rond collapsed groepsfocus. | 720 content + 192 groepsfocuscases; 3 OS, beide routes, verticale acceptatie. 24 horizontale waarnemingen blijven expliciet. Windows afgebakende brede staten en collapsed Delete bij923/Forge+Light, Down/End/Enter/Escape. Linux aparte Tab-route 1 normaal +6 focuscases/42 clipvrije buttonmetingen; daarna screenshot-timeout, nativePass=false. ArrowDown focus-visible-fouten blijven. Mac Table Design niet betrouwbaar bereikbaar. Geen complete native groepen/breedtes/themas/statenmatrix; echte disabled Delete niet gepasseerd. Synthetische browser-disabled CSS geen native engine-disabled bewijs. |
| #363 | Vijf stijlbeheeracties via bestaande vertalingen en correcte stijlnaaminterpolatie. | 18 EN/NL/Lao-fallbackcases; 3 OS en beide routes. Windows EN/NL vijf namen/hints; Linux beperkte EN/Normal; macOS echte Settings EN → NL → EN, AX-namen/hints/Normal, normale cleanup. Afgebakend centraal geaccepteerd; geen native Linux NL/fallback/custom/no-current/hover/hardwarematrix. |

De acht coreworkflows en canonical desktop-pakketten slagen op APP7f. Browser-QA44716499924 dekt alle vier fixes op Windows/Linux/macOS en zowel / als /office/. De3230 productie-/core-inputs zijn volgens bestaande equivalentie byte-/mode-identiek; de200 paden tussen d76 en771 liggen uitsluitend in centrale bewijsdocumenten. Dit maakt771 geen afzonderlijk geteste applicatiebuild.

Blokkerende scopes voor volledige vrijgave:

- **Linux Find-input Undo (#361):** abc blijft na één Ctrl+Z staan; documentgrid onveranderd. Ook oudG onder gematchte driver/WebKit vertoont dit symptoom; oorzaak onbekend. Blokkeer een claim van complete native Undo-vrijgave. Alleen leveren met expliciet geaccepteerd bekend functioneel risico; geen regressievrij- of automation-oorzaakclaim.
- **Native verticale lintacceptatie (#362):** Linux ArrowDown mist focus-visible; Tab-route bewijst zes zichtbare 4px-focusringen bij light/1600 maar stopt op screenshot-timeout. Geen collapsed groep/narrow/Forge-matrix. Mac route ontbreekt. Blokkeer volledige native #362-acceptatie. Voor release vereist dit expliciete acceptatie van ontbrekende native dekking en bewaarde failures; geen extra retry of productfix in deze ronde.
- **macOS-native tabelbediening (#361/#362):** Body bleef leeg en unieke celgeometrie ontbrak na gewone maximize. Geen native Undo of lintpassing geaccepteerd; geen bewezen #359-oorzaak. Blokkeer volledige macOS-tabel-/focusvrijgave. Een release kan dit alleen als expliciet geaccepteerde platformbeperking meenemen.

Expliciet te behouden bekende risico’s:

- #366 — Gebruikersmelding: paginateller blijft minstens2min op10van10 terwijl gebruiker15 verwacht. Uitsluitend bekend probleem vermelden; geen zelfstandige reproductie, fix, oorzaak of acceptatie geclaimd.
- Browser horizontale ribbon bij800 — 24 ruwe X/combined-randwaarnemingen bewaard; Y-acceptatie blijft strikt.
- Beperkte native staten en omgevingen — Echte disabled Delete ontbreekt; Linux #363 NL/fallback en fysieke hardware/Wayland ontbreken. CI-builds vervangen geen bediening.
- Overige bewaarde waarnemingen — Eerste Mac browser-Undo-fout oorzaak onbekend ondanks geslaagde vervanging/diagnose; Windows EPUB-savebestemming onverklaard. Geen uitbreiding naar #359, Tab-zonder-typen of andere issues.

Oorspronkelijke failed runs en bron-/harnessbindingen blijven behouden. Succesvolle builds bewijzen geen native bediening; beperkte Tab-route overschrijft ArrowDown-fouten niet. De native Windows Ctrl+H-case is positief; Linux/G-tegenvoorbeeld blijft diagnostisch en Mac EPUB/#363-pass bewijst geen tabel-/Undo-pass.

Bestaande eigen apps zijn volgens centrale cleanup gesloten; oorspronkelijke Windows-runtime en aanvullende Ctrl+H-runtime gereset. Geen nieuwe app/opnamesessie gestart. Afwezigheid van de gele rand en vrijgave van alle helpers zijn niet zelfstandig visueel bewezen.


Gerichte volledigheidsvergelijking:

- Publieke stabiele v2026.46.2 is cf65adf4 (13nov00:20:54Z); actuele main is93fcc619. Beide zijn bewezen voorouders van771. Alle reeds in die bronnen opgenomen commits blijven dus behouden; PR248/347/348 zijn al eerder meegegaan.
- Boven de publieke release, reeds opmain: PR350 Writer list/table/TOC en Spreadsheet-importwaarschuwingen, PR352 crop/HTML-pastecomments, plus PR351 release-metadata-merge.
- Bovenmain voegt771 de begrensde #327/PR349-taalstatusfix, PR354-private-runtime, #358/PR360-Macnavigatie, de vier huidige fixes en CI-/bewijswerk toe. PR349 is nog draft, maar zijn exacte cb99-head is al inbegrepen; PR354/360 zijn naar integratie merged.
- Afgeronde afzonderlijke SYLK-levering van8020, branch codex/formats-30-sylk-coverage-2026-11-20, head720f7429, ontbreekt in771. Remotevergelijking:4commits vooruit/4achter,112paden,0productiebronverschillen. Dit is bewijs-/harness-/formatdocumentatie van bestaande routes opAPP7f, geen ontbrekende productfix en geen nativeIPC/GUI-pass. Alleen apart benoemen; niet stilzwijgend integreren.
- PR317 is de historische doorPR354 opgevolgde draft-runtimebranch; zijn oude head ontbreekt en hoeft niet daarnaast mee. PR116 is brede onafgeronde Rust-WIP; zijn head ontbreekt en is geen bewezen afgeronde levering. #359, ontbrekende #30-fixtures en deelwaarnemingen zijn geen af te sluiten volledig werk.
- Dit bewijst behoud van al geïntegreerd main/releasewerk en de benoemde leveringen; geen volledige inventaris van alle lokale branches of chats. Daarom geen claim dat letterlijk alles van twee weken is meegenomen.

Machineleesbare audit: release-readiness-2026-11-20.json, SHA256 ddf8650a89f40b16262ae5a8db31d43c7687c9b5da96ffcc54afa5661a187b80. Bevat exacte inputhashes, fixcommits, run-ID’s en afzonderlijke beperkingen. Geen vervolgonderzoek of automatische hervatting.
