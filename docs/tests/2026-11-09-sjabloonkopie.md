# Sjablonen als nieuwe documenten openen (#27)

Bronbasis: `main` op `f4a03889`. Windows x64, Node 24.22.1, pnpm 11.25.0.

## Gereproduceerd

De openroute behandelde een sjabloon als een bestaand document: de vingerafdruk
hergebruikte hetzelfde tabblad, de desktoproute hield het terugschrijf-token van
het sjabloon vast en ODF-/OOXML-sjablonen konden hun eigen sjabloonformaat als
bewaarvoorstel krijgen. DOTX, XLTX en POTX vroegen bovendien een conversieruntime.

Tien van de elf eerste regressiegevallen falen op de oorspronkelijke code. De
controle met een gewoon DOCX-bestand slaagt al op die code.

## Herstel

Een sjabloonopening krijgt expliciet de betekenis van een nieuw document. De
tabbladreducer maakt een vrije naamloze naam, wist de bronvingerafdruk en het
terugschrijf-token en markeert de kopie als onopgeslagen. De desktopwachtrij geeft
het tijdelijke brontoken na openen vrij. Nogmaals openen maakt een nieuwe kopie.
Ctrl+S vraagt eerst Opslaan als; daarna kan de kopie op haar eigen bestemming
worden bijgewerkt.

Transitional DOTX, XLTX en POTX openen rechtstreeks: alleen het hoofdinhoudstype
in `[Content_Types].xml` wordt naar dat van een gewoon document gewijzigd. Alle
andere pakketonderdelen blijven bij deze voorbereiding bytegelijk. Strict OOXML,
ODF-sjablonen en oudere formaten behouden de bestaande conversieroute en vereisen
daar nog een kantoorruntime. De herkende sjabloonextensies omvatten ook DOTM,
XLTM, POTM, DOT, XLT, POT, OTT, OTS, OTP, STW, STC en STI. Macro’s blijven via de
bestaande aparte VBA-opslag beschikbaar voor een nieuw DOCM/XLSM/PPTM-document;
ze worden niet uitgevoerd.

## Controles

- Volledige Vitest-suite: 176 bestanden, 2.002 geslaagd, tien bestaande gevallen
  overgeslagen. Daarbinnen vijftien gerichte sjabloonproeven voor directe opening,
  behoud van onderdelen, VBA, nagebootste ODF-/binaire conversie, gewone documenten,
  onafhankelijke naamloze kopieën en het opslagplan na bewaren van een kopie.
- TypeScript en de Vite-productiebouw slagen.
- `scripts/test-sjabloon-browser.mjs` controleert de productiefrontend in Chromium:
  DOTX, XLTX en POTX tweemaal openen, naamloze tabbladen, Opslaan als, downloaden
  als gewoon document, pakketinspectie en heropenen. Een toegevoegd onbekend
  XML-onderdeel blijft bytegelijk behouden in de gedownloade bestanden.
- Twee aanvullende gevallen gebruiken dezelfde productiefrontend met een
  nagebootste Tauri-IPC-laag: een DOTX geeft zijn brontoken vrij en opent Opslaan
  als; een gewoon DOCX houdt zijn token. Geen van beide proeven schrijft naar het
  oorspronkelijke bestand. Dit is geen controle van een echte native binary.
- Geen `pageerror`-meldingen tijdens deze browserronde. De uitkomst staat in
  [het JSON-bewijs](sjabloonkopie-2026-11-09.json).

De browserproef vereist Playwright/Chromium. Na de frontendbouw en het starten
van de preview: `node scripts/test-sjabloon-browser.mjs http://127.0.0.1:1451/`.
Een afzonderlijke Playwright-installatie kan via `OOS_PLAYWRIGHT_MODULE` worden
aangewezen. De lokaal beschikbare fontbestanden zijn in de testbouw geplaatst.

## Nog open

#27 blijft open voor de sjabloongalerij, persoonlijke en gedeelde sjabloonmappen,
standaardsjablonen per module en verdere controles van sjabloonexport. Deze ronde
bouwt geen nieuwe native Windows-app en voert geen echte ODF-/binaire conversie
uit; die openroutes zijn met vaste converteruitvoer gecontroleerd.
