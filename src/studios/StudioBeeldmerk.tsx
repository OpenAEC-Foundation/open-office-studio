import type { Studio, StudioModule } from "./model";
import { studios } from "./model";
import openaecSymbool from "../stijl/openaec-symbol.svg";
import "./beeldmerk.css";

/** Exacte goedgekeurde rasterbron; de bedrijfsidentiteit blijft een apart beeldmerk. */
export function StudioBeeldmerk({ studio, module, grootte = 24 }: {
  studio?: Studio;
  module?: StudioModule;
  grootte?: number;
}) {
  const app = studio ?? studios.find(s => s.module === module);
  const src = app?.beeldmerk
    ? `${import.meta.env.BASE_URL}${app.beeldmerk.bestand}`
    : openaecSymbool;
  return <img className="studio-beeldmerk" src={src} width={grootte} height={grootte} alt="" draggable={false} />;
}
