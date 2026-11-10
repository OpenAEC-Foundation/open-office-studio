/** Complete in-workbook worksheet copy, retaining the reachable OPC graph. */
import { Pakket } from "../grafieken/pakket";
import { LIMIETEN } from "../grafieken/fouten";
import {
  attr,
  kind,
  kinderen,
  leesXml,
  leesWerkbladXml,
  ontsnap,
  rid,
  tekstVan,
  vervang,
  zoekAlle,
  type Vervanging,
  type XmlElement,
} from "../grafieken/xml";
import { maakOnderdeelKopie } from "../pakket/kopieren";
import { bladnaamFout } from "../lint/rekenblad-logica";
import { leesStructuurBeveiliging } from "./structuurbeveiliging";
import {
  fragment,
  metInhoud,
  voorvoegsel,
  werkbladDeel,
  xmlAttribuut,
} from "./pakket";
import { zetBladSelectie } from "./bladEigenschappen";
import { kopieFormule, xmlTags } from "./bladkopieFormules";
import i18next from "../i18n/config";

const fout = (code: string) =>
  new Error(i18next.t(`spreadsheet:sheets.${code}`));
const guid = () => `{${crypto.randomUUID().toUpperCase()}}`;
const vrij = (naam: string, bezet: Set<string>) => {
  for (let i = 2; i < 100000; i++) {
    const suffix = `_${i}`,
      nieuw = naam.slice(0, 255 - suffix.length) + suffix;
    if (!bezet.has(nieuw.toLowerCase())) {
      bezet.add(nieuw.toLowerCase());
      return nieuw;
    }
  }
  throw fout("copyInvalid");
};
const kopiePad = (p: Pakket, pad: string) => {
  const dot = pad.lastIndexOf("."),
    slash = pad.lastIndexOf("/");
  return p.vrijPad(
    dot > slash
      ? `${pad.slice(0, dot)}_copy#${pad.slice(dot)}`
      : `${pad}_copy#`,
  );
};
function beginTag(
  xml: string,
  token: { begin: number; eind: number; leeg: boolean },
) {
  const s = xml.slice(token.begin, token.eind);
  return leesXml(token.leeg ? s : s.replace(/>$/, "/>"));
}

/** Rewrites formula/identity fields without constructing a worksheet cell tree. */
function kopieXml(
  xml: string,
  ct: string,
  bron: string,
  naam: string,
  tabellen: Map<string, string>,
  ids: Map<string, string>,
  tabel?: { id: number; naam: string },
  pivot?: string,
  codeNaam?: string,
): string {
  const worksheet = /worksheet\+xml$/.test(ct),
    chart = /chart\+xml$/.test(ct),
    table = /table\+xml$/.test(ct),
    vml = /vmlDrawing/.test(ct),
    thread = /threadedcomments/i.test(ct),
    comments = /comments\+xml$/.test(ct) && !thread;
  const formules = new Set(
    worksheet
      ? ["f", "formula", "formula1", "formula2"]
      : chart
        ? ["f"]
        : table
          ? ["calculatedColumnFormula", "totalsRowFormula"]
          : vml
            ? ["FmlaLink", "FmlaRange", "FmlaTxbx"]
            : [],
  );
  const edits: Vervanging[] = [];
  let bladEinde = -1;
  for (const token of xmlTags(xml)) {
    if (token.begin < bladEinde || token.sluit) continue;
    let open = xml.slice(token.begin, token.eind),
      node: XmlElement | undefined;
    const lees = () => (node ??= beginTag(xml, token));
    const zet = (naam: string, v: string | null) => {
      open = xmlAttribuut(
        token.leeg ? open : open.replace(/>$/, "/>"),
        naam,
        v,
      );
      if (!token.leeg) open = open.replace(/\/>$/, ">");
    };
    if (worksheet && token.lokaal === "hyperlink") {
      const loc = attr(lees(), "location");
      if (loc) {
        const nieuw = kopieFormule(loc, bron, naam, tabellen);
        if (nieuw !== loc) zet("location", nieuw);
      }
    }
    if (
      worksheet &&
      token.lokaal === "sheetPr" &&
      codeNaam &&
      attr(lees(), "codeName")
    )
      zet("codeName", codeNaam);
    if (worksheet && token.lokaal === "sheetView")
      zet(
        "tabSelected",
        (attr(lees(), "workbookViewId") ?? "0") === "0" ? "1" : null,
      );
    if (table && token.lokaal === "table" && tabel) {
      zet("id", String(tabel.id));
      zet("name", tabel.naam);
      zet("displayName", tabel.naam);
    }
    if (pivot && token.lokaal === "pivotTableDefinition") zet("name", pivot);
    if (thread && token.lokaal === "threadedComment")
      for (const key of ["id", "parentId"]) {
        const oud = attr(lees(), key);
        if (oud && ids.has(oud)) zet(key, ids.get(oud)!);
      }
    if (/\b(?:[\w.-]+:)?uid\s*=/.test(open) || token.lokaal === "creationId") {
      for (const [key, value] of Object.entries(lees().attrs)) {
        if (
          (key.slice(key.indexOf(":") + 1) === "uid" ||
            (token.lokaal === "creationId" && ["id", "val"].includes(key))) &&
          /^\{?[0-9a-f-]{36}\}?$/i.test(value)
        ) {
          if (!ids.has(value)) ids.set(value, guid());
          zet(key, ids.get(value)!);
        }
      }
    }
    if (open !== xml.slice(token.begin, token.eind))
      edits.push({ start: token.begin, eind: token.eind, tekst: open });
    if (
      token.leeg ||
      (!formules.has(token.lokaal) && !(comments && token.lokaal === "author"))
    )
      continue;
    let einde;
    for (const t of xmlTags(xml.slice(token.eind))) {
      if (t.sluit && t.naam === token.naam) {
        einde = t;
        break;
      }
    }
    if (!einde) throw fout("copyInvalid");
    const eind = token.eind + einde.begin,
      binnen = xml.slice(token.eind, eind),
      f = tekstVan(leesXml(`<${token.naam}>${binnen}</${token.naam}>`));
    const nieuw =
      comments && token.lokaal === "author"
        ? f.startsWith("tc=") && ids.has(f.slice(3))
          ? "tc=" + ids.get(f.slice(3))
          : f
        : kopieFormule(f, bron, naam, tabellen);
    if (nieuw !== f)
      edits.push({ start: token.eind, eind, tekst: ontsnap(nieuw) });
    bladEinde = token.eind + einde.eind;
  }
  return edits.length ? vervang(xml, edits) : xml;
}

export function kopieerWerkblad(
  bytes: Uint8Array,
  bronIndex: number,
  positie: number,
  naam: string,
): { bytes: Uint8Array; blad: number } {
  const bron = new Pakket(bytes);
  if (leesStructuurBeveiliging(bytes)) throw fout("structureLocked");
  const doel = new Pakket(bytes),
    wb = werkbladDeel(bron, bronIndex),
    bladen = kinderen(kind(wb.root, "sheets"), "sheet");
  const namen = bladen.map((s) => attr(s, "name") ?? ""),
    ongeldig = bladnaamFout(naam, namen);
  if (ongeldig) throw Error(ongeldig);
  if (!Number.isInteger(positie) || positie < 0 || positie > bladen.length)
    throw fout("copyInvalid");
  naam = naam.trim();
  const relaties = bron.relaties(wb.werkmap);
  if (relaties.some((r) => r.type.endsWith("/vbaProject")))
    throw fout("copyMacros");
  const kopie = maakOnderdeelKopie(bron, doel, {
    maxBytes: LIMIETEN.uitgepaktBytes,
    maxOnderdelen: LIMIETEN.onderdelen,
    naam: (pad) => kopiePad(doel, pad),
    fout: () => fout("copyInvalid"),
  });
  if (!/\.worksheet\+xml$/.test(kopie.inhoudstype(wb.pad) ?? ""))
    throw fout("copyUnsupported");
  kopie.map.set(wb.werkmap, wb.werkmap);
  for (const r of relaties)
    if (!r.extern) {
      const pad = Pakket.doelPad(wb.werkmap, r.target);
      if (pad !== wb.pad) kopie.map.set(pad, pad);
    }
  const nieuwPad = kopie.kopieer(wb.pad, kopiePad(doel, wb.pad)),
    eigen = [...kopie.map].filter(([oud, nieuw]) => oud !== nieuw);
  const tabelNamen = new Set<string>(),
    pivotNamen = new Set<string>(),
    tabelIds = new Set<number>();
  for (const pad of bron.namen()) {
    const ct = kopie.inhoudstype(pad) ?? "";
    if (!/\.(?:table|pivotTable)\+xml$/.test(ct)) continue;
    const root = leesXml(bron.lees(pad));
    if (root.lokaal === "table") {
      for (const a of ["name", "displayName"])
        if (attr(root, a)) tabelNamen.add(attr(root, a)!.toLowerCase());
      tabelIds.add(Number(attr(root, "id")));
    } else if (attr(root, "name"))
      pivotNamen.add(attr(root, "name")!.toLowerCase());
  }
  for (const n of kinderen(kind(wb.root, "definedNames"), "definedName"))
    if (attr(n, "name")) tabelNamen.add(attr(n, "name")!.toLowerCase());
  const tabellen = new Map<string, string>(),
    tabelData = new Map<string, { id: number; naam: string }>(),
    pivotData = new Map<string, string>(),
    ids = new Map<string, string>();
  for (const [oud] of eigen) {
    const ct = kopie.inhoudstype(oud) ?? "";
    // These objects also register workbook-global identities outside this graph.
    if (
      /slicer|timeline|activeX|ctrlProp/i.test(ct) ||
      bron
        .relaties(oud)
        .some((r) =>
          /\/(?:slicer|slicerCache|timeline|timelineCache|control|ctrlProp|activeXControl)(?:$|\/)/i.test(
            r.type,
          ),
        )
    )
      throw fout("copyUnsupported");
    if (/\.table\+xml$/.test(ct)) {
      const root = leesXml(bron.lees(oud)),
        naamOud = attr(root, "displayName") ?? attr(root, "name");
      if (!naamOud) throw fout("copyInvalid");
      const nieuw = vrij(naamOud, tabelNamen);
      let id = 1;
      while (tabelIds.has(id)) id++;
      tabelIds.add(id);
      tabelData.set(oud, { id, naam: nieuw });
      for (const a of ["name", "displayName"])
        if (attr(root, a)) tabellen.set(attr(root, a)!.toLowerCase(), nieuw);
    } else if (/\.pivotTable\+xml$/.test(ct)) {
      const n = attr(leesXml(bron.lees(oud)), "name");
      if (!n) throw fout("copyInvalid");
      pivotData.set(oud, vrij(n, pivotNamen));
    } else if (/threadedcomments/i.test(ct)) {
      for (const n of kinderen(leesXml(bron.lees(oud)), "threadedComment")) {
        const id = attr(n, "id");
        if (!id || ids.has(id)) throw fout("copyInvalid");
        ids.set(id, guid());
      }
    }
    if (
      /chart\+xml$/.test(ct) &&
      zoekAlle(leesXml(bron.lees(oud)), "pivotSource").length
    )
      throw fout("copyPivotChart");
  }
  const codeNamen = new Set(
    bladen.map((_, i) => {
      const s = werkbladDeel(bron, i);
      return (
        attr(kind(leesWerkbladXml(bron.lees(s.pad)), "sheetPr"), "codeName") ??
        ""
      ).toLowerCase();
    }),
  );
  const codeNaam = vrij("OosSheet", codeNamen);
  for (const [oud, nieuw] of eigen) {
    const ct = kopie.inhoudstype(oud) ?? "";
    if (/(?:\+xml|vmlDrawing|application\/xml)/.test(ct)) {
      const xml = doel.lees(nieuw),
        uit = kopieXml(
          xml,
          ct,
          namen[bronIndex],
          naam,
          tabellen,
          ids,
          tabelData.get(oud),
          pivotData.get(oud),
          oud === wb.pad ? codeNaam : undefined,
        );
      if (xml !== uit) doel.schrijf(nieuw, uit);
    }
  }
  const gebruikteIds = new Set(bladen.map((s) => Number(attr(s, "sheetId"))));
  let id = 1;
  while (gebruikteIds.has(id)) id++;
  const sourceRel = relaties.find((r) => r.id === rid(wb.blad));
  if (!sourceRel) throw fout("copyInvalid");
  const rel = doel.voegRelatieToe(wb.werkmap, sourceRel.type, nieuwPad);
  const rkey = Object.keys(wb.blad.attrs).find(
    (k) => k.includes(":") && k.slice(k.indexOf(":") + 1) === "id",
  );
  if (!rkey) throw fout("copyInvalid");
  let bladXml = fragment(bron.lees(wb.werkmap), wb.blad);
  for (const [key, value] of [
    ["name", naam],
    ["sheetId", String(id)],
    [rkey, rel],
    ["state", null],
  ] as const)
    bladXml = xmlAttribuut(bladXml, key, value);
  bladXml = kopieXml(
    bladXml,
    "application/xml",
    namen[bronIndex],
    naam,
    tabellen,
    ids,
  );
  const xml = doel.lees(wb.werkmap),
    root = leesXml(xml),
    sheets = kind(root, "sheets")!,
    oudBladen = kinderen(sheets, "sheet");
  const op =
    positie === oudBladen.length ? sheets.inhoudEind : oudBladen[positie].start;
  const edits: Vervanging[] = [{ start: op, eind: op, tekst: bladXml }];
  const dn = kind(root, "definedNames"),
    lokaleKopieen: string[] = [];
  for (const n of kinderen(dn, "definedName")) {
    const lokaal = attr(n, "localSheetId");
    if (lokaal === undefined) continue;
    const index = Number(lokaal);
    if (!Number.isInteger(index) || index < 0 || index >= bladen.length)
      throw fout("copyInvalid");
    let fragmentXml = fragment(xml, n);
    if (index >= positie)
      edits.push({
        start: n.start,
        eind: n.eind,
        tekst: xmlAttribuut(fragmentXml, "localSheetId", index + 1),
      });
    if (index === bronIndex) {
      const f = kopieFormule(tekstVan(n), namen[bronIndex], naam, tabellen);
      fragmentXml = xmlAttribuut(
        metInhoud(xml, n, ontsnap(f)),
        "localSheetId",
        positie,
      );
      lokaleKopieen.push(fragmentXml);
    }
  }
  if (dn && lokaleKopieen.length) {
    if (dn.leeg) throw fout("copyInvalid");
    edits.push({
      start: dn.inhoudEind,
      eind: dn.inhoudEind,
      tekst: lokaleKopieen.join(""),
    });
  }
  const views = kind(root, "bookViews"),
    view = kind(views, "workbookView");
  if (view)
    for (const v of kinderen(views, "workbookView")) {
      let tekst = fragment(xml, v);
      const eerste = Number(attr(v, "firstSheet") ?? 0),
        actief = Number(attr(v, "activeTab") ?? 0);
      tekst = xmlAttribuut(
        tekst,
        "activeTab",
        v === view ? positie : actief + Number(actief >= positie),
      );
      if (attr(v, "firstSheet") !== undefined)
        tekst = xmlAttribuut(
          tekst,
          "firstSheet",
          v === view
            ? Math.min(positie, eerste + Number(eerste >= positie))
            : eerste + Number(eerste >= positie),
        );
      edits.push({ start: v.start, eind: v.eind, tekst });
    }
  else {
    const tag = voorvoegsel(views ?? root),
      v = `<${tag}workbookView activeTab="${positie}"/>`;
    edits.push(
      views
        ? {
            start: views.start,
            eind: views.eind,
            tekst: metInhoud(xml, views, v),
          }
        : {
            start: sheets.start,
            eind: sheets.start,
            tekst: `<${tag}bookViews>${v}</${tag}bookViews>`,
          },
    );
  }
  const calc = kind(root, "calcPr");
  if (calc)
    edits.push({
      start: calc.start,
      eind: calc.eind,
      tekst: xmlAttribuut(
        xmlAttribuut(fragment(xml, calc), "fullCalcOnLoad", "1"),
        "forceFullCalc",
        "1",
      ),
    });
  else {
    const volgende = root.kinderen.find(
      (n) =>
        n.soort === "element" &&
        [
          "oleSize",
          "customWorkbookViews",
          "pivotCaches",
          "smartTagPr",
          "smartTagTypes",
          "webPublishing",
          "fileRecoveryPr",
          "webPublishObjects",
          "extLst",
        ].includes(n.lokaal),
    );
    const op = volgende?.start ?? root.inhoudEind;
    edits.push({
      start: op,
      eind: op,
      tekst: `<${voorvoegsel(root)}calcPr fullCalcOnLoad="1" forceFullCalc="1"/>`,
    });
  }
  doel.schrijf(wb.werkmap, vervang(xml, edits));
  for (const r of relaties)
    if (!r.extern && r.type.endsWith("/calcChain")) {
      doel.verwijderRelatie(wb.werkmap, r.id);
      doel.verwijder(Pakket.doelPad(wb.werkmap, r.target));
      doel.verwijderOverride(Pakket.doelPad(wb.werkmap, r.target));
    }
  for (let i = 0; i <= bladen.length; i++)
    zetBladSelectie(doel, i, i === positie);
  const resultaat = doel.inpakken();
  new Pakket(resultaat);
  return { bytes: resultaat, blad: positie };
}
