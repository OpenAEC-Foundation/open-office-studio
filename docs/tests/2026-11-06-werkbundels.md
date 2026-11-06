# Werkbundels voor de bestaande Tauri-suite

Momentopname bij de indeling: 6 november 2026; 101 open issues.
Na het mergen van PR #154, #155 en #159 en de ondertekeningsaudit zijn zeven
daarvan aantoonbaar gesloten; 94 blijven open. De eerdere administratie staat in
[het issueregister](2026-11-05-tauri-issuelus.md). Deze indeling verandert geen
issue-status en voegt geen extra verzamelissues toe. Iedere melding staat precies
één keer in deze momentopname. Het parallelle native interfacetraject (#116)
valt buiten de opdracht.

## Voorrang en afhandeling

De externe meldingen #144 (`jungle-diff`) en #135 (`oscar981-op`) zijn getoetst en
gesloten via respectievelijk PR #155 en #154. Daarna volgen Writer en Spreadsheet.
Database blijft het laatste ontwikkelonderdeel.

Een werkbundel bevat ongeveer tien samenhangende meldingen. De indeling voorkomt
het herhaald bouwen en testen van dezelfde module. Eén of meer samenhangende PR’s
mogen de bundel uitvoeren; geen onvolledige melding wordt gesloten om het aantal
van tien te halen. Per issue blijven reproductie, herstel, relevante controles en
het oorspronkelijke acceptatiebereik afzonderlijk aantoonbaar. Brede functie-issues
blijven open zolang een deel van hun criteria niet is geverifieerd.

## Actuele bewijzen

- De openbare [release v2026.45.2](https://github.com/OpenAEC-Foundation/open-office-studio/releases/tag/v2026.45.2)
  bevat de herstelrondes #154–#159 en 28 installers voor zeven apps. Alle zestig
  releasebestanden zijn daadwerkelijk gedownload en geverifieerd, inclusief
  veertien Linux-handtekeningen. De zeven Linux-apps zijn gestart en hun schermen
  bekeken; alle 28 openbare downloadlinks geven HTTP 200. Zie het
  [releasebewijs](uitgave-2026.45.2-controle.json).
- #70: de native tegenproef bevestigt verkeerde voorrang bij gelijke werkmap-
  en bladnamen en een verouderde naam na bladwisselen. PR #162 herstelt
  deze bediening en is na zes groene platformcontroles gemerged als `c3e9acc7`.
  De opvolgende kandidaat voegt het naambeheervenster, namen uit koppen en
  formuleaanvulling toe. Alle vijf criteria slagen lokaal, inclusief native
  bewaren/heropenen; 1.806 app-proeven slagen. #70 blijft open tot de opvolgende
  platformcontroles en merge. Zie het [naamvakverslag](2026-11-06-naamvak.md)
  en [naambeheerverslag](2026-11-06-naambeheer.md).
- PR #154 is gemerged als `7f2d317a`. IFCX-opslag en herstel van Writer-invoer
  en opslagstatus zijn lokaal en met zes geslaagde platformcontroles geverifieerd.
  #126, #135, #152 en #153 zijn gesloten met afzonderlijk testbewijs. Zie de
  [testbeschrijving](2026-11-05-ifcx-office.md).
- #144: beide nootsoorten rechtstreeks met de vastgezette engine gereproduceerd.
  De gerichte proefcorrectie toont `iii` in de hoofdtekst. De gevonden extra
  bewaarde tussenresultaten zijn hersteld; de oorspronkelijke gerichte cacheproef
  slaagt. De documentposities en cursorgeometrie van meerletterige labels zijn hersteld.
  De aangesloten kandidaat slaagt in 598 layoutproeven en de volledige Office-set
  (1.664 tests); de native bediening, opslag en heropening zijn eveneens geverifieerd.
  Alle zes platformcontroles van de PR zijn geslaagd. PR #155 is gemerged als
  `b7d1b990`; #144 is daarna gesloten. Zie de
  [afzonderlijke bewijzen](2026-11-06-nootnummering.md).
- #130: de eerdere beperkte structuurproef reproduceerde de breedteverschuiving
  niet. Ook de getekende tweedeling verschuift de onderste grenzen niet. Wel
  gereproduceerd: onjuiste rasterverdeling bij drie of meer nieuwe cellen.
  De rastercorrectie en het behoud van echte bronvoorkeuren slagen in de
  geometrie-, opslag- en native bedieningsproeven. Ook de daarbij gevonden
  eerste-opslagstatus is hersteld. PR #156 is na zes groene platformcontroles
  gemerged als `53e6f308`; #130 en het bredere #48 blijven open.
  Zie [het werkverslag](2026-11-06-celsplitsing.md).
- #113 is gesloten na controle van de actuele release v2026.45.1 én de door de
  website vast gekoppelde v2026.44.8: elk 60 bestanden, 28 installers en veertien
  geldige Linux-pakkethandtekeningen. Platformsigning en publicatiecontroles zijn
  in beide releasebouwen geslaagd. Het volledige
  [controlebewijs](https://github.com/OpenAEC-Foundation/open-office-studio/issues/113#issuecomment-6674072326)
  staat bij het issue. Automatische updates (#26) blijven afzonderlijk open.
- #51: vijf nummernotaties vallen onder de bewezen nootcorrectie van #144.
  De Chicago-symboolnotatie gaf in beide nootsoorten `3` tegenover de derde
  markering `‡`; dat is [bij #51 vastgelegd](https://github.com/OpenAEC-Foundation/open-office-studio/issues/51#issuecomment-6673990113).
  De nieuwe kandidaat slaagt in 30 kernrondgangen en de native notatie-,
  noottekst-, Undo/Redo- en opslag-/heropenproeven. PR #157 is na zes groene
  platformcontroles gemerged als `059895dc`. Het bredere #51 blijft open.
  Zie [het symboolverslag](2026-11-06-nootsymbolen.md).

- #58: naamvak, invoervolgorde, formulekleuren en beide bereikkeuzes zijn
  hersteld. De gezamenlijke native bediening, scroll- en opslag-/heropenproef
  slagen, naast 1.728 tests. PR #158 is na zes groene platformcontroles gemerged
  als `2db5147c`. De opvolgende kerncorrectie bewaart en berekent lange
  optelketens en herstelt ook F2-kleuren en bereikkeuze. Alle lokale criteria
  van #58 zijn daarmee opnieuw beproefd. PR #159 is na zes groene
  platformcontroles gemerged als `06463ebd`; #58 is gesloten en de zes criteria
  zijn afgetekend. De opvolger slaagt in 1.744 app-proeven en 1.725
  kernproeven. De nacontrole herstelt ook wisselende kleuren en gestapelde
  rasterkaders bij herhaalde verwijzingen; negen native kleurproeven en een
  nieuwe F2-/opslag-/heropenronde slagen. Het bredere #59 blijft open. Zie het
  [formuleverslag](2026-11-06-formulebediening.md) en
  [kernverslag](2026-11-06-lange-formuleketens.md). De
  [platform- en statuscontrole](formulebediening-platformen-2026-11-06.json)
  bewaart de broncommit, merge, zes controle-uitkomsten en sluitingsdatum.

## 0. Afgeronde opslagronde — PR #154

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#135](https://github.com/OpenAEC-Foundation/open-office-studio/issues/135) | `oscar981-op` | Writer: temporary “Document worker is not initialized” error while typing in a table cell |
| [#126](https://github.com/OpenAEC-Foundation/open-office-studio/issues/126) | `JanAdriaan891` | Writer: externally copied text cannot be pasted; internal paste works through ribbon and Ctrl+V |
| [#153](https://github.com/OpenAEC-Foundation/open-office-studio/issues/153) | `JanAdriaan891` | Writer: saving immediately after typing can leave an already saved document marked as modified |
| [#152](https://github.com/OpenAEC-Foundation/open-office-studio/issues/152) | `JanAdriaan891` | Office: save and reopen Writer, Spreadsheet, and Presentation as IFCX |

## 1. Writer — externe melding, tabellen en documentopmaak

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#144](https://github.com/OpenAEC-Foundation/open-office-studio/issues/144) | `jungle-diff` | Writer: footnote and endnote references ignore number format and starting number |
| [#130](https://github.com/OpenAEC-Foundation/open-office-studio/issues/130) | `JanAdriaan891` | Writer: splitting the top cell appears to shift column widths in other rows |
| [#51](https://github.com/OpenAEC-Foundation/open-office-studio/issues/51) | `DutchSailor` | Writer: footnotes and endnotes |
| [#50](https://github.com/OpenAEC-Foundation/open-office-studio/issues/50) | `DutchSailor` | Writer: insert and update a table of contents |
| [#48](https://github.com/OpenAEC-Foundation/open-office-studio/issues/48) | `DutchSailor` | Writer: advanced table editing |
| [#46](https://github.com/OpenAEC-Foundation/open-office-studio/issues/46) | `DutchSailor` | Writer: multilevel lists and heading numbering |
| [#45](https://github.com/OpenAEC-Foundation/open-office-studio/issues/45) | `DutchSailor` | Writer: create, modify, and manage styles |
| [#44](https://github.com/OpenAEC-Foundation/open-office-studio/issues/44) | `DutchSailor` | Writer: headers, footers, page numbers, and fields |
| [#52](https://github.com/OpenAEC-Foundation/open-office-studio/issues/52) | `DutchSailor` | Writer: captions, cross-references, and bookmarks |
| [#55](https://github.com/OpenAEC-Foundation/open-office-studio/issues/55) | `DutchSailor` | Writer: text columns and sections with independent page settings |

## 2. Spreadsheet — dagelijkse invoer en berekeningen

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#58](https://github.com/OpenAEC-Foundation/open-office-studio/issues/58) | `DutchSailor` | Spreadsheet: formula bar, name box, and function insertion assistance |
| [#59](https://github.com/OpenAEC-Foundation/open-office-studio/issues/59) | `DutchSailor` | Spreadsheet: formula functions, recalculation, and Dutch notation |
| [#60](https://github.com/OpenAEC-Foundation/open-office-studio/issues/60) | `DutchSailor` | Spreadsheet: insert, delete, hide, and freeze rows and columns |
| [#61](https://github.com/OpenAEC-Foundation/open-office-studio/issues/61) | `DutchSailor` | Spreadsheet: manage sheets |
| [#64](https://github.com/OpenAEC-Foundation/open-office-studio/issues/64) | `DutchSailor` | Spreadsheet: number formats with Dutch locale settings |
| [#66](https://github.com/OpenAEC-Foundation/open-office-studio/issues/66) | `DutchSailor` | Spreadsheet: create and edit charts |
| [#67](https://github.com/OpenAEC-Foundation/open-office-studio/issues/67) | `DutchSailor` | Spreadsheet: conditional formatting |
| [#68](https://github.com/OpenAEC-Foundation/open-office-studio/issues/68) | `DutchSailor` | Spreadsheet: data validation and dropdown lists |
| [#70](https://github.com/OpenAEC-Foundation/open-office-studio/issues/70) | `DutchSailor` | Spreadsheet: named ranges and name management |
| [#71](https://github.com/OpenAEC-Foundation/open-office-studio/issues/71) | `DutchSailor` | Spreadsheet: cell comments and notes |

## 3. Spreadsheet — gevorderde werkmappen en bestandsbehoud

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#69](https://github.com/OpenAEC-Foundation/open-office-studio/issues/69) | `DutchSailor` | Spreadsheet: pivot tables |
| [#72](https://github.com/OpenAEC-Foundation/open-office-studio/issues/72) | `DutchSailor` | Spreadsheet: sheet and workbook protection |
| [#73](https://github.com/OpenAEC-Foundation/open-office-studio/issues/73) | `DutchSailor` | Spreadsheet: cell styles and formatting ranges as tables |
| [#74](https://github.com/OpenAEC-Foundation/open-office-studio/issues/74) | `DutchSailor` | Spreadsheet: edit large workbooks efficiently |
| [#75](https://github.com/OpenAEC-Foundation/open-office-studio/issues/75) | `DutchSailor` | Spreadsheet: links, images, and shapes in worksheets |
| [#3](https://github.com/OpenAEC-Foundation/open-office-studio/issues/3) | `JanAdriaan891` | Spreadsheets: XLSX adapter and independent formula verification |
| [#32](https://github.com/OpenAEC-Foundation/open-office-studio/issues/32) | `DutchSailor` | Formats: open and save ODS (OpenDocument Spreadsheet) |
| [#35](https://github.com/OpenAEC-Foundation/open-office-studio/issues/35) | `DutchSailor` | Formats: open and save XLS and XLSB |

## 4. Writer — objecten, vergelijken en tekstformaten

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#49](https://github.com/OpenAEC-Foundation/open-office-studio/issues/49) | `DutchSailor` | Writer: crop, position, and describe images |
| [#53](https://github.com/OpenAEC-Foundation/open-office-studio/issues/53) | `DutchSailor` | Writer: insert and edit mathematical equations |
| [#54](https://github.com/OpenAEC-Foundation/open-office-studio/issues/54) | `DutchSailor` | Writer: mail merge with an address list |
| [#56](https://github.com/OpenAEC-Foundation/open-office-studio/issues/56) | `DutchSailor` | Writer: shapes, text boxes, and drawing objects in documents |
| [#57](https://github.com/OpenAEC-Foundation/open-office-studio/issues/57) | `DutchSailor` | Writer: compare two versions of a document |
| [#2](https://github.com/OpenAEC-Foundation/open-office-studio/issues/2) | `JanAdriaan891` | Documents: decouple the existing DOCX editor and test file preservation |
| [#31](https://github.com/OpenAEC-Foundation/open-office-studio/issues/31) | `DutchSailor` | Formats: open and save ODT (OpenDocument Text) |
| [#34](https://github.com/OpenAEC-Foundation/open-office-studio/issues/34) | `DutchSailor` | Formats: open and save DOC (97–2003 binary document format) |
| [#39](https://github.com/OpenAEC-Foundation/open-office-studio/issues/39) | `DutchSailor` | Formats: open RTF, TXT, HTML, and Markdown |

## 5. Bestanden — betrouwbare opslag, uitvoer en installatie

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#37](https://github.com/OpenAEC-Foundation/open-office-studio/issues/37) | `DutchSailor` | Formats: PDF export without a conversion program |
| [#40](https://github.com/OpenAEC-Foundation/open-office-studio/issues/40) | `DutchSailor` | Formats: report incomplete support when opening and saving |
| [#41](https://github.com/OpenAEC-Foundation/open-office-studio/issues/41) | `DutchSailor` | Formats: open and save password-protected documents |
| [#43](https://github.com/OpenAEC-Foundation/open-office-studio/issues/43) | `DutchSailor` | Formats: less common and legacy formats in the catalog |
| [#30](https://github.com/OpenAEC-Foundation/open-office-studio/issues/30) | `DutchSailor` | Formats: open all supported formats without a separately installed conversion program |
| [#6](https://github.com/OpenAEC-Foundation/open-office-studio/issues/6) | `JanAdriaan891` | Validation: real-world corpus, bundle measurements, and ODF follow-up |
| [#25](https://github.com/OpenAEC-Foundation/open-office-studio/issues/25) | `DutchSailor` | General: file associations on macOS and Linux |
| [#113](https://github.com/OpenAEC-Foundation/open-office-studio/issues/113) | `JanAdriaan891` | Ensure installer signing — audit of 29 October 2026 |
| [#14](https://github.com/OpenAEC-Foundation/open-office-studio/issues/14) | `DutchSailor` | General: automatic recovery after a crash or power failure |
| [#17](https://github.com/OpenAEC-Foundation/open-office-studio/issues/17) | `DutchSailor` | General: open files by dragging them onto the window |

## 6. Presentation — opmaak en bewerken

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#76](https://github.com/OpenAEC-Foundation/open-office-studio/issues/76) | `DutchSailor` | Presentation: slide sorter and outline view |
| [#77](https://github.com/OpenAEC-Foundation/open-office-studio/issues/77) | `DutchSailor` | Presentation: edit slide masters and layouts |
| [#78](https://github.com/OpenAEC-Foundation/open-office-studio/issues/78) | `DutchSailor` | Presentation: apply and customize themes |
| [#79](https://github.com/OpenAEC-Foundation/open-office-studio/issues/79) | `DutchSailor` | Presentation: notes and presenter view |
| [#80](https://github.com/OpenAEC-Foundation/open-office-studio/issues/80) | `DutchSailor` | Presentation: align, distribute, group, and crop objects |
| [#81](https://github.com/OpenAEC-Foundation/open-office-studio/issues/81) | `DutchSailor` | Presentation: tables on slides |
| [#82](https://github.com/OpenAEC-Foundation/open-office-studio/issues/82) | `DutchSailor` | Presentation: charts on slides |
| [#87](https://github.com/OpenAEC-Foundation/open-office-studio/issues/87) | `DutchSailor` | Presentation: slide numbers, dates, and footers |

## 7. Presentation — media, effecten en extra formaten

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#83](https://github.com/OpenAEC-Foundation/open-office-studio/issues/83) | `DutchSailor` | Presentation: slide transitions |
| [#84](https://github.com/OpenAEC-Foundation/open-office-studio/issues/84) | `DutchSailor` | Presentation: object animations |
| [#85](https://github.com/OpenAEC-Foundation/open-office-studio/issues/85) | `DutchSailor` | Presentation: video and audio |
| [#86](https://github.com/OpenAEC-Foundation/open-office-studio/issues/86) | `DutchSailor` | Presentation: correctly render diagrams and support basic editing |
| [#33](https://github.com/OpenAEC-Foundation/open-office-studio/issues/33) | `DutchSailor` | Formats: open and save ODP (OpenDocument Presentation) |
| [#36](https://github.com/OpenAEC-Foundation/open-office-studio/issues/36) | `DutchSailor` | Formats: open and save PPT and PPS |

## 8. Werkruimte — dagelijkse bediening

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#13](https://github.com/OpenAEC-Foundation/open-office-studio/issues/13) | `DutchSailor` | General: recent files on the start screen and in the file menu |
| [#19](https://github.com/OpenAEC-Foundation/open-office-studio/issues/19) | `DutchSailor` | General: standard office keyboard shortcuts and a shortcut reference |
| [#20](https://github.com/OpenAEC-Foundation/open-office-studio/issues/20) | `DutchSailor` | General: clipboard with and without formatting, including between applications |
| [#21](https://github.com/OpenAEC-Foundation/open-office-studio/issues/21) | `DutchSailor` | General: Dutch and English spell checking and autocorrect |
| [#22](https://github.com/OpenAEC-Foundation/open-office-studio/issues/22) | `DutchSailor` | General: system fonts and substitution for missing fonts |
| [#23](https://github.com/OpenAEC-Foundation/open-office-studio/issues/23) | `DutchSailor` | General: settings dialog |
| [#24](https://github.com/OpenAEC-Foundation/open-office-studio/issues/24) | `DutchSailor` | General: accessibility of the ribbon, dialogs, and document area |
| [#26](https://github.com/OpenAEC-Foundation/open-office-studio/issues/26) | `DutchSailor` | General: automatic updates |
| [#27](https://github.com/OpenAEC-Foundation/open-office-studio/issues/27) | `DutchSailor` | General: create, manage, and use templates |
| [#28](https://github.com/OpenAEC-Foundation/open-office-studio/issues/28) | `DutchSailor` | General: status bar with module information and zoom slider |
| [#29](https://github.com/OpenAEC-Foundation/open-office-studio/issues/29) | `DutchSailor` | General: advanced find and replace in all modules |

## 9. Calendar — lokale basis en zichtbare agenda

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#94](https://github.com/OpenAEC-Foundation/open-office-studio/issues/94) | `DutchSailor` | Open Calendar Studio: calendar based on the Y-app |
| [#95](https://github.com/OpenAEC-Foundation/open-office-studio/issues/95) | `DutchSailor` | Calendar: day, week, and month views with navigation |
| [#96](https://github.com/OpenAEC-Foundation/open-office-studio/issues/96) | `DutchSailor` | Calendar: create, drag, and resize items in the grid |
| [#97](https://github.com/OpenAEC-Foundation/open-office-studio/issues/97) | `DutchSailor` | Calendar: event dialog with all common fields |
| [#98](https://github.com/OpenAEC-Foundation/open-office-studio/issues/98) | `DutchSailor` | Calendar: recurring events and exceptions |
| [#99](https://github.com/OpenAEC-Foundation/open-office-studio/issues/99) | `DutchSailor` | Calendar: multiple sources and calendars with colors and visibility controls |
| [#100](https://github.com/OpenAEC-Foundation/open-office-studio/issues/100) | `DutchSailor` | Calendar: local storage and ICS opening, import, and export |
| [#101](https://github.com/OpenAEC-Foundation/open-office-studio/issues/101) | `DutchSailor` | Calendar: time zones, all-day events, and Dutch notation |
| [#102](https://github.com/OpenAEC-Foundation/open-office-studio/issues/102) | `DutchSailor` | Calendar: external calendars through iCal subscriptions (https / webcal) |
| [#105](https://github.com/OpenAEC-Foundation/open-office-studio/issues/105) | `DutchSailor` | Calendar: add and open online meeting links |

## 10. Koppelingen — agenda, opslag en werkplek

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#103](https://github.com/OpenAEC-Foundation/open-office-studio/issues/103) | `DutchSailor` | Calendar: read and write CalDAV and JMAP calendars |
| [#104](https://github.com/OpenAEC-Foundation/open-office-studio/issues/104) | `DutchSailor` | Calendar: send and respond to invitations |
| [#106](https://github.com/OpenAEC-Foundation/open-office-studio/issues/106) | `DutchSailor` | Calendar: Y-app sources (events, tasks, leave, timesheets, colleagues) |
| [#5](https://github.com/OpenAEC-Foundation/open-office-studio/issues/5) | `JanAdriaan891` | Integration: live Y-app storage test and shared editor contract |
| [#108](https://github.com/OpenAEC-Foundation/open-office-studio/issues/108) | `JanAdriaan891` | General: make office-file previews reusable in Y-next |
| [#147](https://github.com/OpenAEC-Foundation/open-office-studio/issues/147) | `DutchSailor` | SuperCloud: open Docs files and connect the assistant (MCP) |
| [#1](https://github.com/OpenAEC-Foundation/open-office-studio/issues/1) | `DutchSailor` | Open Office Studio: browser office suite for the SuperCloud (research and setup) |

## 11. Database — vervolgtraject na de hoofdmodules

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#8](https://github.com/OpenAEC-Foundation/open-office-studio/issues/8) | `JanAdriaan891` | Open Access Studio: open legacy databases including VBA scripts |
| [#88](https://github.com/OpenAEC-Foundation/open-office-studio/issues/88) | `DutchSailor` | Database: display relationships in a relationship diagram |
| [#89](https://github.com/OpenAEC-Foundation/open-office-studio/issues/89) | `DutchSailor` | Database: execute queries |
| [#90](https://github.com/OpenAEC-Foundation/open-office-studio/issues/90) | `DutchSailor` | Database: create and edit databases |
| [#91](https://github.com/OpenAEC-Foundation/open-office-studio/issues/91) | `DutchSailor` | Database: external data-source connections |
| [#92](https://github.com/OpenAEC-Foundation/open-office-studio/issues/92) | `DutchSailor` | Database: forms and reports |

## 12. Overkoepelende roadmap en afzonderlijk onderzoek

| Issue | Gemeld door | Onderwerp |
| --- | --- | --- |
| [#12](https://github.com/OpenAEC-Foundation/open-office-studio/issues/12) | `DutchSailor` | Roadmap: Open Office Studio as a complete office suite |
| [#93](https://github.com/OpenAEC-Foundation/open-office-studio/issues/93) | `DutchSailor` | Research: drawing module for diagrams and vector drawings |
