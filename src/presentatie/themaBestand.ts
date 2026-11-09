import { valideerThema, type Thema } from "./ontwerp";
export const THEMA_BESTAND_MAX = 64 * 1024;
export class ThemaBestandFout extends Error {
  constructor(public code: "invalid" | "tooLarge") {
    super(code);
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function normaliseer(v: unknown): Thema {
  if (
    !object(v) ||
    ![v.naam, v.kop, v.tekst].every(
      (s) => typeof s === "string" && !/[\u0000-\u001f\u007f]/.test(s),
    ) ||
    !Array.isArray(v.kleuren) ||
    !v.kleuren.every((c) => typeof c === "string") ||
    typeof v.achtergrond !== "string"
  )
    throw new ThemaBestandFout("invalid");
  try {
    const t = valideerThema({
      naam: v.naam as string,
      kop: v.kop as string,
      tekst: v.tekst as string,
      kleuren: v.kleuren as string[],
      achtergrond: v.achtergrond,
    });
    return {
      naam: t.naam.trim(),
      kop: t.kop.trim(),
      tekst: t.tekst.trim(),
      kleuren: t.kleuren.map((c) => c.toUpperCase()),
      achtergrond: t.achtergrond.toUpperCase(),
    };
  } catch {
    throw new ThemaBestandFout("invalid");
  }
}
/** Alleen de vijf ontwerpvelden worden opgenomen; geen documentinhoud of fonts. */
export function schrijfThemaBestand(thema: Thema) {
  return new TextEncoder().encode(
    JSON.stringify(
      {
        formaat: "OpenOfficeStudio.Theme",
        versie: 1,
        thema: normaliseer(thema),
      },
      null,
      2,
    ) + "\n",
  );
}
export function leesThemaBestand(bytes: Uint8Array): Thema {
  if (bytes.length > THEMA_BESTAND_MAX) throw new ThemaBestandFout("tooLarge");
  try {
    const v: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true })
        .decode(bytes)
        .replace(/^\uFEFF/, ""),
    );
    if (!object(v) || v.formaat !== "OpenOfficeStudio.Theme" || v.versie !== 1)
      throw new ThemaBestandFout("invalid");
    return normaliseer(v.thema);
  } catch (e) {
    if (e instanceof ThemaBestandFout) throw e;
    throw new ThemaBestandFout("invalid");
  }
}
export function themaBestandsnaam(naam: string) {
  const safe =
    Array.from(naam.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").trim())
      .slice(0, 80)
      .join("")
      .replace(/[. ]+$/g, "") || "theme";
  return `theme-${safe}.oos-theme`;
}
