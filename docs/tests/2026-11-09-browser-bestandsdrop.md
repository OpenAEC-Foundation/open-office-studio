# Browser: bestanden neerzetten (#17)

Basis: `f4a03889` (`main`), 9 november 2026.

## Herstel

- Een bestandsdrop tijdens een dialoog wordt tegengehouden, inclusief de
  standaardactie waarmee de browser het bestand zelf opent. Dit geldt ook voor
  instellingen- en editorvensters met `aria-modal="true"`.
- Opeenvolgende drops delen één wachtrij. Alle bestanden van een eerdere drop
  worden afgehandeld voordat de volgende drop begint.
- Een onleesbaar bestand krijgt een foutmelding met bestandsnaam; de overige
  bestanden uit dezelfde drop worden alsnog verwerkt.
- De bestandslijst wordt tijdens de drop gekopieerd, voordat de browser de
  toegang tot `DataTransfer` weer afsluit.
- Eigen neerzetplekken (zoals e-mailbijlagen) en het slepen van tekst blijven
  bij hun eigen afhandeling. Bij ontkoppelen vervallen nog wachtende drops.

## Controle

- `src/neerzetten.test.ts`, `src/Neerzetzone.test.ts` en
  `src/systeembestanden.test.ts`: 12 proeven geslaagd. De proeven voor
  dialoogbeveiliging en opeenvolgende drops keuren de oorspronkelijke
  browserluisteraars van `f4a03889` af.
- TypeScriptcontrole en Vite-productiebouw geslaagd.
- Headless Chromium tegen de productiebouw: instellingenvenster blokkeert
  `dragover` en `drop`; het bestand wordt niet geïmporteerd. Zonder dialoog is
  de neerzetzone zichtbaar en krijgen beide niet-ondersteunde bestanden uit
  één drop hun eigen melding. De zone verdwijnt na loslaten; geen paginafouten.

De lokale proef gebruikte de bestaande afhankelijkheden plus het exacte,
vastgezette pakket `@tauri-apps/plugin-clipboard-manager@2.3.2` uit npm. Dat
pakket ontbrak in de oude lokale `node_modules`; alleen de proefconfiguratie
verwees er apart naar. `--configLoader runner` omzeilde een sandboxbeperking
van de standaard configuratiebundelaar. De repositoryconfiguratie is gelijk
gebleven.

## Resterende scope van #17

Dit herstelt de browserroute. Het invoegen van afbeeldingen op de
neerzetpositie is hiermee niet toegevoegd. De native desktoproute in Rust is
niet gewijzigd of opnieuw functioneel getest. Issue #17 blijft daarom open.
