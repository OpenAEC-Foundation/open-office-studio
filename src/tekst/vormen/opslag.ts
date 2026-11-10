import type { Shape } from "@betteroffice/docx/types/content";
import { vormBewerkbaar } from "./groep.ts";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

type SchrijfVorm = (vorm: Shape) => string;
function nativeKleur(
  kleur: NonNullable<Shape["outline"]>["color"],
  schrijf: SchrijfVorm,
) {
  return (
    schrijf({
      type: "shape",
      shapeType: "rect",
      size: { width: 1, height: 1 },
      fill: { type: "solid", color: kleur ?? { rgb: "000000" } },
    }).match(/<a:solidFill\b[^>]*>([\s\S]*?)<\/a:solidFill>/)?.[1] ??
    '<a:srgbClr val="000000"/>'
  );
}
const WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
const WPG = "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup";
const xml = (s: string | number) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Houdt geneste tekeningen heel, ook in een tekstvak. */
function vervangElementen(
  bron: string,
  naam: string,
  doe: (xml: string) => string,
): string {
  const tag = new RegExp(
    String.raw`<(/?)(?:[\w.-]+:)?${naam}\b(?:[^>"']|"[^"]*"|'[^']*')*>`,
    "g",
  );
  let diepte = 0,
    begin = 0,
    vorig = 0,
    uit = "";
  for (const m of bron.matchAll(tag)) {
    if (!m[1] && !m[0].endsWith("/>")) {
      if (diepte++ === 0) begin = m.index;
    } else if (m[1] && --diepte === 0) {
      uit +=
        bron.slice(vorig, begin) +
        doe(bron.slice(begin, m.index + m[0].length));
      vorig = m.index + m[0].length;
    }
  }
  return uit + bron.slice(vorig);
}
function eersteElement(bron: string, naam: string) {
  let uit: string | undefined;
  vervangElementen(bron, naam, (xml) => {
    uit ??= xml;
    return xml;
  });
  return uit;
}
const tekenId = (s: string) =>
  s.match(/<(?:[\w.-]+:)?docPr\b[^>]*\bid=["']([^"']+)["']/)?.[1];
function metNamespaces(xml: string, deel: string) {
  const root =
    deel.match(
      /<(?:[\w.-]+:)?(?:document|hdr|ftr|footnotes|endnotes)\b(?:[^>"']|"[^"]*"|'[^']*')*>/,
    )?.[0] ?? "";
  const attrs = [...root.matchAll(/\s+xmlns(?::[\w.-]+)?=["'][^"']*["']/g)].map(
    (m) => m[0],
  );
  const eind = xml.indexOf(">"),
    head = xml.slice(0, eind);
  return (
    head +
    attrs.filter((a) => !head.includes(a.trim().split("=")[0] + "=")).join("") +
    xml.slice(eind)
  );
}
function kindBron(xml: string | undefined, id: string | undefined) {
  if (!xml || !id) return undefined;
  let uit: string | undefined;
  vervangElementen(xml, "wsp", (vorm) => {
    if (
      vorm.match(/<(?:[\w.-]+:)?cNvPr\b[^>]*\bid=["']([^"']+)["']/)?.[1] === id
    )
      uit = vorm;
    return vorm;
  });
  return uit;
}

/** Alleen de ontbrekende groep/geometrie/effecten aanvullen; gewone tekst blijft native. */
function tekenXml(
  v: Shape,
  schrijf: SchrijfVorm,
  basis?: string,
  origineel?: string,
): string {
  let bron = basis ?? schrijf(v);
  if (v.children?.length) {
    const groep = `<wpg:wgp xmlns:wpg="${WPG}" xmlns:wps="${WPS}"><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm${v.transform?.rotation ? ` rot="${Math.round(v.transform.rotation * 60000)}"` : ""}${v.transform?.flipH ? ' flipH="1"' : ""}${v.transform?.flipV ? ' flipV="1"' : ""}><a:off x="0" y="0"/><a:ext cx="${v.size.width}" cy="${v.size.height}"/><a:chOff x="0" y="0"/><a:chExt cx="${v.size.width}" cy="${v.size.height}"/></a:xfrm></wpg:grpSpPr>${v.children
      .map((c) => {
        if (c.children?.length) {
          const g = tekenXml(c, schrijf, undefined, origineel).match(
            /<wpg:wgp\b[\s\S]*<\/wpg:wgp>/,
          )?.[0];
          if (!g) throw new Error("Cannot serialize nested group");
          return g
            .replace(/wpg:wgp/g, "wpg:grpSp")
            .replace(
              /(<wpg:grpSp\b[^>]*>)/,
              `$1<wpg:cNvPr id="${xml(c.id!)}" name="${xml(c.name ?? "Group")}"/>`,
            )
            .replace(
              /<a:off\b[^>]*\/>/,
              `<a:off x="${c.offset?.x ?? 0}" y="${c.offset?.y ?? 0}"/>`,
            );
        }
        const kind = eersteElement(
          tekenXml(c, schrijf, undefined, kindBron(origineel, c.id)),
          "wsp",
        );
        if (!kind)
          throw new Error(
            "Cannot serialize a group child without a native shape",
          );
        return kind
          .replace(
            "<wps:wsp>",
            `<wps:wsp><wps:cNvPr id="${xml(c.id ?? "0")}" name="${xml(c.name ?? "Shape")}"/>`,
          )
          .replace(
            /<a:off\b[^>]*\/>/,
            `<a:off x="${c.offset?.x ?? 0}" y="${c.offset?.y ?? 0}"/>`,
          );
      })
      .join("")}</wpg:wgp>`;
    bron = bron.replace(
      /<a:graphicData\b[^>]*>[\s\S]*?<\/a:graphicData>/,
      `<a:graphicData uri="${WPG}">${groep}</a:graphicData>`,
    );
  } else {
    const sp = v.strokePaint;
    if (sp) {
      const caps = { flat: "flat", round: "rnd", square: "sq" };
      const compounds = {
        single: "sng",
        double: "dbl",
        thickThin: "thickThin",
        thinThick: "thinThick",
        triple: "tri",
      };
      const attr = (k: string, value: string | number | undefined) =>
        value === undefined ? "" : ` ${k}="${xml(value)}"`;
      const kleur =
        sp.fill?.color ??
        (sp.fill?.themeColor
          ? { themeColor: sp.fill.themeColor }
          : v.outline?.color);
      const verf =
        sp.fill?.kind === "none"
          ? "<a:noFill/>"
          : `<a:solidFill>${nativeKleur(kleur, schrijf)}</a:solidFill>`;
      const eind = (type: "headEnd" | "tailEnd") =>
        sp[type]
          ? `<a:${type}${attr("type", sp[type].type)}${attr("w", sp[type].width)}${attr("len", sp[type].length)}/>`
          : "";
      const lijn = `<a:ln${attr("w", sp.width ?? v.outline?.width)}${attr("cap", sp.cap && caps[sp.cap])}${attr("cmpd", sp.compound && compounds[sp.compound])}${attr("algn", sp.alignment && (sp.alignment === "center" ? "ctr" : "in"))}>${verf}${sp.dash ? `<a:prstDash val="${xml(sp.dash)}"/>` : ""}${sp.join === "miter" ? `<a:miter${attr("lim", sp.miterLimit)}/>` : sp.join ? `<a:${sp.join}/>` : ""}${eind("headEnd")}${eind("tailEnd")}</a:ln>`;
      bron = bron.replace(/<a:ln\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:ln>)/, lijn);
    }
    let stijl = origineel?.match(
      /<wps:style\b[^>]*>[\s\S]*?<\/wps:style>/,
    )?.[0];
    const effectRef = v.effects
      ?.map((e) => /^effectRef:(\d+)$/.exec(e.rawName ?? ""))
      ?.find(Boolean)?.[1];
    if (
      !stijl &&
      (sp?.themeRefIndex !== undefined ||
        v.fillPaint?.themeRefIndex !== undefined ||
        effectRef !== undefined)
    )
      stijl = `<wps:style><a:lnRef idx="${sp?.themeRefIndex ?? 0}"/><a:fillRef idx="${v.fillPaint?.themeRefIndex ?? 0}"/><a:effectRef idx="${effectRef ?? 0}"/><a:fontRef idx="minor"/></wps:style>`;
    if (stijl && !/<wps:style\b/.test(bron))
      bron = bron.replace("</wps:spPr>", "</wps:spPr>" + stijl);
    if (v.geometryPath?.length) {
      const pad = v.geometryPath
        .map((p) =>
          p.type === "close"
            ? "<a:close/>"
            : p.type === "move" || p.type === "line"
              ? `<a:${p.type === "move" ? "moveTo" : "lnTo"}><a:pt x="${Math.round((p.x ?? 0) * 100000)}" y="${Math.round((p.y ?? 0) * 100000)}"/></a:${p.type === "move" ? "moveTo" : "lnTo"}>`
              : p.type === "quad"
                ? `<a:quadBezTo><a:pt x="${Math.round((p.cpx ?? 0) * 100000)}" y="${Math.round((p.cpy ?? 0) * 100000)}"/><a:pt x="${Math.round((p.x ?? 0) * 100000)}" y="${Math.round((p.y ?? 0) * 100000)}"/></a:quadBezTo>`
                : p.type === "cubic"
                  ? `<a:cubicBezTo><a:pt x="${Math.round((p.cp1x ?? 0) * 100000)}" y="${Math.round((p.cp1y ?? 0) * 100000)}"/><a:pt x="${Math.round((p.cp2x ?? 0) * 100000)}" y="${Math.round((p.cp2y ?? 0) * 100000)}"/><a:pt x="${Math.round((p.x ?? 0) * 100000)}" y="${Math.round((p.y ?? 0) * 100000)}"/></a:cubicBezTo>`
                  : "",
        )
        .join("");
      const oud = origineel?.match(/<a:custGeom\b[\s\S]*?<\/a:custGeom>/)?.[0];
      const preset = origineel?.match(
        /<a:prstGeom\b[\s\S]*?<\/a:prstGeom>/,
      )?.[0];
      const maten = origineel?.match(/<(?:wp:extent|a:ext)\b[^>]*>/)?.[0];
      const breedte = Number(maten?.match(/\bcx="([^"]+)"/)?.[1]);
      const hoogte = Number(maten?.match(/\bcy="([^"]+)"/)?.[1]);
      // Een opgeloste preset heeft óók geometryPath. Houd bij ongewijzigde
      // afmetingen de originele parameters, curven en het tekstvak intact.
      const zelfdePreset =
        preset && breedte === v.size.width && hoogte === v.size.height;
      const transform = origineel?.match(
        /<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/,
      )?.[0];
      const rotatie =
        Number(transform?.match(/\brot="([^"]+)"/)?.[1] ?? 0) / 60000;
      const flip = (as: string) =>
        new RegExp(`\\b${as}="(?:1|true)"`).test(transform ?? "");
      const zelfdeTransform =
        (v.transform?.rotation ?? 0) === rotatie &&
        !!v.transform?.flipH === flip("flipH") &&
        !!v.transform?.flipV === flip("flipV");
      bron = bron.replace(
        /<a:prstGeom\b[\s\S]*?<\/a:prstGeom>/,
        (v.shapeType !== "wedgeRectCallout" &&
          (oud || (zelfdePreset && preset))) ||
          `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="100000" b="${v.shapeType === "wedgeRectCallout" ? 75000 : 100000}"/><a:pathLst><a:path w="100000" h="100000">${pad}</a:path></a:pathLst></a:custGeom>`,
      );
      // LO kan wp:extent en a:xfrm een fractie anders afronden. Beide frames
      // horen bij dezelfde preset; alleen het buitenframe herschrijven zou de
      // opgeloste pijlpunten en afgeronde hoeken bij elke opslag veranderen.
      if (zelfdePreset && zelfdeTransform && transform)
        bron = bron.replace(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/, transform);
    }
    const schaduw = v.effects?.find(
      (e) => e.kind === "shadow" && e.rawName !== "innerShdw",
    );
    const lijst =
      (origineel ?? bron).match(
        /<a:effectLst\b[^>]*>([\s\S]*?)<\/a:effectLst>/,
      )?.[1] ?? "";
    let overig = lijst.replace(
      /<a:outerShdw\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:outerShdw>)/g,
      "",
    );
    if (!v.effects?.some((e) => e.rawName === "innerShdw"))
      overig = overig.replace(
        /<a:innerShdw\b[^>]*>[\s\S]*?<\/a:innerShdw>/g,
        "",
      );
    let shadow = "";
    if (schaduw) {
      const oud =
        schaduw.rawName === "outerShdw"
          ? lijst.match(/<a:outerShdw\b[^>]*>[\s\S]*?<\/a:outerShdw>/)?.[0]
          : undefined;
      if (oud) shadow = oud;
      else {
        const kleur = {
          ...(schaduw.color ?? { rgb: "000000" }),
          transforms: [
            ...(schaduw.color?.transforms ?? []),
            ...(schaduw.opacity === undefined
              ? []
              : [{ kind: "alphaMod" as const, value: schaduw.opacity }]),
          ],
        };
        const kleurXml =
          schrijf({
            type: "shape",
            shapeType: "rect",
            size: { width: 1, height: 1 },
            fill: { type: "solid", color: kleur },
          }).match(/<a:solidFill\b[^>]*>([\s\S]*?)<\/a:solidFill>/)?.[1] ??
          '<a:srgbClr val="000000"/>';
        shadow = `<a:outerShdw blurRad="${schaduw.blurRadius ?? 0}" dist="${schaduw.distance ?? 0}" dir="${Math.round((schaduw.direction ?? 45) * 60000)}" algn="ctr" rotWithShape="0">${kleurXml}</a:outerShdw>`;
      }
    }
    bron = bron.replace(/<a:effectLst\b[^>]*>[\s\S]*?<\/a:effectLst>/g, "");
    if (overig || shadow)
      bron = bron.replace(
        "</wps:spPr>",
        `<a:effectLst>${overig}${shadow}</a:effectLst></wps:spPr>`,
      );
  }
  return bron;
}

/** Gedeelde S13-opslagroute: zowel sessie, editor als worker gebruiken deze stap. */
export function bewaarVormDetails(
  bytes: Uint8Array,
  verzoek: unknown,
  schrijf: SchrijfVorm,
  origineel?: Uint8Array,
): Uint8Array {
  const model = verzoek as {
    document: { content: unknown[] };
    headerEntries: [string, { content: unknown[] }][];
    footerEntries: [string, { content: unknown[] }][];
    footnotes: unknown[];
    endnotes: unknown[];
    relationshipEntries: [string, { target: string }][];
  };
  const perDeel = new Map<string, Map<string, Shape>>();
  function verzamel(naam: string, inhoud: unknown) {
    const vormen = perDeel.get(naam) ?? new Map<string, Shape>();
    const loop = (x: unknown) => {
      if (!x || typeof x !== "object") return;
      if (Array.isArray(x)) {
        x.forEach(loop);
        return;
      }
      const o = x as Record<string, unknown>;
      if (o.type === "shape" && o.size && typeof o.shapeType === "string") {
        const v = o as unknown as Shape;
        if (
          v.id &&
          (v.children?.length ||
            v.strokePaint ||
            v.geometryPath?.length ||
            v.effects?.length ||
            !vormBewerkbaar(v))
        ) {
          if (vormen.has(v.id))
            throw new Error(
              "Ambiguous drawing identifier while saving shape details",
            );
          vormen.set(v.id, v);
        }
        return;
      }
      Object.values(o).forEach(loop);
    };
    loop(inhoud);
    if (vormen.size) perDeel.set(naam, vormen);
  }
  verzamel("word/document.xml", model.document.content);
  verzamel("word/footnotes.xml", model.footnotes);
  verzamel("word/endnotes.xml", model.endnotes);
  const rels = new Map(model.relationshipEntries);
  for (const [id, story] of [...model.headerEntries, ...model.footerEntries]) {
    const doel = rels.get(id)?.target;
    if (doel)
      verzamel(
        doel.startsWith("/") ? doel.slice(1) : "word/" + doel,
        story.content,
      );
  }
  if (!perDeel.size) return bytes;
  const delen = unzipSync(bytes);
  const bronDelen = origineel ? unzipSync(origineel) : {};
  // Geïmporteerde verbindingslijnen mogen zonder cNvPr aankomen. Geef ze een
  // eigen id; meerdere nieuwe kinderen als id=0 bewaren maakt de groep ambigu.
  const ids = new Set<number>();
  const leesIds = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>,
      n = Number(o.id);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) ids.add(n);
    Object.values(o).forEach(leesIds);
  };
  leesIds(model);
  for (const [naam, deel] of Object.entries(delen))
    if (naam.startsWith("word/") && naam.endsWith(".xml"))
      for (const m of strFromU8(deel).matchAll(
        /<(?:[\w.-]+:)?(?:docPr|cNvPr)\b[^>]*\bid="(\d+)"/g,
      ))
        ids.add(Number(m[1]));
  let volgende = 1;
  const metIds = (v: Shape): Shape => {
    let id = v.id;
    if (!id) {
      while (ids.has(volgende)) volgende++;
      if (volgende > 0xffffffff)
        throw new Error("No drawing identifiers available");
      ids.add(volgende);
      id = String(volgende++);
    }
    return { ...v, id, children: v.children?.map(metIds) };
  };

  for (const naam of Object.keys(delen)) {
    const vormen = perDeel.get(naam);
    if (!vormen) continue;
    const gevonden = new Set<string>();
    const bron = strFromU8(delen[naam]);
    const bronXml = bronDelen[naam] ? strFromU8(bronDelen[naam]) : "";
    const oudeVormen = new Map<string, string>();
    vervangElementen(bronXml, "drawing", (tekening) => {
      const id = tekenId(tekening);
      if (id) {
        if (oudeVormen.has(id))
          throw new Error("Ambiguous original drawing identifier");
        oudeVormen.set(id, metNamespaces(tekening, bronXml));
      }
      return tekening;
    });
    const uit = vervangElementen(bron, "drawing", (tekening) => {
      const id = tekenId(tekening),
        v = id && vormen.get(id);
      if (!v) return tekening;
      if (gevonden.has(id))
        throw new Error(
          "Ambiguous output drawing identifier while saving shape details",
        );
      gevonden.add(id);
      const oud = oudeVormen.get(id);
      if (!vormBewerkbaar(v)) {
        if (!oud)
          throw new Error(
            "Cannot safely preserve an unsupported drawing group",
          );
        return oud;
      }
      return tekenXml(metIds(v), schrijf, tekening, oud);
    });

    if (gevonden.size !== vormen.size)
      throw new Error("A shape was omitted from the document save");
    if (uit !== bron) delen[naam] = strToU8(uit);
  }
  return zipSync(delen);
}
