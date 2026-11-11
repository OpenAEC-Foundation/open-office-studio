/**
 * De vaste editor-API kan geen initialen meegeven bij addComment. Bewaar de
 * keuze daarom bij de nieuw gemaakte opmerking en voeg haar bij serialisatie
 * toe. Bestaande opmerkingen en de identiteit van andere auteurs blijven intact.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { Pakket, REL } from "../../grafieken/pakket";
import {
  attrNs,
  kinderen,
  leesXml,
  ontsnap,
  vervang,
  voorvoegselVoor,
  type Vervanging,
} from "../../grafieken/xml";

type Editor = Pick<DocxEditorRef, "getComments">;
interface Identiteit {
  auteur: string;
  datum: string;
  initialen: string;
}
const keuzes = new WeakMap<object, Map<number, Identiteit>>();
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const COMMENTS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";

// De editor geeft milliseconden terug, maar schrijft w:date met hele seconden.
function datumSleutel(datum: string) {
  const tijd = Date.parse(datum);
  return Number.isFinite(tijd) ? String(Math.floor(tijd / 1000)) : datum;
}

export function noteerOpmerkingInitialen(
  handle: object,
  ref: Editor,
  id: number,
  initialen: string,
) {
  const opmerking = ref.getComments().find((c) => c.id === id);
  if (!opmerking) return;
  noteerNieuweOpmerkingInitialen(handle, opmerking, initialen);
}

/** Het reply-event bevat de nieuwe identiteit al, vóór de React-projectie. */
export function noteerNieuweOpmerkingInitialen(
  handle: object,
  opmerking: { id: number; author: string; date?: string },
  initialen: string,
) {
  let kaart = keuzes.get(handle);
  if (!kaart) keuzes.set(handle, (kaart = new Map()));
  kaart.set(opmerking.id, {
    auteur: opmerking.author,
    datum: datumSleutel(opmerking.date ?? ""),
    initialen: initialen.trim(),
  });
}

export function bewaarOpmerkingInitialen(
  handle: object,
  bytes: Uint8Array,
): Uint8Array {
  const kaart = keuzes.get(handle);
  if (!kaart?.size) return bytes;
  const pakket = new Pakket(bytes);
  const hoofd = pakket
    .relaties("")
    .find((r) => r.type === REL.officeDocument && !r.extern);
  if (!hoofd) return bytes;
  const document = Pakket.doelPad("", hoofd.target);
  const relatie = pakket
    .relaties(document)
    .find((r) => r.type === COMMENTS && !r.extern);
  if (!relatie) return bytes;
  const pad = Pakket.doelPad(document, relatie.target);
  const xml = pakket.lees(pad);
  const wijzigingen: Vervanging[] = [];
  for (const c of kinderen(leesXml(xml), "comment")) {
    const id = attrNs(c, W, "id");
    const keuze = id === undefined ? undefined : kaart.get(Number(id));
    if (
      !keuze ||
      attrNs(c, W, "author") !== keuze.auteur ||
      datumSleutel(attrNs(c, W, "date") ?? "") !== keuze.datum
    )
      continue;
    const voorvoegsel = voorvoegselVoor(c, W);
    if (!voorvoegsel) continue;
    // Alleen de begintag vervangen; inhoud, antwoorden en onbekende XML behouden.
    const eind = c.inhoudStart - (c.leeg ? 2 : 1);
    const begin = xml.slice(c.start, eind);
    const attribuut = `${voorvoegsel}:initials`;
    const patroon = new RegExp(`\\s${attribuut}\\s*=\\s*(?:"[^"]*"|'[^']*')`);
    const zonder = begin.replace(patroon, "");
    wijzigingen.push({
      start: c.start,
      eind,
      tekst: `${zonder} ${attribuut}="${ontsnap(keuze.initialen)}"`,
    });
  }
  if (!wijzigingen.length) return bytes;
  pakket.schrijf(pad, vervang(xml, wijzigingen));
  return pakket.inpakken();
}
