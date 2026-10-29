/**
 * Waarschuwing voor een vergeten bijlage, zoals in Thunderbird: noemt de
 * eigen tekst (dus niet het citaat of het doorgestuurde deel) een bijlage
 * terwijl er geen is toegevoegd?
 */
import i18next from "../../../src/i18n/config";

const SLEUTELWOORDEN = [
  "bijlage",
  "bijlagen",
  "bijgevoegd",
  "bijgevoegde",
  "bijgaand",
  "bijgaande",
  "meegestuurd",
  "toegevoegd bestand",
  "in de bijlage",
  "zie bijlage",
  "attachment",
  "attachments",
  "attached",
  "enclosed",
  "anbei",
  "anhang",
  "pièce jointe",
];

/** Vaste woorden plus die van de interfacetaal (`email:compose.forgotAttachment.keywords`, gescheiden door |). */
function sleutelwoorden() {
  const eigen = i18next
    .t("email:compose.forgotAttachment.keywords")
    .split("|")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...SLEUTELWOORDEN, ...eigen])];
}

/** Alleen de eigen tekst: zonder geciteerde regels, citaatkop en handtekening. */
export function eigenTekst(tekst: string) {
  const regels = tekst.replace(/\r\n?/g, "\n").split("\n");
  const uit: string[] = [];
  for (const regel of regels) {
    if (/^-{4,} ?Doorgestuurd bericht ?-{4,}/i.test(regel)) break;
    if (/^-{2,} ?(Original Message|Forwarded message|Oorspronkelijk bericht)/i.test(regel)) break;
    if (/^Op .+ schreef .+:\s*$/.test(regel) || /^On .+ wrote:\s*$/.test(regel)) break;
    if (regel === "-- ") break; // handtekeningscheiding
    if (regel.startsWith(">")) continue;
    uit.push(regel);
  }
  return uit.join("\n");
}

/** Geeft het gevonden woord terug als er een bijlage lijkt te ontbreken, anders null. */
export function vergetenBijlage(tekst: string, onderwerp: string, aantalBijlagen: number): string | null {
  if (aantalBijlagen > 0) return null;
  const doorzoek = `${onderwerp}\n${eigenTekst(tekst)}`.toLowerCase();
  for (const woord of sleutelwoorden()) {
    const veilig = woord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    const patroon = new RegExp(`(^|[^\\p{L}\\p{N}])${veilig}($|[^\\p{L}\\p{N}])`, "u");
    if (patroon.test(doorzoek)) return woord;
  }
  return null;
}
