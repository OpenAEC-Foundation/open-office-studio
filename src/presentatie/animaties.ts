/** Objectanimaties als standaard PresentationML; onbekende timing wordt nooit herschreven. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import { diaPaden } from "./overgangen";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
export type AnimatieEffect = "fadeIn" | "fadeOut" | "spin" | "move" | "unknown";
export type AnimatieStart = "click" | "with" | "after";
export interface Animatie {
  id: string;
  vorm: number;
  effect: AnimatieEffect;
  start: AnimatieStart;
  duur: number;
  vertraging: number;
  alinea: [number, number] | null;
  dx: number;
  dy: number;
  hoek: number;
}
export interface DiaAnimaties {
  lijst: Animatie[];
  alleenLezen: boolean;
  onbekend: number;
}
export type GeplandeAnimatie = ReturnType<typeof animatieGroepen>[number];
export class AnimatieFout extends Error {}
export const nieuweAnimatie = (vorm: number): Animatie => ({
  id: crypto.randomUUID(),
  vorm,
  effect: "fadeIn",
  start: "click",
  duur: 500,
  vertraging: 0,
  alinea: null,
  dx: 0.25,
  dy: 0,
  hoek: 360,
});

function dia(pakket: Pakket, index: number) {
  const paden = diaPaden(pakket);
  if (!Number.isInteger(index) || !paden[index])
    throw new AnimatieFout("invalidSlide");
  const pad = paden[index],
    xml = pakket.lees(pad),
    root = leesXml(xml);
  return { pad, xml, root, timing: kind(root, "timing") };
}

const GETAL = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?";
const RECHT_PAD = new RegExp(
  `^\\s*M\\s+(0(?:\\.0+)?)\\s+(0(?:\\.0+)?)\\s+L\\s+(${GETAL})\\s+(${GETAL})\\s+E\\s*$`,
);
const TOEGESTAAN = new Set(
  "timing tnLst par seq cTn childTnLst stCondLst cond prevCondLst nextCondLst tgtEl sldTgt spTgt txEl pRg cBhvr set to strVal attrNameLst attrName animEffect animRot animMotion bldLst bldP".split(
    " ",
  ),
);
const ATTRIBUTEN = new Set(
  "id dur restart nodeType fill presetID presetClass presetSubtype grpId delay evt spid st end filter transition by path pathEditMode origin additive concurrent nextAc build val repeatCount repeatDur autoRev accel decel".split(
    " ",
  ),
);

function lees(timing: XmlElement | null): DiaAnimaties {
  if (!timing) return { lijst: [], alleenLezen: false, onbekend: 0 };
  const nodes = [timing, ...zoekAlle(timing, "cTn")];
  let alleenLezen = false;
  const controleer = (el: XmlElement) => {
    if (namespaceVan(el, el.voorvoegsel) !== P || !TOEGESTAAN.has(el.lokaal))
      alleenLezen = true;
    if (
      Object.keys(el.attrs).some(
        (k) => !k.startsWith("xmlns") && !ATTRIBUTEN.has(k),
      )
    )
      alleenLezen = true;
    if (
      el.lokaal === "cond" &&
      attr(el, "evt") &&
      !["onPrev", "onNext"].includes(attr(el, "evt")!)
    )
      alleenLezen = true;
    if (
      el.lokaal === "bldP" &&
      attr(el, "build") &&
      attr(el, "build") !== "allAtOnce"
    )
      alleenLezen = true;
    if (
      el.lokaal === "set" &&
      (zoekAlle(el, "attrName").map(tekstVan).join() !== "style.visibility" ||
        attr(kind(kind(el, "to"), "strVal"), "val") !== "visible")
    )
      alleenLezen = true;
    if (
      el.lokaal === "seq" &&
      attr(el, "nextAc") &&
      attr(el, "nextAc") !== "seek"
    )
      alleenLezen = true;
    if (
      el.lokaal === "cTn" &&
      attr(el, "restart") &&
      attr(el, "restart") !== "never"
    )
      alleenLezen = true;
    for (const k of ["repeatCount", "repeatDur", "autoRev", "accel", "decel"]) {
      if (attr(el, k) && !["0", "false"].includes(attr(el, k)!))
        alleenLezen = true;
    }
    elementen(el).forEach(controleer);
  };
  controleer(timing);
  const effecten = nodes.filter(
    (n) => attr(n, "presetClass") && kind(n, "childTnLst"),
  );
  let vorigeStart = 0,
    vorigeEind = 0;
  const lijst: Animatie[] = effecten.map((n) => {
    const binnen = kind(n, "childTnLst")!;
    const gedrag = elementen(binnen).filter((e) =>
      ["animEffect", "animRot", "animMotion"].includes(e.lokaal),
    );
    const g = gedrag[0],
      bhvr = kind(g, "cBhvr"),
      tgt = kind(kind(bhvr, "tgtEl"), "spTgt"),
      tijd = kind(bhvr, "cTn");
    const soort = attr(n, "presetClass"),
      filter = attr(g, "filter");
    let effect: AnimatieEffect =
      gedrag.length !== 1
        ? "unknown"
        : g.lokaal === "animEffect" &&
            filter === "fade" &&
            attr(g, "transition") === "in" &&
            soort === "entr"
          ? "fadeIn"
          : g.lokaal === "animEffect" &&
              filter === "fade" &&
              attr(g, "transition") === "out" &&
              soort === "exit"
            ? "fadeOut"
            : g.lokaal === "animRot" && !attr(g, "to") && !attr(g, "from")
              ? "spin"
              : g.lokaal === "animMotion" &&
                  RECHT_PAD.test(attr(g, "path") ?? "")
                ? "move"
                : "unknown";
    const route = RECHT_PAD.exec(attr(g, "path") ?? "");
    const type = attr(n, "nodeType");
    if (!type || !["clickEffect", "withEffect", "afterEffect"].includes(type))
      effect = "unknown";
    if (
      (effect === "spin" || effect === "move") &&
      attr(bhvr, "additive") !== "sum"
    )
      effect = "unknown";
    if (zoekAlle(n, "spTgt").some((t) => attr(t, "spid") !== attr(tgt, "spid")))
      effect = "unknown";
    const start: AnimatieStart =
      type === "afterEffect"
        ? "after"
        : type === "withEffect"
          ? "with"
          : "click";
    if (start === "click") {
      vorigeStart = 0;
      vorigeEind = 0;
    }
    let absoluut = 0;
    for (
      let e: XmlElement | null = n;
      e && attr(e, "nodeType") !== "mainSeq";
      e = e.ouder
    ) {
      if (e.lokaal !== "cTn") continue;
      const voorwaarden = kinderen(kind(e, "stCondLst"), "cond");
      if (voorwaarden.length > 1) alleenLezen = true;
      const delay = attr(voorwaarden[0], "delay");
      if (delay && delay !== "indefinite") {
        const ms = Number(delay);
        if (Number.isFinite(ms) && ms >= 0) absoluut += ms;
        else effect = "unknown";
      }
    }
    const vertraging =
      absoluut -
      (start === "after" ? vorigeEind : start === "with" ? vorigeStart : 0);
    const duur = Number(attr(tijd, "dur"));
    const vorm = Number(attr(tgt, "spid"));
    const p = kind(kind(tgt, "txEl"), "pRg");
    const alinea: [number, number] | null = p
      ? [Number(attr(p, "st")), Number(attr(p, "end"))]
      : null;
    const dx = route ? Number(route[3]) : 0.25;
    const dy = route ? Number(route[4]) : 0;
    const hoek = Number(attr(g, "by") ?? 21600000) / 60000;
    if (
      !Number.isFinite(duur) ||
      duur < 0 ||
      duur > 60000 ||
      !Number.isInteger(vorm) ||
      vorm < 1 ||
      vertraging < 0 ||
      vertraging > 3600000 ||
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      Math.abs(dx) > 10 ||
      Math.abs(dy) > 10 ||
      !Number.isFinite(hoek) ||
      Math.abs(hoek) > 3600 ||
      (alinea &&
        (alinea.some(
          (v) => !Number.isSafeInteger(v) || v < 0 || v > 0xffffffff,
        ) ||
          alinea[1] < alinea[0]))
    )
      effect = "unknown";
    if (tgt && kind(tgt, "txEl") && !p) effect = "unknown";
    vorigeStart = absoluut;
    vorigeEind = absoluut + (Number.isFinite(duur) ? duur : 0);
    return {
      id: attr(n, "id") ?? String(vorm),
      vorm,
      effect,
      start,
      duur: Number.isFinite(duur) ? duur : 500,
      vertraging: Math.max(0, vertraging),
      alinea,
      dx,
      dy,
      hoek,
    };
  });
  const onbekend =
    lijst.filter((a) => a.effect === "unknown").length +
    (alleenLezen || (!lijst.length && elementen(timing).length) ? 1 : 0);
  return { lijst, alleenLezen: alleenLezen || onbekend > 0, onbekend };
}

export function leesAnimaties(bytes: Uint8Array, index: number): DiaAnimaties {
  const d = dia(new Pakket(bytes), index);
  const uit = lees(d.timing);
  // Een MCE-timing vereist ook behoud van de niet-gekozen tak.
  if (!d.timing && zoekAlle(d.root, "timing").length)
    return { lijst: [], alleenLezen: true, onbekend: 1 };
  return uit;
}

export function leesAlleAnimaties(bytes: Uint8Array): DiaAnimaties[] {
  const pakket = new Pakket(bytes);
  return diaPaden(pakket).map((pad) => {
    const root = leesXml(pakket.lees(pad)),
      timing = kind(root, "timing");
    return !timing && zoekAlle(root, "timing").length
      ? { lijst: [], alleenLezen: true, onbekend: 1 }
      : lees(timing);
  });
}

export function animatieGroepen(lijst: readonly Animatie[]) {
  let groep = -1,
    vorigeStart = 0,
    vorigeEind = 0;
  return lijst.map((a) => {
    if (a.start === "click") {
      groep++;
      vorigeStart = 0;
      vorigeEind = 0;
    }
    const start =
      (a.start === "after"
        ? vorigeEind
        : a.start === "with"
          ? vorigeStart
          : 0) + a.vertraging;
    vorigeStart = start;
    vorigeEind = start + a.duur;
    return { ...a, groep, begin: start, eind: vorigeEind };
  });
}

function timingXml(lijst: readonly Animatie[]) {
  let id = 2;
  const next = () => ++id;
  const groepen = new Map<number, string[]>();
  for (const a of animatieGroepen(lijst)) {
    const buiten = next(),
      effectId = next(),
      setId = next(),
      gedragId = next();
    const target = `<p:tgtEl><p:spTgt spid="${a.vorm}">${a.alinea ? `<p:txEl><p:pRg st="${a.alinea[0]}" end="${a.alinea[1]}"/></p:txEl>` : ""}</p:spTgt></p:tgtEl>`;
    const common = `<p:cBhvr additive="sum"><p:cTn id="${gedragId}" dur="${a.duur}" fill="hold"/>${target}</p:cBhvr>`;
    const gedrag =
      a.effect === "spin"
        ? `<p:animRot by="${Math.round(a.hoek * 60000)}">${common}</p:animRot>`
        : a.effect === "move"
          ? `<p:animMotion origin="layout" pathEditMode="relative" path="M 0 0 L ${a.dx} ${a.dy} E">${common}</p:animMotion>`
          : `<p:animEffect transition="${a.effect === "fadeIn" ? "in" : "out"}" filter="fade">${common}</p:animEffect>`;
    const zichtbaar =
      a.effect === "fadeIn"
        ? `<p:set><p:cBhvr><p:cTn id="${setId}" dur="1" fill="hold"/>${target}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`
        : "";
    const klasse =
      a.effect === "fadeIn"
        ? "entr"
        : a.effect === "fadeOut"
          ? "exit"
          : a.effect === "move"
            ? "path"
            : "emph";
    const nodeType =
      a.start === "click"
        ? "clickEffect"
        : a.start === "with"
          ? "withEffect"
          : "afterEffect";
    const fragment = `<p:par><p:cTn id="${buiten}" fill="hold"><p:stCondLst><p:cond delay="${a.begin}"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${effectId}" presetClass="${klasse}"${klasse === "entr" || klasse === "exit" ? ' presetID="10" presetSubtype="0"' : ""} fill="hold" grpId="0" nodeType="${nodeType}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${zichtbaar}${gedrag}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
    if (!groepen.has(a.groep)) groepen.set(a.groep, []);
    groepen.get(a.groep)!.push(fragment);
  }
  const inhoud = [...groepen]
    .map(
      ([groep, rows]) =>
        `<p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="${groep < 0 ? 0 : "indefinite"}"/></p:stCondLst><p:childTnLst>${rows.join("")}</p:childTnLst></p:cTn></p:par>`,
    )
    .join("");
  return `<p:timing xmlns:p="${P}"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${inhoud}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

export function schrijfAnimaties(
  bytes: Uint8Array,
  index: number,
  lijst: readonly Animatie[],
) {
  const pakket = new Pakket(bytes),
    d = dia(pakket, index),
    voor = leesAnimaties(bytes, index);
  if (JSON.stringify(voor.lijst) === JSON.stringify(lijst)) return bytes;
  if (voor.alleenLezen) throw new AnimatieFout("unsupportedTiming");
  const ids = new Set(
    zoekAlle(d.root, "cNvPr")
      .filter((n) => n.ouder?.ouder?.lokaal !== "spTree")
      .map((n) => Number(attr(n, "id"))),
  );
  if (
    lijst.length > 500 ||
    lijst.some(
      (a) =>
        !ids.has(a.vorm) ||
        !["fadeIn", "fadeOut", "spin", "move"].includes(a.effect) ||
        !["click", "with", "after"].includes(a.start) ||
        !Number.isInteger(a.duur) ||
        a.duur < 0 ||
        a.duur > 60000 ||
        !Number.isInteger(a.vertraging) ||
        a.vertraging < 0 ||
        a.vertraging > 3600000 ||
        !Number.isFinite(a.dx) ||
        !Number.isFinite(a.dy) ||
        Math.abs(a.dx) > 10 ||
        Math.abs(a.dy) > 10 ||
        !Number.isFinite(a.hoek) ||
        Math.abs(a.hoek) > 3600 ||
        (a.alinea &&
          (a.alinea.some((v) => !Number.isInteger(v) || v < 0) ||
            a.alinea[1] < a.alinea[0])),
    )
  )
    throw new AnimatieFout("invalidAnimation");
  const xml = lijst.length ? timingXml(lijst) : "";
  const plek =
    d.timing?.start ?? kind(d.root, "extLst")?.start ?? d.root.inhoudEind;
  pakket.schrijf(
    d.pad,
    vervang(d.xml, [{ start: plek, eind: d.timing?.eind ?? plek, tekst: xml }]),
  );
  return pakket.inpakken();
}
