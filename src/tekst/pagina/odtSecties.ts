/** Sectie-auteurskeuzes die ODF-paginastijlen niet rechtstreeks uitdrukken. */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import {
  attrTekst,
  attr,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  tekstVan,
  vervang,
  zoekAlle,
} from "../../grafieken/xml";
import { metPakket, openDocument, secties, wijzigSectPrs } from "./ooxml";
import { leesSecties, pasSectPrAan, type SectieInstellingen } from "./secties";

const NAAM = "OpenAEC.Writer.Sections.v1";
const META = "urn:oasis:names:tc:opendocument:xmlns:meta:1.0";
type Instelling = Omit<SectieInstellingen, "index" | "verwijzingen"> & {
  eigen: string[];
  groepen?: number[];
};
interface Bewijs {
  versie: 1;
  inhoud: string;
  stijlen: string;
  secties: Instelling[];
}

function pak(bytes: Uint8Array) {
  let totaal = 0,
    aantal = 0;
  return unzipSync(bytes, {
    filter: (f) => {
      totaal += f.originalSize;
      aantal++;
      if (totaal > 256 * 1024 * 1024 || aantal > 10000)
        throw new Error("ODF package exceeds metadata limits");
      return true;
    },
  });
}
async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function bewijs(delen: Record<string, Uint8Array>) {
  if (!delen["content.xml"] || !delen["styles.xml"]) return null;
  const [inhoud, stijlen] = await Promise.all([
    hash(delen["content.xml"]),
    hash(delen["styles.xml"]),
  ]);
  return { inhoud, stijlen };
}
const getal = (x: unknown, min = 0, max = 1000000): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
function instelling(x: unknown): x is Instelling {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const s = x as Instelling;
  return (
    getal(s.breedte, 1) &&
    getal(s.hoogte, 1) &&
    ["staand", "liggend"].includes(s.afdrukstand) &&
    !!s.marges &&
    ["boven", "onder", "links", "rechts", "koptekst", "voettekst", "rug"].every(
      (k) => getal(s.marges[k as keyof typeof s.marges]),
    ) &&
    !!s.kolommen &&
    Number.isInteger(s.kolommen.aantal) &&
    getal(s.kolommen.aantal, 1, 45) &&
    getal(s.kolommen.tussenruimte) &&
    typeof s.kolommen.lijn === "boolean" &&
    (s.kolommen.breedtes === undefined ||
      (Array.isArray(s.kolommen.breedtes) &&
        s.kolommen.breedtes.length === s.kolommen.aantal &&
        s.kolommen.breedtes.every(
          (b) => !!b && getal(b.breedte, 1) && getal(b.ruimte),
        ))) &&
    typeof s.titelpagina === "boolean" &&
    typeof s.notatie === "string" &&
    /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(s.notatie) &&
    (s.beginBij === null ||
      (getal(s.beginBij) && Number.isInteger(s.beginBij))) &&
    ["nextPage", "continuous", "evenPage", "oddPage", "nextColumn"].includes(
      s.begin,
    ) &&
    Array.isArray(s.eigen) &&
    s.eigen.length <= 6 &&
    s.eigen.every((v) => /^(header|footer)\/(default|first|even)$/.test(v)) &&
    new Set(s.eigen).size === s.eigen.length &&
    (s.groepen === undefined ||
      (Array.isArray(s.groepen) &&
        s.groepen.length === s.eigen.length &&
        s.groepen.every((g) => Number.isInteger(g) && getal(g, 0, 1535))))
  );
}

/** Standaard ODF user-defined metadata; normale inhoud en paginastijlen blijven intact. */
export async function bewaarOdtSecties(
  docx: Uint8Array,
  odt: Uint8Array,
): Promise<Uint8Array> {
  const delen = pak(odt),
    som = await bewijs(delen);
  if (!som || !delen["meta.xml"]) return odt;
  const ids = new Map<string, number>();
  const instellingen = leesSecties(docx).map(
    ({ index: _index, verwijzingen, ...s }) => ({
      ...s,
      eigen: verwijzingen.map((r) => `${r.soort}/${r.type}`),
      groepen: verwijzingen.map((r) => {
        const key = r.soort + "/" + r.rid;
        if (!ids.has(key)) ids.set(key, ids.size);
        return ids.get(key)!;
      }),
    }),
  );
  if (instellingen.length > 256 || !instellingen.every(instelling)) return odt;
  const metadata: Bewijs = { versie: 1, ...som, secties: instellingen };
  let xml = strFromU8(delen["meta.xml"]),
    root = leesXml(xml);
  xml = vervang(
    xml,
    zoekAlle(root, "user-defined")
      .filter((el) => attr(el, "name") === NAAM)
      .map((el) => ({ start: el.start, eind: el.eind, tekst: "" })),
  );
  root = leesXml(xml);
  const meta = kind(root, "meta");
  if (!meta) return odt;
  const invoeg = `<meta:user-defined xmlns:meta="${META}" meta:name="${NAAM}" meta:value-type="string">${ontsnap(JSON.stringify(metadata))}</meta:user-defined>`;
  xml = meta.leeg
    ? vervang(xml, [
        {
          start: meta.start,
          eind: meta.eind,
          tekst:
            xml.slice(meta.start, meta.eind).replace(/\/>$/, ">") +
            invoeg +
            `</${meta.naam}>`,
        },
      ])
    : vervang(xml, [
        { start: meta.inhoudEind, eind: meta.inhoudEind, tekst: invoeg },
      ]);
  delen["meta.xml"] = strToU8(xml);
  const pakket: Zippable = {};
  if (delen.mimetype) pakket.mimetype = [delen.mimetype, { level: 0 }];
  for (const [naam, bytes] of Object.entries(delen))
    if (naam !== "mimetype") pakket[naam] = bytes;
  return zipSync(pakket);
}

/** Pas nooit oude auteurskeuzes toe op extern gewijzigde ODF-inhoud of stijlen. */
export async function herstelOdtSecties(
  odt: Uint8Array,
  docx: Uint8Array,
): Promise<Uint8Array> {
  let opgeslagen: Bewijs;
  try {
    const delen = pak(odt);
    if (!delen["meta.xml"] || delen["meta.xml"].length > 1024 * 1024)
      return docx;
    const props = zoekAlle(
      leesXml(strFromU8(delen["meta.xml"])),
      "user-defined",
    ).filter((el) => attr(el, "name") === NAAM);
    if (props.length !== 1) return docx;
    const tekst = tekstVan(props[0]);
    if (tekst.length > 512 * 1024) return docx;
    const m = JSON.parse(tekst) as Bewijs;
    if (
      m.versie !== 1 ||
      !Array.isArray(m.secties) ||
      !m.secties.length ||
      m.secties.length > 256 ||
      !m.secties.every(instelling)
    )
      return docx;
    const som = await bewijs(delen);
    if (!som || m.inhoud !== som.inhoud || m.stijlen !== som.stijlen)
      return docx;
    opgeslagen = m;
  } catch {
    return docx;
  }
  // Controleer eerst de volledige koppeling; bij een andere conversiestructuur
  // blijft de gewone conversie leidend, zonder een gedeeltelijk herstel.
  const nu = leesSecties(docx);
  if (nu.length !== opgeslagen.secties.length) return docx;
  if (
    opgeslagen.secties.some((s, i) =>
      s.eigen.some(
        (key) =>
          !nu[i].verwijzingen.some((r) => `${r.soort}/${r.type}` === key),
      ),
    )
  )
    return docx;
  const groepsdoel = new Map<string, string>();
  opgeslagen.secties.forEach((s, i) =>
    s.eigen.forEach((key, j) => {
      const groep = s.groepen?.[j];
      if (groep === undefined) return;
      const soort = key.split("/")[0],
        id = nu[i].verwijzingen.find(
          (r) => `${r.soort}/${r.type}` === key,
        )!.rid;
      const g = soort + "/" + groep;
      if (!groepsdoel.has(g)) groepsdoel.set(g, id);
    }),
  );
  return metPakket(docx, (pakket) => {
    const doc = openDocument(pakket),
      lijst = secties(doc);
    wijzigSectPrs(
      doc,
      lijst.map((_, i) => i),
      (bron, sectie) => {
        const s = opgeslagen.secties[sectie.index];
        let uit = pasSectPrAan(bron, {
          formaat: { breedte: s.breedte, hoogte: s.hoogte },
          afdrukstand: s.afdrukstand,
          marges: s.marges,
          kolommen: s.kolommen,
          titelpagina: s.titelpagina,
          nummering: { notatie: s.notatie, beginBij: s.beginBij },
          begin: s.begin,
        });
        const el = leesXml(uit);
        uit = vervang(
          uit,
          [
            ...kinderen(el, "headerReference"),
            ...kinderen(el, "footerReference"),
          ].flatMap((r) => {
            const soort = r.lokaal === "headerReference" ? "header" : "footer",
              key = soort + "/" + (attr(r, "type") ?? "default"),
              j = s.eigen.indexOf(key);
            if (j < 0) return [{ start: r.start, eind: r.eind, tekst: "" }];
            const groep = s.groepen?.[j],
              id =
                groep === undefined
                  ? undefined
                  : groepsdoel.get(soort + "/" + groep);
            if (!id || id === attr(r, "id")) return [];
            const idKey =
              Object.keys(r.attrs).find((k) => k.endsWith(":id")) ?? "r:id";
            return [
              {
                start: r.start,
                eind: r.eind,
                tekst:
                  "<" + r.naam + attrTekst({ ...r.attrs, [idKey]: id }) + "/>",
              },
            ];
          }),
        );
        return uit;
      },
    );
    return pakket.inpakken();
  });
}
