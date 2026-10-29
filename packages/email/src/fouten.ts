import i18next from "../../../src/i18n/config";
import type { BackendTekst, MailFout, MailFoutcode } from "./contract";

const CODES: MailFoutcode[] = [
  "verbinding", "aanmelding", "certificaat", "tijdslimiet", "niet-gevonden",
  "geweigerd", "te-groot", "niet-beschikbaar", "intern",
];

/** Sleutel van de uitleg per foutcode in `email:errors.code.*`. */
const CODE_SLEUTEL: Record<MailFoutcode, string> = {
  verbinding: "connection",
  aanmelding: "authentication",
  certificaat: "certificate",
  tijdslimiet: "timeout",
  "niet-gevonden": "notFound",
  geweigerd: "refused",
  "te-groot": "tooLarge",
  "niet-beschikbaar": "unavailable",
  intern: "internal",
};

export class MailFoutMelding extends Error implements MailFout {
  constructor(
    public code: MailFoutcode,
    public melding: string,
    public sleutel?: string,
    public waarden?: Record<string, string>,
  ) {
    super(melding);
  }
}

function alsWaarden(waarde: unknown): Record<string, string> | undefined {
  if (!waarde || typeof waarde !== "object") return undefined;
  const uit: Record<string, string> = {};
  for (const [k, v] of Object.entries(waarde)) if (v !== null && v !== undefined) uit[k] = String(v);
  return uit;
}

/** Zet elke fout (van invoke, de demo of de interface) om naar `MailFout`. */
export function naarMailFout(fout: unknown): MailFoutMelding {
  if (fout instanceof MailFoutMelding) return fout;
  let waarde: unknown = fout;
  if (typeof waarde === "string") {
    try {
      waarde = JSON.parse(waarde);
    } catch {
      // Gewone tekst.
    }
  }
  if (waarde && typeof waarde === "object" && "code" in waarde) {
    const { code, melding, sleutel, waarden } = waarde as {
      code: unknown;
      melding?: unknown;
      sleutel?: unknown;
      waarden?: unknown;
    };
    if (typeof code === "string" && (CODES as string[]).includes(code))
      return new MailFoutMelding(
        code as MailFoutcode,
        String(melding ?? ""),
        typeof sleutel === "string" ? sleutel : undefined,
        alsWaarden(waarden),
      );
  }
  const tekst = fout instanceof Error ? fout.message : String(fout);
  // Een desktopversie zonder e-mailbackend meldt een onbekende opdracht.
  if (/command .*email_.* not found|not allowed|unknown command/i.test(tekst))
    return new MailFoutMelding("niet-beschikbaar", i18next.t("email:errors.backendMissing"));
  return new MailFoutMelding("intern", tekst);
}

/**
 * Vertaalt een tekst uit de backend (fout, testuitslag, OAuth-status). Rust
 * stuurt naast de Nederlandse `melding` een stabiele `sleutel` met `waarden`;
 * die vertalen we via `email:backend.<sleutel>`. Een waarde waarvan de naam op
 * `Key` eindigt, is zelf een sleutel (een deeltekst zoals een reden) en wordt
 * eerst vertaald onder de naam zonder `Key`. Zonder (bekende) sleutel blijft
 * de melding zoals de backend hem gaf.
 */
export function backendTekst(b: BackendTekst | null | undefined): string {
  if (!b) return "";
  const sleutel = b.sleutel ? `email:backend.${b.sleutel}` : "";
  if (!sleutel || !i18next.exists(sleutel)) return b.melding ?? "";
  const waarden: Record<string, string> = {};
  for (const [naam, waarde] of Object.entries(b.waarden ?? {})) {
    if (naam.endsWith("Key") && naam.length > 3) {
      const deel = `email:backend.${waarde}`;
      waarden[naam.slice(0, -3)] = i18next.exists(deel) ? i18next.t(deel) : waarde;
    } else waarden[naam] = waarde;
  }
  return i18next.t(sleutel, waarden);
}

/** Uitleg per oorzaak in de huidige taal. */
export function foutUitleg(code: MailFoutcode): string {
  return i18next.t(`email:errors.code.${CODE_SLEUTEL[code]}`);
}

/** Leesbare melding: uitleg per oorzaak plus de (vertaalde) servermelding. */
export function foutTekst(fout: unknown, context = "") {
  const f = naarMailFout(fout);
  const uitleg = foutUitleg(f.code);
  const melding = backendTekst(f);
  const tekst =
    melding && melding !== uitleg ? i18next.t("email:errors.withDetail", { explanation: uitleg, detail: melding }) : uitleg;
  return context ? i18next.t("email:errors.withContext", { context, message: tekst }) : tekst;
}
