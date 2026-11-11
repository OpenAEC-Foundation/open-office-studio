/** Echte DrawingML-tabellen, met behoud van niet-bewerkte celtekst, stijlen en relaties. */
import { Pakket, REL } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  ontsnap,
  rid,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
  type Vervanging,
} from "../grafieken/xml";
import { leesOntwerp } from "./ontwerp";
import {
  eigenaars,
  TabelFout,
  type CelStijl,
  type TabelRooster,
} from "./tabelrooster";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main",
  A = "http://schemas.openxmlformats.org/drawingml/2006/main";
export interface DiaTabel extends TabelRooster {
  id: string;
  naam: string;
  dia: number;
  tabelXml: string;
}

function zelfstandig(xml: string, el: XmlElement) {
  const bindings: Record<string, string> = {},
    ouders: XmlElement[] = [];
  for (let e: XmlElement | null = el; e; e = e.ouder) ouders.unshift(e);
  for (const e of ouders)
    for (const [k, v] of Object.entries(e.attrs))
      if (k === "xmlns" || k.startsWith("xmlns:")) bindings[k] = v;
  const fragment = xml.slice(el.start, el.eind),
    root = leesXml(fragment);
  return vervang(fragment, [
    {
      start: root.start,
      eind: root.inhoudStart,
      tekst: `<${root.naam}${attrTekst({ ...bindings, ...root.attrs })}${root.leeg ? "/>" : ">"}`,
    },
  ]);
}
function celTekst(el: XmlElement) {
  const walk = (e: XmlElement): string =>
    e.lokaal === "t"
      ? tekstVan(e)
      : e.lokaal === "br"
        ? "\n"
        : elementen(e).map(walk).join("");
  return kinderen(kind(el, "txBody"), "p").map(walk).join("\n");
}
function frameTabel(frame: XmlElement) {
  return zoekAlle(frame, "tbl").find(
    (t) => namespaceVan(t, t.voorvoegsel) === A,
  );
}
export function leesTabellen(bytes: Uint8Array, dia: number): DiaTabel[] {
  const p = new Pakket(bytes),
    info = leesOntwerp(bytes),
    pad = info.dias[dia]?.pad;
  if (!pad) throw new TabelFout("missing");
  const xml = p.lees(pad),
    root = leesXml(xml),
    uit: DiaTabel[] = [];
  for (const frame of zoekAlle(root, "graphicFrame")) {
    const table = frameTabel(frame);
    if (!table) continue;
    const id = kind(kind(frame, "nvGraphicFramePr"), "cNvPr"),
      rows = kinderen(table, "tr"),
      cols = kinderen(kind(table, "tblGrid"), "gridCol");
    if (
      rows.length > 200 ||
      cols.length > 50 ||
      rows.length * cols.length > 5000
    )
      throw new TabelFout("tooLarge");
    const t: DiaTabel = {
      id: attr(id, "id") ?? "",
      naam: attr(id, "name") ?? "",
      dia,
      tabelXml: zelfstandig(xml, table),
      breedtes: cols.map((c) => Number(attr(c, "w"))),
      hoogtes: rows.map((r) => Number(attr(r, "h"))),
      rijXml: rows.map((r) => zelfstandig(xml, r)),
      kolomXml: cols.map((c) => zelfstandig(xml, c)),
      cellen: rows.map((row) =>
        kinderen(row, "tc").map((c) => ({
          tekst: celTekst(c),
          rijSpan: Number(attr(c, "rowSpan") ?? 1),
          kolomSpan: Number(attr(c, "gridSpan") ?? 1),
          bedekt:
            ["1", "true"].includes(attr(c, "hMerge") ?? "") ||
            ["1", "true"].includes(attr(c, "vMerge") ?? ""),
          xml: zelfstandig(xml, c),
        })),
      ),
    };
    eigenaars(t);
    uit.push(t);
  }
  return uit;
}
function replaceChild(
  xml: string,
  parent: XmlElement,
  name: string,
  value: string,
  voor?: XmlElement | null,
) {
  const old = kind(parent, name);
  if (old)
    return vervang(xml, [{ start: old.start, eind: old.eind, tekst: value }]);
  if (parent.leeg)
    return vervang(xml, [
      {
        start: parent.start,
        eind: parent.eind,
        tekst: `<${parent.naam}${attrTekst(parent.attrs)}>${value}</${parent.naam}>`,
      },
    ]);
  const pos = voor?.start ?? parent.inhoudEind;
  return vervang(xml, [{ start: pos, eind: pos, tekst: value }]);
}
function changeAttrs(
  xml: string,
  el: XmlElement,
  updates: Record<string, string | undefined>,
) {
  return vervang(xml, [
    {
      start: el.start,
      eind: el.inhoudStart,
      tekst: `<${el.naam}${attrTekst({ ...el.attrs, ...updates })}${el.leeg ? "/>" : ">"}`,
    },
  ]);
}
const color = (c: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(c)) throw new TabelFout("invalid");
  return c.slice(1).toUpperCase();
};
function tekstInCel(xml: string, text: string) {
  if (text.length > 100000) throw new TabelFout("tooLarge");
  const root = leesXml(xml),
    tx = kind(root, "txBody"),
    p = kind(tx, "p"),
    pr = kind(p, "pPr"),
    rpr = kind(kind(p, "r") ?? kind(p, "fld"), "rPr");
  const frag = (e: XmlElement | null) => (e ? zelfstandig(xml, e) : "");
  const inhoud =
    `${frag(kind(tx, "bodyPr")) || "<a:bodyPr/>"}${frag(kind(tx, "lstStyle")) || "<a:lstStyle/>"}` +
    text
      .split(/\r\n?|\n/)
      .map(
        (line) =>
          `<a:p xmlns:a="${A}">${frag(pr)}<a:r>${frag(rpr) || '<a:rPr sz="1800"/>'}<a:t xml:space="preserve">${ontsnap(line)}</a:t></a:r></a:p>`,
      )
      .join("");
  const body = tx
    ? `<${tx.naam}${attrTekst(tx.attrs)}>${inhoud}</${tx.naam}>`
    : `<a:txBody xmlns:a="${A}">${inhoud}</a:txBody>`;
  return replaceChild(
    xml,
    root,
    "txBody",
    body,
    kind(root, "tcPr") ?? kind(root, "extLst"),
  );
}
function styleCell(xml: string, s: CelStijl) {
  let root = leesXml(xml),
    pr = kind(root, "tcPr");
  if (!pr) {
    xml = replaceChild(
      xml,
      root,
      "tcPr",
      `<a:tcPr xmlns:a="${A}"/>`,
      kind(root, "extLst"),
    );
    root = leesXml(xml);
    pr = kind(root, "tcPr")!;
  }
  if (s.verticaal || s.marge !== undefined) {
    if (s.verticaal && !["t", "ctr", "b"].includes(s.verticaal))
      throw new TabelFout("invalid");
    if (
      s.marge !== undefined &&
      (!Number.isSafeInteger(s.marge) || s.marge < 0 || s.marge > 3600000)
    )
      throw new TabelFout("invalid");
    const updates: Record<string, string> = {};
    if (s.verticaal) updates.anchor = s.verticaal;
    if (s.marge !== undefined)
      for (const m of ["marL", "marR", "marT", "marB"])
        updates[m] = String(s.marge);
    xml = changeAttrs(xml, pr, updates);
  }
  if (s.rand !== undefined) {
    const c = color(s.rand),
      w = s.randPunten ?? 1;
    if (!Number.isFinite(w) || w < 0 || w > 20) throw new TabelFout("invalid");
    root = leesXml(xml);
    pr = kind(root, "tcPr")!;
    const edits: Vervanging[] = elementen(pr)
      .filter((e) => ["lnL", "lnR", "lnT", "lnB"].includes(e.lokaal))
      .map((e) => ({ start: e.start, eind: e.eind, tekst: "" }));
    const lines = ["lnL", "lnR", "lnT", "lnB"]
      .map(
        (n) =>
          `<a:${n} xmlns:a="${A}" w="${Math.round(w * 12700)}"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:prstDash val="solid"/></a:${n}>`,
      )
      .join("");
    if (pr.leeg)
      xml = replaceChild(
        xml,
        root,
        "tcPr",
        `<${pr.naam}${attrTekst(pr.attrs)}>${lines}</${pr.naam}>`,
      );
    else {
      edits.push({ start: pr.inhoudStart, eind: pr.inhoudStart, tekst: lines });
      xml = vervang(xml, edits);
    }
  }
  if (s.vulling !== undefined) {
    const c = color(s.vulling);
    root = leesXml(xml);
    pr = kind(root, "tcPr")!;
    const old = elementen(pr).filter((e) =>
      [
        "noFill",
        "solidFill",
        "gradFill",
        "blipFill",
        "pattFill",
        "grpFill",
      ].includes(e.lokaal),
    );
    const fill = `<a:solidFill xmlns:a="${A}"><a:srgbClr val="${c}"/></a:solidFill>`;
    if (old.length) {
      const edits = old.map((e, i) => ({
        start: e.start,
        eind: e.eind,
        tekst: i ? "" : fill,
      }));
      xml = vervang(xml, edits);
    } else
      xml = replaceChild(
        xml,
        root,
        "tcPr",
        pr.leeg
          ? `<${pr.naam}${attrTekst(pr.attrs)}>${fill}</${pr.naam}>`
          : `<${pr.naam}${attrTekst(pr.attrs)}>${xml.slice(pr.inhoudStart, kind(pr, "headers")?.start ?? kind(pr, "extLst")?.start ?? pr.inhoudEind)}${fill}${xml.slice(kind(pr, "headers")?.start ?? kind(pr, "extLst")?.start ?? pr.inhoudEind, pr.inhoudEind)}</${pr.naam}>`,
      );
  }
  if (s.uitlijning) {
    if (!["l", "ctr", "r"].includes(s.uitlijning))
      throw new TabelFout("invalid");
    root = leesXml(xml);
    const tx = kind(root, "txBody");
    const edits: Vervanging[] = [];
    for (const p of kinderen(tx, "p")) {
      const pr = kind(p, "pPr");
      if (pr)
        edits.push({
          start: pr.start,
          eind: pr.inhoudStart,
          tekst: `<${pr.naam}${attrTekst({ ...pr.attrs, algn: s.uitlijning })}${pr.leeg ? "/>" : ">"}`,
        });
      else if (p.leeg)
        edits.push({
          start: p.start,
          eind: p.eind,
          tekst: `<${p.naam}${attrTekst(p.attrs)}><a:pPr xmlns:a="${A}" algn="${s.uitlijning}"/></${p.naam}>`,
        });
      else
        edits.push({
          start: p.inhoudStart,
          eind: p.inhoudStart,
          tekst: `<a:pPr xmlns:a="${A}" algn="${s.uitlijning}"/>`,
        });
    }
    xml = vervang(xml, edits);
  }
  return xml;
}
export function tabelXml(t: TabelRooster, origineel?: string) {
  const owners = eigenaars(t);
  let xml = origineel ?? `<a:tbl xmlns:a="${A}"><a:tblPr/><a:tblGrid/></a:tbl>`;
  const root = leesXml(xml),
    grid = kind(root, "tblGrid");
  if (!grid) throw new TabelFout("invalid");
  const cols = t.breedtes
    .map((w, i) => {
      const bron = t.kolomXml?.[i];
      return bron
        ? changeAttrs(bron, leesXml(bron), { w: String(w) })
        : `<a:gridCol xmlns:a="${A}" w="${w}"/>`;
    })
    .join("");
  const gridXml = `<${grid.naam}${attrTekst(grid.attrs)}>${cols}</${grid.naam}>`;
  const rows = t.cellen
    .map((row, r) => {
      const cells = row
        .map((c, k) => {
          const o = owners[r][k],
            anchor = t.cellen[o.r][o.c];
          let cel =
            c.xml ??
            `<a:tc xmlns:a="${A}"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr sz="1800"/></a:p></a:txBody><a:tcPr/></a:tc>`;
          if (!c.xml || c.tekstGewijzigd) cel = tekstInCel(cel, c.tekst);
          if (c.stijl) cel = styleCell(cel, c.stijl);
          const el = leesXml(cel);
          return changeAttrs(cel, el, {
            rowSpan:
              r === o.r && anchor.rijSpan > 1
                ? String(anchor.rijSpan)
                : undefined,
            gridSpan:
              k === o.c && anchor.kolomSpan > 1
                ? String(anchor.kolomSpan)
                : undefined,
            hMerge: k > o.c ? "1" : undefined,
            vMerge: r > o.r ? "1" : undefined,
          });
        })
        .join("");
      const bron = t.rijXml?.[r],
        el = bron ? leesXml(bron) : null;
      // Bewaar niet-celkinderen (zoals uitbreidingen) achter de nieuwe cellen.
      const extra = el
        ? elementen(el)
            .filter((e) => e.lokaal !== "tc")
            .map((e) => zelfstandig(bron!, e))
            .join("")
        : "";
      return el
        ? `<${el.naam}${attrTekst({ ...el.attrs, h: String(t.hoogtes[r]) })}>${cells}${extra}</${el.naam}>`
        : `<a:tr xmlns:a="${A}" h="${t.hoogtes[r]}">${cells}</a:tr>`;
    })
    .join("");
  const oldRows = kinderen(root, "tr"),
    edits: Vervanging[] = [
      { start: grid.start, eind: grid.eind, tekst: gridXml },
    ];
  if (oldRows.length) {
    edits.push({
      start: oldRows[0].start,
      eind: oldRows[0].start,
      tekst: rows,
    });
    oldRows.forEach((r) =>
      edits.push({ start: r.start, eind: r.eind, tekst: "" }),
    );
  } else edits.push({ start: grid.eind, eind: grid.eind, tekst: rows });
  return vervang(xml, edits);
}
export function schrijfTabel(
  bytes: Uint8Array,
  dia: number,
  t: TabelRooster,
  id?: string,
) {
  const p = new Pakket(bytes),
    info = leesOntwerp(bytes),
    pad = info.dias[dia]?.pad;
  if (!pad) throw new TabelFout("missing");
  const xml = p.lees(pad),
    root = leesXml(xml);
  if (id !== undefined) {
    const matches = zoekAlle(root, "graphicFrame").filter(
        (f) => attr(kind(kind(f, "nvGraphicFramePr"), "cNvPr"), "id") === id,
      ),
      frame = matches[0],
      old = frame && frameTabel(frame);
    if (matches.length !== 1 || !old) throw new TabelFout("missing");
    const ext = kind(kind(frame, "xfrm"), "ext"),
      edits: Vervanging[] = [
        {
          start: old.start,
          eind: old.eind,
          tekst: tabelXml(t, zelfstandig(xml, old)),
        },
      ];
    if (ext)
      edits.push({
        start: ext.start,
        eind: ext.inhoudStart,
        tekst: `<${ext.naam}${attrTekst({ ...ext.attrs, cx: String(t.breedtes.reduce((a, b) => a + b, 0)), cy: String(t.hoogtes.reduce((a, b) => a + b, 0)) })}${ext.leeg ? "/>" : ">"}`,
      });
    p.schrijf(pad, vervang(xml, edits));
  } else {
    const tree = kind(kind(root, "cSld"), "spTree");
    if (!tree || tree.leeg) throw new TabelFout("missing");
    const presRel = p
      .relaties("")
      .find((r) => r.type === REL.officeDocument && !r.extern)!;
    const maat = kind(
      leesXml(p.lees(Pakket.doelPad("", presRel.target))),
      "sldSz",
    );
    const w = Number(attr(maat, "cx")) || 12192000,
      h = Number(attr(maat, "cy")) || 6858000;
    const cw = t.breedtes.reduce((a, b) => a + b, 0),
      ch = t.hoogtes.reduce((a, b) => a + b, 0);
    const vormId =
      zoekAlle(root, "cNvPr").reduce(
        (m, e) => Math.max(m, Number(attr(e, "id")) || 0),
        0,
      ) + 1;
    const frame = `<p:graphicFrame xmlns:p="${P}" xmlns:a="${A}"><p:nvGraphicFramePr><p:cNvPr id="${vormId}" name="Table ${vormId}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${Math.round((w - cw) / 2)}" y="${Math.round((h - ch) / 2)}"/><a:ext cx="${cw}" cy="${ch}"/></p:xfrm><a:graphic><a:graphicData uri="${A}/table">${tabelXml(t)}</a:graphicData></a:graphic></p:graphicFrame>`;
    const pos = kind(tree, "extLst")?.start ?? tree.inhoudEind;
    p.schrijf(pad, vervang(xml, [{ start: pos, eind: pos, tekst: frame }]));
  }
  return p.inpakken();
}
