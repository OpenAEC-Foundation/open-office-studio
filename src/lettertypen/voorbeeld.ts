/**
 * Voorbeelden in de lettertypekeuze: elke regel in het lettertype zelf. Pas
 * laden als een regel in beeld komt; tot dan tekent de browser een neutrale
 * terugval met dezelfde regelhoogte, zodat de lijst niet verspringt.
 */
import i18next from "../i18n/config";
import { ALLE_STIJLEN, familieInfo, registreerCss } from "./catalogus";
import { opSysteem, systeemLettertypeBytes } from "./systeem";
import { VERVANGINGEN } from "./vervanging";

export type Herkomst = "meegeleverd" | "extra" | "office" | "systeem" | "onbekend";

export interface KeuzeRegel {
  familie: string;
  herkomst: Herkomst;
  /** Office-lettertype dat hier niet staat: de open vervanger en of die metrisch gelijk is. */
  vervanger?: string;
  metrisch?: boolean;
}

export const NEUTRAAL = 'system-ui, "Segoe UI", sans-serif';

const css = (naam: string) => `"${naam.replace(/["\\]/g, "")}"`;

/** Hoe een familie in de keuzelijst staat. */
export function keuzeRegel(familie: string): KeuzeRegel {
  const info = familieInfo(familie);
  if (info) return { familie: info.familie, herkomst: info.herkomst };
  if (opSysteem(familie)) return { familie, herkomst: "systeem" };
  const regel = VERVANGINGEN[familie.toLowerCase()];
  if (regel) return { familie, herkomst: "office", vervanger: regel.vervanger, metrisch: regel.soort === "metrisch" };
  return { familie, herkomst: "onbekend" };
}

/** De CSS-lettertypefamilie voor het voorbeeld van een regel. */
export function voorbeeldFamilie(regel: KeuzeRegel): string {
  const delen = [css(regel.familie)];
  if (regel.vervanger) delen.push(css(regel.vervanger));
  return `${delen.join(", ")}, ${NEUTRAAL}`;
}

/** Tekent de browser deze naam echt (en niet de terugval)? */
function cssBeschikbaar(naam: string): boolean {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return true;
    const proef = "mmmmmmmmmmlli WQ@#0";
    return ["monospace", "serif", "sans-serif"].some((terugval) => {
      ctx.font = `32px ${terugval}`;
      const zonder = ctx.measureText(proef).width;
      ctx.font = `32px ${css(naam)}, ${terugval}`;
      return ctx.measureText(proef).width !== zonder;
    });
  } catch {
    return true;
  }
}

const systeemGeladen = new Map<string, Promise<boolean>>();

/** Systeemlettertype voor het voorbeeld: via CSS, anders via de bytes (desktop: Rust, browser: queryLocalFonts). */
function laadSysteem(naam: string, alle: boolean): Promise<boolean> {
  const sleutel = `${naam.toLowerCase()}|${alle ? 4 : 1}`;
  let bestaand = systeemGeladen.get(sleutel);
  if (bestaand) return bestaand;
  bestaand = (async () => {
    if (cssBeschikbaar(naam)) return true;
    const stijlen = alle ? ALLE_STIJLEN : ALLE_STIJLEN.slice(0, 1);
    const gelukt = await Promise.all(
      stijlen.map(async ([vet, cursief]) => {
        const bytes = await systeemLettertypeBytes(naam, vet, cursief);
        if (!bytes) return false;
        const face = new FontFace(naam, bytes, { weight: vet ? "700" : "400", style: cursief ? "italic" : "normal" });
        await face.load();
        document.fonts.add(face);
        return true;
      }),
    );
    return gelukt.some(Boolean);
  })().catch(() => false);
  systeemGeladen.set(sleutel, bestaand);
  return bestaand;
}

/**
 * Laadt wat nodig is om de regel in zijn eigen lettertype te tekenen.
 * `alle`: ook vet en cursief (voor de voorbeeldregel).
 */
export async function laadVoorbeeld(regel: KeuzeRegel, alle = false): Promise<boolean> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return false;
  const stijlen = alle ? ALLE_STIJLEN : ALLE_STIJLEN.slice(0, 1);
  switch (regel.herkomst) {
    case "meegeleverd":
    case "extra":
      return registreerCss(regel.familie, regel.familie, stijlen);
    case "systeem":
      return laadSysteem(regel.familie, alle);
    case "office":
      return regel.vervanger ? registreerCss(regel.vervanger, regel.vervanger, stijlen) : false;
    default:
      return false;
  }
}

/** Korte vermelding (licentie, herkomst, vervanging) voor tooltip en infopaneel. */
export function vermelding(regel: KeuzeRegel): string {
  const t = (sleutel: string, waarden?: Record<string, string | undefined>) =>
    i18next.t(`fonts:attribution.${sleutel}`, waarden);
  if (regel.herkomst === "systeem") return t("system");
  if (regel.herkomst === "office")
    return t(regel.metrisch ? "officeMetric" : "officeApproximation", {
      substitute: regel.vervanger,
      font: regel.familie,
    });
  if (regel.herkomst === "onbekend") return t("unknown");
  const info = familieInfo(regel.familie)!;
  const licentie = t("license", {
    license: info.licentie === "OFL-1.1" ? "SIL Open Font License 1.1" : info.licentie,
    source: info.herkomst === "extra" ? info.bron : t("bundled", { package: "@betteroffice/fonts" }),
  });
  return info.metrischVoor ? `${licentie} ${t("metricCompatible", { font: info.metrischVoor })}` : licentie;
}
