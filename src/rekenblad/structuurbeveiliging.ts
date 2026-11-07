import type { WorkbookHandle } from "@betteroffice/xlsx";
import { strFromU8, unzipSync } from "fflate";
import i18next from "../i18n/config";
import { attr, kinderen, leesXml } from "../grafieken/xml";
import { Pakket } from "../grafieken/pakket";

const voorbereid = new WeakMap<WorkbookHandle, boolean>();
const structuurOps = new Set(["addSheet", "removeSheet", "renameSheet", "moveSheet"]);

/** Lees uitsluitend de pakketrelatie en werkmapmetadata, geen werkbladcellen. */
export function leesStructuurBeveiliging(bytes: Uint8Array): boolean {
  const deel = (naam: string) => {
    const delen = unzipSync(bytes, { filter: f => f.name === naam });
    if (!delen[naam]) throw new Error(`Ontbrekend werkmaponderdeel: ${naam}`);
    return strFromU8(delen[naam]);
  };
  const relaties = kinderen(leesXml(deel("_rels/.rels")), "Relationship");
  const hoofden = relaties.filter(r => attr(r, "Type")?.endsWith("/officeDocument"));
  if (hoofden.length !== 1 || attr(hoofden[0], "TargetMode") === "External")
    throw new Error("De interne werkmaprelatie is niet eenduidig.");
  const doel = attr(hoofden[0], "Target");
  if (!doel) throw new Error("De werkmaprelatie heeft geen doel.");
  const xml = leesXml(deel(Pakket.doelPad("", doel)));
  const bescherming = kinderen(xml, "workbookProtection");
  return bescherming.some(p => {
    const waarde = attr(p, "lockStructure");
    // Een onbekende, aanwezige vlag nooit als toestemming uitleggen.
    return waarde != null && waarde !== "0" && waarde !== "false";
  });
}

export function structuurBeveiligd(h: WorkbookHandle): boolean {
  return voorbereid.get(h) ?? false;
}

/** Begrens ook de structurele routes van de ingebouwde editor, vóór de eerste invoer. */
export function bereidStructuurBeveiliging(h: WorkbookHandle, bytes: Uint8Array): void {
  if (voorbereid.has(h)) return;
  const beveiligd = leesStructuurBeveiliging(bytes);
  if (beveiligd) {
    const toepassen = h.applyOps;
    h.applyOps = ops => {
      if (ops.some(op => structuurOps.has(op.type)))
        throw new Error(i18next.t("spreadsheet:sheets.structureLocked"));
      return toepassen.call(h, ops);
    };
  }
  voorbereid.set(h, beveiligd);
}
