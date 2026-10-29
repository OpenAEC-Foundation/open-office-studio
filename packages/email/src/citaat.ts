import i18next from "../../../src/i18n/config";
import { formatDatumTijd } from "../../../src/i18n/opmaak";
import type { Adres, Bericht } from "./contract";
import { formatAdres, formatAdressen, uniekeAdressen } from "./adressen";
import { escapeTekst, saneerHtml, tekstNaarHtml } from "./sanitizer";

export type AntwoordModus = "antwoord" | "allen" | "doorsturen";

export interface OpstelBegin {
  aan?: Adres[];
  cc?: Adres[];
  bcc?: Adres[];
  onderwerp?: string;
  /** Platte tekst onder de cursor (citaat of doorgestuurd bericht). */
  tekst?: string;
  /** Gesaneerde HTML onder de cursor. */
  html?: string;
  inReplyTo?: string;
  referenties?: string;
  /** Bericht waarop wordt gereageerd, voor de vlag "beantwoord". */
  bron?: { accountId: string; map: string; uid: number; modus: AntwoordModus };
  bijlagen?: { bestandsnaam: string; inhoudstype: string; bytes: Uint8Array }[];
}

const ANTWOORD = /^\s*((re|aw|antw|sv|vs|r)(\[\d+\])?\s*:\s*)+/i;
const DOORSTUUR = /^\s*((fwd?|doorst|wg|tr|fw)(\[\d+\])?\s*:\s*)+/i;

export function onderwerpVoorAntwoord(onderwerp: string) {
  const kern = onderwerp.replace(ANTWOORD, "").trim();
  return `Re: ${kern}`;
}

export function onderwerpVoorDoorsturen(onderwerp: string) {
  const kern = onderwerp.replace(DOORSTUUR, "").trim();
  return `Fwd: ${kern}`;
}

/** References = eerdere References (of In-Reply-To) + Message-ID van het bericht. */
export function bouwReferenties(bericht: Pick<Bericht, "berichtId" | "inReplyTo" | "referenties">) {
  const ids = [
    ...(bericht.referenties ?? bericht.inReplyTo ?? "").split(/\s+/),
    bericht.berichtId ?? "",
  ]
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => (id.startsWith("<") ? id : `<${id}>`));
  return [...new Set(ids)].join(" ");
}

export function citeerTekst(tekst: string) {
  return tekst
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "")
    .split("\n")
    .map((regel) => (regel.startsWith(">") ? `>${regel}` : `> ${regel}`).replace(/\s+$/, ""))
    .join("\n");
}

export function formatDatum(datum?: string) {
  if (!datum) return "";
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return datum;
  return formatDatumTijd(d, { dateStyle: "long", timeStyle: "short" });
}

function citaatKop(bericht: Bericht) {
  const afzender = bericht.van[0] ? formatAdres(bericht.van[0]) : i18next.t("email:quote.unknownSender");
  const datum = formatDatum(bericht.datum);
  return datum
    ? i18next.t("email:quote.wroteOn", { date: datum, sender: afzender })
    : i18next.t("email:quote.wrote", { sender: afzender });
}

/** Inhoud van het origineel als veilige HTML (voor citaat of doorsturen). */
function origineelHtml(bericht: Bericht) {
  return bericht.html.trim()
    ? saneerHtml(bericht.html, { stijlblokken: false, klassen: false }).html
    : // Regeleinden expliciet, want in het opstelvenster geldt geen pre-wrap.
      tekstNaarHtml(bericht.tekst).replace(/\r?\n/g, "<br>");
}

/**
 * Bouwt het begin van een antwoord of doorgestuurd bericht: ontvangers,
 * onderwerp, citaat (tekst en HTML) en de draadkoppen In-Reply-To/References.
 * Eigen adressen worden bij "allen beantwoorden" weggelaten.
 */
export function bouwAntwoord(
  bericht: Bericht,
  modus: AntwoordModus,
  eigenAdressen: string[],
  accountId = "",
): OpstelBegin {
  const bron = { accountId, map: bericht.map, uid: bericht.uid, modus };
  if (modus === "doorsturen") {
    const kop = [
      `-------- ${i18next.t("email:quote.forwarded")} --------`,
      i18next.t("email:quote.subject", { value: bericht.onderwerp }),
      i18next.t("email:quote.date", { value: formatDatum(bericht.datum) }),
      i18next.t("email:quote.from", { value: formatAdressen(bericht.van) }),
      i18next.t("email:quote.to", { value: formatAdressen(bericht.aan) }),
      ...(bericht.cc.length ? [i18next.t("email:quote.cc", { value: formatAdressen(bericht.cc) })] : []),
    ];
    return {
      onderwerp: onderwerpVoorDoorsturen(bericht.onderwerp),
      tekst: `\n\n${kop.join("\n")}\n\n${bericht.tekst}`,
      html: `<p><br></p><div class="doorgestuurd"><p>${kop.map(escapeTekst).join("<br>")}</p>${origineelHtml(bericht)}</div>`,
      bron,
    };
  }
  const antwoordAan = bericht.antwoordAan.length ? bericht.antwoordAan : bericht.van;
  let aan = uniekeAdressen(antwoordAan, eigenAdressen);
  let cc: Adres[] = [];
  if (modus === "allen") {
    aan = uniekeAdressen([...antwoordAan, ...bericht.aan], eigenAdressen);
    cc = uniekeAdressen(bericht.cc, [...eigenAdressen, ...aan.map((a) => a.adres)]);
    // Eigen bericht in Verzonden beantwoorden: dan gaat het naar de oorspronkelijke ontvangers.
    if (!aan.length) aan = uniekeAdressen(bericht.aan);
  } else if (!aan.length) {
    aan = uniekeAdressen(bericht.aan, eigenAdressen);
  }
  const kop = citaatKop(bericht);
  return {
    aan,
    cc,
    onderwerp: onderwerpVoorAntwoord(bericht.onderwerp),
    tekst: `\n\n${kop}\n${citeerTekst(bericht.tekst)}`,
    html: `<p><br></p><p>${escapeTekst(kop)}</p><blockquote type="cite">${origineelHtml(bericht)}</blockquote>`,
    inReplyTo: bericht.berichtId,
    referenties: bouwReferenties(bericht) || undefined,
    bron,
  };
}
