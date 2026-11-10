import { maakLettertypeBron } from "../../lettertypen/provider";
import { opSysteem } from "../../lettertypen/systeem";
import { lettertypeBasis } from "../../lettertypen/catalogus";

type VeldTekst = { font?: string; fallbackFont?: string; field?: unknown };
const geladen = new Map<string, Promise<string | null>>();
let volgnummer = 0;

/**
 * Bij het afdrukken vallen gevormde veldruns terug op browsertekst, zonder
 * de glyphcache van de editor. Canvas kiest dan zelfstandig een systeemfont.
 * Gebruik voor deze runs dezelfde bytes als de indeling, onder een eigen CSS-naam. Gewone
 * tekst en de documentgebonden aliassen voor ingesloten fonts blijven intact.
 */
export async function veldMetLettertype<T extends VeldTekst>(run: T, documentFamilies?: ReadonlyMap<string, string>): Promise<T> {
  if (!run.field || typeof FontFace === "undefined" || typeof document === "undefined") return run;
  const eigenschap = run.fallbackFont ? "fallbackFont" : "font";
  const m = /^(.*?\d+(?:\.\d+)?px\s+)([^,]+)(.*)$/.exec(run[eigenschap] ?? "");
  if (!m) return run;
  const familie = m[2].trim().replace(/^["']|["']$/g, "");
  if ([...(documentFamilies?.keys() ?? [])].some(f => f.toLowerCase() === familie.toLowerCase())) return run;
  const vet = /\b(?:bold|[6-9]00)\b/.test(m[1]);
  const cursief = /\b(?:italic|oblique)\b/.test(m[1]);
  const sleutel = `${familie.toLowerCase()}|${+vet}|${+cursief}|${+opSysteem(familie)}`;
  let klaar = geladen.get(sleutel);
  if (!klaar) {
    const laad = maakLettertypeBron({ baseUrl: lettertypeBasis() }).resolve(familie, vet, cursief);
    // Ingesloten fonts hebben al een documentgebonden CSS-alias; die kent de
    // appbron niet. Zonder dezelfde bronbytes veranderen we de tekenaar niet.
    if (!laad) return run;
    const naam = `oos-veld-${++volgnummer}`;
    klaar = (async () => {
      const face = new FontFace(naam, await laad(), {
        weight: vet ? "700" : "400", style: cursief ? "italic" : "normal",
      });
      await face.load();
      document.fonts.add(face);
      return naam;
    })().catch(() => {
      geladen.delete(sleutel);
      return null;
    });
    geladen.set(sleutel, klaar);
  }
  const naam = await klaar;
  return naam ? { ...run, [eigenschap]: `${m[1]}"${naam}", ${m[2]}${m[3]}` } : run;
}
