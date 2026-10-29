import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import { OfficeStudio } from "./OfficeStudio";
import { bewaarWasmInGeheugen } from "./wasmGeheugen";
import { gereed as taalGereed } from "./i18n/config";
import { installeerWerkplekHost } from "./werkplek";
import versie from "../versie.json";
import "../packages/database/src/database.css";
import "./stijl/openaec-office.css";
bewaarWasmInGeheugen();
// In de SuperCloud-werkplek: opslaan en openen via de gastpagina (src/werkplek.ts).
installeerWerkplekHost(versie.versie);
// Desktop: het voorstellingsvenster op een tweede monitor (src/presentatie/toeschouwerKanaal.ts).
const voorstelling = new URLSearchParams(location.search).get("voorstelling");
// Eerst de gekozen taal laden (een eigen chunk behalve nl/en), dan pas tekenen.
void taalGereed.finally(async () => {
  const wortel = createRoot(document.getElementById("root")!);
  if (voorstelling) {
    const { ToeschouwerVenster } = await import("./presentatie/ToeschouwerVenster");
    wortel.render(<ToeschouwerVenster sessie={voorstelling} />);
    return;
  }
  wortel.render(
    <React.StrictMode>
      <OfficeStudio />
    </React.StrictMode>,
  );
});
