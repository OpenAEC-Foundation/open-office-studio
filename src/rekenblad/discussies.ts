/** Standard Excel threaded comments and their mandatory legacy placeholders. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  tekstVan,
  vervang,
} from "../grafieken/xml";
import { adres } from "../lint/rekenblad-logica";
import {
  gebied,
  kindToevoegen,
  tagXml,
  werkmap,
  zetAttrs,
} from "./werkboekXml";
import {
  notitieBladBeschermd,
  schrijfDiscussiePlaceholder,
} from "./celnotities";

export const DISCUSSIE_NS =
  "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments";
const REL = "http://schemas.microsoft.com/office/2017/10/relationships/";
const leesXtekst = (s: string) =>
  s.replace(/_x([0-9a-f]{4})_/gi, (_, code: string) =>
    String.fromCharCode(parseInt(code, 16)),
  );
const schrijfXtekst = (s: string) =>
  s
    .replace(/_x[0-9a-f]{4}_/gi, (s) => "_x005F_" + s.slice(1))
    .replace(
      /[\u0000-\u0008\u000B-\u001F\uFFFE\uFFFF]/g,
      (c) =>
        `_x${c.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}_`,
    );
export interface Bericht {
  id: string;
  persoon: string;
  auteur: string;
  tekst: string;
  tijd: string;
}
export interface Discussie {
  id: string;
  cel: string;
  opgelost: boolean;
  berichten: Bericht[];
}
export class Discussiefout extends Error {
  constructor(
    public code:
      | "damaged"
      | "existingNote"
      | "missing"
      | "invalidText"
      | "protectedSheet",
  ) {
    super(code);
  }
}
export function discussieDeel(
  p: Pakket,
  pad: string,
  soort: "threadedComment" | "person",
) {
  const rel = p
    .relaties(pad)
    .filter((r) => !r.extern && r.type.endsWith(`/${soort}`));
  if (rel.length > 1) throw new Discussiefout("damaged");
  const doel = rel[0] && Pakket.doelPad(pad, rel[0].target);
  if (doel && p.verwijzingenNaar(doel).length > 1)
    throw new Discussiefout("damaged");
  return doel || null;
}
const canon = (s: string) => {
  const b = gebied(s);
  if (b.top !== b.bottom || b.left !== b.right)
    throw new Discussiefout("damaged");
  return adres({ row: b.top, col: b.left });
};
function leesPersonen(p: Pakket) {
  const pad = discussieDeel(p, werkmap(p).pad, "person"),
    personen = new Map<string, string>();
  if (pad)
    for (const el of kinderen(leesXml(p.lees(pad)), "person")) {
      const id = attr(el, "id");
      if (!id || personen.has(id)) throw new Discussiefout("damaged");
      personen.set(id, leesXtekst(attr(el, "displayName") ?? ""));
    }
  return personen;
}
export function leesDiscussies(bytes: Uint8Array | Pakket): Discussie[][] {
  const p = bytes instanceof Pakket ? bytes : new Pakket(bytes),
    wb = werkmap(p),
    personen = leesPersonen(p);
  const alleIds = new Set<string>();
  return wb.bladen.map((blad) => {
    const pad = discussieDeel(p, blad.pad, "threadedComment");
    if (!pad) return [];
    const root = leesXml(p.lees(pad));
    if (root.lokaal !== "ThreadedComments") throw new Discussiefout("damaged");
    const elementen = kinderen(root, "threadedComment");
    const lijst = new Map<string, Discussie>();
    // A ref may be omitted: recover it from the linked legacy placeholder.
    const legacyRel = p
      .relaties(blad.pad)
      .find((r) => !r.extern && r.type.endsWith("/comments"));
    const legacy =
      legacyRel && leesXml(p.lees(Pakket.doelPad(blad.pad, legacyRel.target)));
    const auteurs = kinderen(kind(legacy, "authors"), "author").map(tekstVan);
    const plaats = new Map(
      kinderen(kind(legacy, "commentList"), "comment").map((c) => [
        auteurs[Number(attr(c, "authorId"))]?.replace(/^tc=/, ""),
        attr(c, "ref"),
      ]),
    );
    for (const el of elementen) {
      const id = attr(el, "id"),
        persoon = attr(el, "personId");
      if (!id || !persoon || alleIds.has(id))
        throw new Discussiefout("damaged");
      alleIds.add(id);
      if (!attr(el, "parentId")) {
        const ref = attr(el, "ref") || plaats.get(id);
        if (!ref) throw new Discussiefout("damaged");
        lijst.set(id, {
          id,
          cel: canon(ref),
          opgelost: /^(1|true)$/i.test(attr(el, "done") ?? ""),
          berichten: [],
        });
      }
    }
    const cellen = new Set<string>();
    for (const d of lijst.values()) {
      if (cellen.has(d.cel)) throw new Discussiefout("damaged");
      cellen.add(d.cel);
    }
    for (const el of elementen) {
      const id = attr(el, "id")!,
        d = lijst.get(attr(el, "parentId") || id);
      if (!d || (attr(el, "ref") && canon(attr(el, "ref")!) !== d.cel))
        throw new Discussiefout("damaged");
      const persoon = attr(el, "personId")!;
      d.berichten.push({
        id,
        persoon,
        auteur: personen.get(persoon) ?? "",
        tekst: leesXtekst(tekstVan(kind(el, "text"))),
        tijd: attr(el, "dT") ?? "",
      });
    }
    for (const d of lijst.values())
      d.berichten.sort((a, b) =>
        a.id === d.id ? -1 : b.id === d.id ? 1 : a.tijd.localeCompare(b.tijd),
      );
    return [...lijst.values()].sort((a, b) => {
      const x = gebied(a.cel),
        y = gebied(b.cel);
      return x.top - y.top || x.left - y.left;
    });
  });
}
const guid = () => `{${crypto.randomUUID().toUpperCase()}}`;
function persoonToevoegen(p: Pakket, auteur: string) {
  const wb = werkmap(p);
  let pad = discussieDeel(p, wb.pad, "person");
  if (!pad) {
    pad = p.vrijPad("xl/persons/person#.xml");
    p.schrijf(pad, `<personList xmlns="${DISCUSSIE_NS}"/>`);
    p.voegRelatieToe(wb.pad, REL + "person", pad);
    p.voegOverrideToe(pad, "application/vnd.ms-excel.person+xml");
  }
  const xml = p.lees(pad),
    root = leesXml(xml);
  const bestaand = kinderen(root, "person").find(
    (el) =>
      leesXtekst(attr(el, "displayName") ?? "") === auteur &&
      attr(el, "providerId") === "None" &&
      leesXtekst(attr(el, "userId") ?? "") === auteur,
  );
  if (bestaand) return attr(bestaand, "id")!;
  const id = guid();
  p.schrijf(
    pad,
    kindToevoegen(
      xml,
      root,
      `<person xmlns="${DISCUSSIE_NS}"${attrTekst({ displayName: schrijfXtekst(auteur), id, userId: schrijfXtekst(auteur), providerId: "None" })}/>`,
    ),
  );
  return id;
}
export type DiscussieWijziging =
  | { soort: "nieuw"; cel: string; auteur: string; tekst: string }
  | { soort: "antwoord"; id: string; auteur: string; tekst: string }
  | { soort: "oplossen"; id: string; opgelost: boolean }
  | { soort: "verwijderen"; id: string };
export function wijzigDiscussie(
  bytes: Uint8Array,
  blad: number,
  wijziging: DiscussieWijziging,
) {
  if (notitieBladBeschermd(bytes, blad))
    throw new Discussiefout("protectedSheet");
  const lijst = leesDiscussies(bytes)[blad];
  if (!lijst) throw new Discussiefout("missing");
  if (
    "tekst" in wijziging &&
    (!wijziging.tekst.trim() ||
      wijziging.tekst.length > 32767 ||
      !wijziging.auteur.trim() ||
      wijziging.auteur.trim().length > 255)
  )
    throw new Discussiefout("invalidText");
  const bestaand =
    wijziging.soort === "nieuw"
      ? undefined
      : lijst.find((d) => d.id === wijziging.id);
  if (wijziging.soort !== "nieuw" && !bestaand)
    throw new Discussiefout("missing");
  const cel =
    wijziging.soort === "nieuw" ? canon(wijziging.cel) : bestaand!.cel;
  if (wijziging.soort === "nieuw" && lijst.some((d) => d.cel === cel))
    throw new Discussiefout("existingNote");
  const p = new Pakket(bytes),
    ws = werkmap(p).bladen[blad].pad;
  let pad = discussieDeel(p, ws, "threadedComment");
  if (!pad) {
    pad = p.vrijPad("xl/threadedComments/threadedComment#.xml");
    p.schrijf(pad, `<ThreadedComments xmlns="${DISCUSSIE_NS}"/>`);
    p.voegRelatieToe(ws, REL + "threadedComment", pad);
    p.voegOverrideToe(pad, "application/vnd.ms-excel.threadedcomments+xml");
  }
  const id = bestaand?.id ?? guid();
  if (bestaand) {
    const xml = p.lees(pad),
      el = kinderen(leesXml(xml), "threadedComment").find(
        (el) => attr(el, "id") === id,
      )!;
    if (!attr(el, "ref")) p.schrijf(pad, zetAttrs(xml, el, { ref: cel }));
  }
  // Delete the fallback before deleting the source thread that authenticates it.
  if (wijziging.soort === "verwijderen") {
    const q = new Pakket(
      schrijfDiscussiePlaceholder(p.inpakken(), blad, cel, id, null),
    );
    const xml = q.lees(pad),
      root = leesXml(xml);
    q.schrijf(
      pad,
      vervang(
        xml,
        kinderen(root, "threadedComment")
          .filter((el) => attr(el, "id") === id || attr(el, "parentId") === id)
          .map((el) => ({ start: el.start, eind: el.eind, tekst: "" })),
      ),
    );
    return q.inpakken();
  }
  if (wijziging.soort === "oplossen") {
    const xml = p.lees(pad),
      root = kinderen(leesXml(xml), "threadedComment").find(
        (el) => attr(el, "id") === id,
      )!;
    p.schrijf(
      pad,
      zetAttrs(xml, root, { done: wijziging.opgelost ? "1" : "0" }),
    );
  } else {
    if (bestaand?.opgelost) throw new Discussiefout("missing");
    const persoon = persoonToevoegen(p, wijziging.auteur.trim());
    const xml = p.lees(pad),
      root = leesXml(xml);
    p.schrijf(
      pad,
      kindToevoegen(
        xml,
        root,
        `<threadedComment xmlns="${DISCUSSIE_NS}"${attrTekst({ ref: cel, id: wijziging.soort === "nieuw" ? id : guid(), personId: persoon, dT: new Date().toISOString(), ...(wijziging.soort === "antwoord" ? { parentId: id } : {}) })}><text xml:space="preserve">${ontsnap(schrijfXtekst(wijziging.tekst))}</text></threadedComment>`,
      ),
    );
  }
  const uit = p.inpakken(),
    d = leesDiscussies(uit)[blad].find((d) => d.id === id)!;
  return schrijfDiscussiePlaceholder(
    uit,
    blad,
    cel,
    id,
    d.berichten
      .map(
        (b) => `${b.auteur}${b.tijd ? " (" + b.tijd + ")" : ""}:\n${b.tekst}`,
      )
      .join("\n\n"),
  );
}

/** Update all refs, including replies, together; unknown attributes and children survive. */
export function verplaatsDiscussies(
  bytes: Uint8Array,
  wijzigingen: Map<number, Map<string, string | null>>,
) {
  if (!wijzigingen.size) return bytes;
  const p = new Pakket(bytes),
    wb = werkmap(p);
  for (const [blad, cellen] of wijzigingen) {
    const pad =
      wb.bladen[blad] &&
      discussieDeel(p, wb.bladen[blad].pad, "threadedComment");
    if (!pad) continue;
    const xml = p.lees(pad),
      lijst = leesDiscussies(p)[blad];
    const doelen = new Map(
      lijst
        .filter((d) => cellen.has(d.cel))
        .flatMap((d) =>
          d.berichten.map((b) => [b.id, cellen.get(d.cel)!] as const),
        ),
    );
    p.schrijf(
      pad,
      vervang(
        xml,
        kinderen(leesXml(xml), "threadedComment")
          .filter((el) => doelen.has(attr(el, "id")!))
          .map((el) => ({
            start: el.start,
            eind: el.eind,
            tekst:
              doelen.get(attr(el, "id")!) === null
                ? ""
                : tagXml(el, xml.slice(el.inhoudStart, el.inhoudEind), {
                    ...el.attrs,
                    ref: doelen.get(attr(el, "id")!)!,
                  }),
          })),
      ),
    );
  }
  return p.inpakken();
}
