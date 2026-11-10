import type { Shape } from "@betteroffice/docx/types/content";
import type { YrsSession, YrsLoc } from "@betteroffice/docx/yrs";
import { vormBewerkbaar, schaalVorm } from "./groep";
import i18next from "../../i18n/config";
const fout = (sleutel: string) =>
  new Error(i18next.t(`writer:shapes.errors.${sleutel}`));

export const EMU_CM = 360000;
export const VORMEN = [
  "rect",
  "roundRect",
  "ellipse",
  "line",
  "rightArrow",
  "wedgeRectCallout",
  "textBox",
] as const;
export interface VormOpties {
  soort: Shape["shapeType"];
  breedte: number;
  hoogte: number;
  tekst: string;
  vulling: string;
  lijn: string;
  lijnDikte: number;
  schaduw: boolean;
  tekstKleur: string;
  terugloop:
    | "inline"
    | "square"
    | "tight"
    | "through"
    | "topAndBottom"
    | "behind"
    | "inFront";
  links: number;
  boven: number;
}
export const STANDAARD_VORM: VormOpties = {
  soort: "rect",
  breedte: 5,
  hoogte: 2.5,
  tekst: "",
  vulling: "#2468ab",
  lijn: "#18394d",
  lijnDikte: 1,
  schaduw: false,
  tekstKleur: "#ffffff",
  terugloop: "inline",
  links: 0,
  boven: 0,
};
const rgb = (kleur: string) => kleur.replace(/^#/, "").toUpperCase();
function tekstVanVorm(v: Shape): string {
  return (v.textBody?.content ?? [])
    .map((p) =>
      (p.content ?? [])
        .map((r) =>
          r.type === "run"
            ? r.content.map((x) => (x.type === "text" ? x.text : "")).join("")
            : "",
        )
        .join(""),
    )
    .join("\n");
}
export function optiesVanVorm(v: Shape): VormOpties {
  const type = v.wrap?.type;
  const terugloop =
    type === "square" ||
    type === "tight" ||
    type === "through" ||
    type === "topAndBottom"
      ? type
      : v.position
        ? v.position.behindDoc
          ? "behind"
          : "inFront"
        : "inline";
  const run = v.textBody?.content
    .flatMap((p) => p.content ?? [])
    .find((r) => r.type === "run");
  return {
    soort: (v as Shape & { textBox?: boolean }).textBox
      ? "textBox"
      : v.shapeType,
    breedte: v.size.width / EMU_CM,
    hoogte: v.size.height / EMU_CM,
    tekst: tekstVanVorm(v),
    vulling:
      v.fill?.type === "none" ? "" : `#${v.fill?.color?.rgb ?? "2468AB"}`,
    lijn:
      v.outline?.width === 0 || v.strokePaint?.fill?.kind === "none"
        ? ""
        : v.outline?.color?.rgb
          ? `#${v.outline.color.rgb}`
          : "",
    lijnDikte: (v.outline?.width ?? 12700) / 12700,
    tekstKleur: `#${run?.type === "run" ? (run.formatting?.color?.rgb ?? "000000") : "000000"}`,
    schaduw: !!v.effects?.some((e) => e.kind === "shadow"),
    terugloop,
    links: (v.position?.horizontal.posOffset ?? v.offset?.x ?? 0) / EMU_CM,
    boven: (v.position?.vertical.posOffset ?? v.offset?.y ?? 0) / EMU_CM,
  };
}
/** Alleen expliciet bewerkte eigenschappen vervangen; onbekende tekengegevens bewaren. */
export function vormUitOpties(o: VormOpties, bestaand?: Shape): Shape {
  if (bestaand && !vormBewerkbaar(bestaand)) throw fout("unsupported");
  if (
    ![o.breedte, o.hoogte, o.lijnDikte, o.links, o.boven].every(
      Number.isFinite,
    ) ||
    (o.soort === "line"
      ? o.breedte < 0 || o.hoogte < 0 || o.breedte + o.hoogte <= 0
      : o.breedte <= 0 || o.hoogte <= 0) ||
    o.lijnDikte < 0 ||
    o.breedte > 100 ||
    o.hoogte > 100
  )
    throw fout("dimensions");
  for (const kleur of [o.vulling, o.lijn, o.tekstKleur])
    if (kleur && !/^#[\da-f]{6}$/i.test(kleur)) throw fout("color");
  const v: Shape & { textBox?: boolean } = {
    ...bestaand,
    type: "shape",
    shapeType: o.soort,
    textBox: o.soort === "textBox",
    size: {
      width: Math.round(o.breedte * EMU_CM),
      height: Math.round(o.hoogte * EMU_CM),
    },
    fill: o.vulling
      ? { type: "solid", color: { rgb: rgb(o.vulling) } }
      : { type: "none" },
    outline: {
      ...bestaand?.outline,
      width: o.lijn ? Math.round(o.lijnDikte * 12700) : 0,
      color: { rgb: rgb(o.lijn || "#000000") },
    },
    name: bestaand?.name ?? i18next.t(`writer:shapes.types.${o.soort}`),
    effects: [
      ...(bestaand?.effects ?? []).filter((e) => e.kind !== "shadow"),
      ...(o.schaduw
        ? [
            {
              kind: "shadow" as const,
              color: { rgb: "000000" },
              opacity: 0.3,
              blurRadius: 38100,
              distance: 19050,
              direction: 45,
            },
          ]
        : []),
    ],
  };
  if (o.soort === "wedgeRectCallout")
    v.geometryPath = [
      { type: "move", x: 0, y: 0 },
      { type: "line", x: 1, y: 0 },
      { type: "line", x: 1, y: 0.75 },
      { type: "line", x: 0.5, y: 0.75 },
      { type: "line", x: 0.25, y: 1 },
      { type: "line", x: 0.3, y: 0.75 },
      { type: "line", x: 0, y: 0.75 },
      { type: "close" },
    ];
  if (bestaand?.children?.length) {
    v.children = bestaand.children.map((c) =>
      schaalVorm(
        c,
        v.size.width / bestaand.size.width,
        v.size.height / bestaand.size.height,
      ),
    );
    delete v.scene;
  }
  const oud = bestaand ? optiesVanVorm(bestaand) : null;
  if (bestaand && oud?.vulling === o.vulling) v.fill = bestaand.fill;
  if (bestaand && oud?.lijn === o.lijn && oud.lijnDikte === o.lijnDikte)
    v.outline = bestaand.outline;
  if (bestaand && oud?.schaduw === o.schaduw) v.effects = bestaand.effects;
  if (!oud || oud.vulling !== o.vulling) delete v.fillPaint;
  if (
    (bestaand?.strokePaint || !o.lijn) &&
    (!oud || oud.lijn !== o.lijn || oud.lijnDikte !== o.lijnDikte)
  )
    v.strokePaint = {
      ...bestaand?.strokePaint,
      width: v.outline?.width,
      fill: o.lijn
        ? { kind: "solid", color: { rgb: rgb(o.lijn) } }
        : { kind: "none" },
    };
  if (bestaand?.shapeType !== o.soort) {
    delete v.customGeometry;
    if (o.soort !== "wedgeRectCallout") delete v.geometryPath;
  }
  if (!bestaand || tekstVanVorm(bestaand) !== o.tekst)
    v.textBody = {
      ...bestaand?.textBody,
      content: o.tekst.split(/\r?\n/).map((text) => ({
        type: "paragraph",
        content: [
          {
            type: "run",
            formatting: { color: { rgb: rgb(o.tekstKleur) } },
            content: [{ type: "text", text }],
          },
        ],
      })),
    };
  else if (oud?.tekstKleur !== o.tekstKleur && v.textBody)
    v.textBody = {
      ...v.textBody,
      content: v.textBody.content.map((p) => ({
        ...p,
        content: p.content.map((r) =>
          r.type === "run"
            ? {
                ...r,
                formatting: {
                  ...r.formatting,
                  color: { rgb: rgb(o.tekstKleur) },
                },
              }
            : r,
        ),
      })),
    };
  if (
    bestaand &&
    oud?.terugloop === o.terugloop &&
    oud.links === o.links &&
    oud.boven === o.boven
  )
    return v;
  if (bestaand?.offset && !bestaand.position)
    v.offset = {
      x: Math.round(o.links * EMU_CM),
      y: Math.round(o.boven * EMU_CM),
    };
  if (o.terugloop === "inline") {
    v.wrap = { type: "inline" };
    delete v.position;
  } else {
    v.wrap = { ...bestaand?.wrap, type: o.terugloop };
    v.position = {
      ...bestaand?.position,
      behindDoc: o.terugloop === "behind",
      horizontal: {
        relativeTo: "column",
        posOffset: Math.round(o.links * EMU_CM),
      },
      vertical: {
        relativeTo: "paragraph",
        posOffset: Math.round(o.boven * EMU_CM),
      },
    };
  }
  return v;
}

export interface VormPlek {
  sleutel: string;
  story: string;
  index: number;
  loc: YrsLoc;
  vorm: Shape;
}
/** Leest ook vormen in tabelcellen, kop-/voetteksten en noten zonder iets te wijzigen. */
export function vormenLijst(s: YrsSession): VormPlek[] {
  const uit: VormPlek[] = [];
  for (const story of s.storyIds()) {
    let index = 0,
      begin = 0,
      buffer: Omit<VormPlek, "loc">[] = [];
    for (const deel of s.storySegments(story)) {
      if (
        deel.kind === "embed" &&
        deel.embedKind === "shape" &&
        typeof deel.payload.shapeJson === "string"
      ) {
        try {
          const vorm = JSON.parse(deel.payload.shapeJson) as Shape;
          if (vorm.type === "shape")
            buffer.push({ sleutel: `${story}@${index}`, story, index, vorm });
        } catch {
          /* Een onbekend/beschadigd object laten we onaangeroerd. */
        }
      }
      if (deel.kind === "pilcrow") {
        uit.push(
          ...buffer.map((v) => ({
            ...v,
            loc: { story, paraId: deel.paraId, offset: v.index - begin },
          })),
        );
        buffer = [];
        begin = index + 1;
      }
      index += deel.kind === "text" ? deel.text.length : 1;
    }
  }
  return uit;
}

function verseIds(s: YrsSession) {
  const gebruikt = new Set<number>();
  const lees = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) {
      x.forEach(lees);
      return;
    }
    const o = x as Record<string, unknown>,
      id = Number(o.id);
    if (Number.isSafeInteger(id) && id >= 0 && id <= 0xffffffff)
      gebruikt.add(id);
    Object.values(o).forEach(lees);
  };
  for (const story of s.storyIds())
    for (const d of s.storySegments(story))
      if (d.kind === "embed") {
        lees(d.payload);
        if (d.embedKind === "shape" && typeof d.payload.shapeJson === "string")
          try {
            lees(JSON.parse(d.payload.shapeJson));
          } catch {}
      }
  let id = 1;
  return () => {
    while (gebruikt.has(id)) id++;
    if (id > 0xffffffff) throw fout("ids");
    gebruikt.add(id);
    return String(id++);
  };
}
const volgendId = (s: YrsSession) => verseIds(s)();

function ruweVormen(
  s: YrsSession,
  story: string,
  ops: Parameters<YrsSession["applyRawOps"]>[1],
) {
  (s.beginUndoCapture as (story?: string) => void)(story);
  s.applyRawOps(story, ops);
}
export function voegVormInSessie(s: YrsSession, loc: YrsLoc, vorm: Shape) {
  const span = s.locateParagraph(loc.story, loc.paraId);
  if (loc.offset < 0 || span.start + loc.offset > span.end)
    throw fout("position");
  const nieuwId = verseIds(s);
  const geefId = (v: Shape): Shape => ({
    ...v,
    id: nieuwId(),
    children: v.children?.map(geefId),
  });
  const v = geefId(vorm);
  ruweVormen(s, loc.story, [
    {
      op: "insertEmbed",
      index: span.start + loc.offset,
      kind: "shape",
      payload: { shapeJson: JSON.stringify(v) },
    },
  ]);
  s.setSelection(loc, { ...loc, offset: loc.offset + 1 });
  return v;
}
export function wijzigVormInSessie(s: YrsSession, plek: VormPlek, vorm: Shape) {
  controleerPlekken(s, [plek]);
  const actueel = vormenLijst(s).find((v) => v.sleutel === plek.sleutel);
  if (!actueel || actueel.vorm.id !== plek.vorm.id) throw fout("changed");
  if (!vormBewerkbaar(actueel.vorm)) throw fout("unsupported");
  if (vorm.children?.length) {
    vorm = { ...vorm };
    delete vorm.scene;
  }
  ruweVormen(s, plek.story, [
    {
      op: "setEmbedAttr",
      index: plek.index,
      key: "shapeJson",
      value: JSON.stringify(vorm),
    },
  ]);
}
export function verwijderVormInSessie(s: YrsSession, plek: VormPlek) {
  controleerPlekken(s, [plek]);
  const actueel = vormenLijst(s).find((v) => v.sleutel === plek.sleutel);
  if (!actueel || actueel.vorm.id !== plek.vorm.id) throw fout("changed");
  ruweVormen(s, plek.story, [{ op: "delete", index: plek.index, len: 1 }]);
}

export interface VormKader {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  pagina?: number;
}
function controleerPlekken(s: YrsSession, keuze: VormPlek[]) {
  const nu = vormenLijst(s);
  for (const v of keuze) {
    const actueel = nu.find((n) => n.sleutel === v.sleutel);
    if (!actueel || JSON.stringify(actueel.vorm) !== JSON.stringify(v.vorm))
      throw fout("changed");
  }
}

/** Groepeer inline-buren, of gemeten vormen op dezelfde pagina. */
export function groepeerVormen(
  s: YrsSession,
  keuze: VormPlek[],
  kaders?: Map<string, VormKader>,
) {
  const lijst = [...keuze].sort((a, b) => a.index - b.index);
  controleerPlekken(s, lijst);
  if (
    lijst.length < 2 ||
    lijst.some((v) => !vormBewerkbaar(v.vorm) || v.story !== lijst[0].story)
  )
    throw fout("groupSelect");
  const inline = lijst.every(
    (v, i) =>
      !v.vorm.position &&
      v.loc.paraId === lijst[0].loc.paraId &&
      (i === 0 || v.index === lijst[i - 1].index + 1),
  );
  let breedte = 0,
    hoogte = 0,
    children: Shape[],
    positie: Shape["position"],
    wrap: Shape["wrap"];
  if (inline) {
    children = lijst.map((v) => {
      const kind = { ...v.vorm, offset: { x: breedte, y: 0 } };
      breedte += v.vorm.size.width;
      hoogte = Math.max(hoogte, v.vorm.size.height);
      delete kind.position;
      return kind;
    });
  } else {
    const frames = lijst.map((v) => kaders?.get(v.sleutel));
    if (
      frames.some((k) => !k) ||
      new Set(frames.map((k) => k?.pagina)).size !== 1
    )
      throw fout("groupSelect");
    const f = frames as VormKader[],
      x = Math.min(...f.map((k) => k.x)),
      y = Math.min(...f.map((k) => k.y));
    breedte = Math.max(...f.map((k) => k.x + k.breedte)) - x;
    hoogte = Math.max(...f.map((k) => k.y + k.hoogte)) - y;
    children = lijst.map((v, i) => {
      const kind = {
        ...v.vorm,
        size: { width: f[i].breedte, height: f[i].hoogte },
        offset: { x: f[i].x - x, y: f[i].y - y },
        wrap: { type: "inline" as const },
      };
      delete kind.position;
      return kind;
    });
    positie = {
      behindDoc: lijst.every((v) => v.vorm.position?.behindDoc === true),
      horizontal: { relativeTo: "page", posOffset: x },
      vertical: { relativeTo: "page", posOffset: y },
      relativeHeight: Math.max(
        0,
        ...lijst.map(
          (v) => v.vorm.relativeHeight ?? v.vorm.position?.relativeHeight ?? 0,
        ),
      ),
    };
    wrap = lijst.every((v) => v.vorm.wrap?.type === lijst[0].vorm.wrap?.type)
      ? { ...lijst[0].vorm.wrap, type: lijst[0].vorm.wrap?.type ?? "square" }
      : { type: "square" };
  }
  const groep: Shape = {
    type: "shape",
    shapeType: "rect",
    id: volgendId(s),
    name: i18next.t("writer:shapes.groupAction"),
    size: { width: breedte, height: hoogte },
    fill: { type: "none" },
    outline: { width: 0 },
    children,
    position: positie,
    wrap,
  };
  ruweVormen(s, lijst[0].story, [
    ...lijst
      .map((v) => ({ op: "delete" as const, index: v.index, len: 1 }))
      .reverse(),
    {
      op: "insertEmbed",
      index: lijst[0].index,
      kind: "shape",
      payload: { shapeJson: JSON.stringify(groep) },
    },
  ]);
  return groep;
}

export function hefGroepOp(s: YrsSession, plek: VormPlek, kader?: VormKader) {
  controleerPlekken(s, [plek]);
  const children = plek.vorm.children;
  if (!children?.length || !vormBewerkbaar(plek.vorm))
    throw fout("selectGroup");
  let rechts = 0;
  const inline =
    !plek.vorm.position &&
    !plek.vorm.transform?.rotation &&
    !plek.vorm.transform?.flipH &&
    !plek.vorm.transform?.flipV &&
    children.every((c) => {
      const goed = (c.offset?.y ?? 0) === 0 && (c.offset?.x ?? 0) === rechts;
      rechts += c.size.width;
      return goed;
    });
  if (!inline && !kader) throw fout("layout");
  const nieuwId = verseIds(s);
  const delen = children.map((c, i) => {
    const v = { ...c, id: nieuwId() };
    delete v.offset;
    if (inline) {
      delete v.position;
      v.wrap = { type: "inline" };
      return v;
    }
    const k = kader!,
      w = plek.vorm.size.width,
      h = plek.vorm.size.height,
      sx = k.breedte / w,
      sy = k.hoogte / h;
    const fx = plek.vorm.transform?.flipH ? -1 : 1,
      fy = plek.vorm.transform?.flipV ? -1 : 1,
      hoek = ((plek.vorm.transform?.rotation ?? 0) * Math.PI) / 180;
    const dx = ((c.offset?.x ?? 0) + c.size.width / 2 - w / 2) * sx * fx,
      dy = ((c.offset?.y ?? 0) + c.size.height / 2 - h / 2) * sy * fy;
    const breedte = c.size.width * sx,
      hoogte = c.size.height * sy;
    v.size = { width: Math.round(breedte), height: Math.round(hoogte) };
    v.position = {
      horizontal: {
        relativeTo: "page",
        posOffset: Math.round(
          k.x +
            k.breedte / 2 +
            Math.cos(hoek) * dx -
            Math.sin(hoek) * dy -
            breedte / 2,
        ),
      },
      vertical: {
        relativeTo: "page",
        posOffset: Math.round(
          k.y +
            k.hoogte / 2 +
            Math.sin(hoek) * dx +
            Math.cos(hoek) * dy -
            hoogte / 2,
        ),
      },
      relativeHeight: plek.vorm.position?.relativeHeight ?? 0,
    };
    const z =
      (plek.vorm.relativeHeight ?? plek.vorm.position?.relativeHeight ?? 0) + i;
    v.relativeHeight = z;
    v.position.relativeHeight = z;
    v.position.behindDoc = plek.vorm.position?.behindDoc;
    v.wrap =
      plek.vorm.wrap?.type && plek.vorm.wrap.type !== "inline"
        ? { ...plek.vorm.wrap }
        : { type: "square" };
    v.transform = {
      ...c.transform,
      rotation:
        (plek.vorm.transform?.rotation ?? 0) +
        fx * fy * (c.transform?.rotation ?? 0),
      flipH: !!plek.vorm.transform?.flipH !== !!c.transform?.flipH,
      flipV: !!plek.vorm.transform?.flipV !== !!c.transform?.flipV,
    };
    return v;
  });
  ruweVormen(s, plek.story, [
    { op: "delete", index: plek.index, len: 1 },
    ...delen.map((v, i) => ({
      op: "insertEmbed" as const,
      index: plek.index + i,
      kind: "shape",
      payload: { shapeJson: JSON.stringify(v) },
    })),
  ]);
}

/** Laag wijzigen houdt ook de nog niet toegepaste formulierwijzigingen vast. */
export function zetVormLaag(
  s: YrsSession,
  plek: VormPlek,
  voor: boolean,
  vorm = plek.vorm,
) {
  controleerPlekken(s, [plek]);
  if (!vorm.position) throw fout("position");
  const lijst = vormenLijst(s).filter(
      (v) => v.story === plek.story && v.vorm.position,
    ),
    max = Math.max(
      0,
      ...lijst.map(
        (v) => v.vorm.relativeHeight ?? v.vorm.position?.relativeHeight ?? 0,
      ),
    );
  const z = voor ? max + 1 : 0;
  const ops = [];
  if (!voor)
    for (const v of lijst)
      if (v.sleutel !== plek.sleutel) {
        const h =
          (v.vorm.relativeHeight ?? v.vorm.position?.relativeHeight ?? 0) + 1;
        ops.push({
          op: "setEmbedAttr" as const,
          index: v.index,
          key: "shapeJson",
          value: JSON.stringify({
            ...v.vorm,
            relativeHeight: h,
            position: { ...v.vorm.position, relativeHeight: h },
          }),
        });
      }
  ops.push({
    op: "setEmbedAttr" as const,
    index: plek.index,
    key: "shapeJson",
    value: JSON.stringify({
      ...vorm,
      relativeHeight: z,
      position: { ...vorm.position, relativeHeight: z },
    }),
  });

  ruweVormen(s, plek.story, ops);
}

export function maakSchema(
  soort: "proces" | "organisatie",
  opties: VormOpties = STANDAARD_VORM,
): Shape {
  const vak = (tekst: string, x: number, y: number, w = 3, h = 1.5): Shape => ({
    ...vormUitOpties({
      ...opties,
      soort: "roundRect",
      breedte: w,
      hoogte: h,
      tekst,
    }),
    offset: { x: x * EMU_CM, y: y * EMU_CM },
  });
  const lijn = (x: number, y: number, w: number, h: number): Shape => ({
    ...vormUitOpties({
      ...opties,
      soort: "line",
      breedte: w,
      hoogte: h,
      tekst: "",
      vulling: "",
    }),
    offset: { x: x * EMU_CM, y: y * EMU_CM },
  });
  let children: Shape[], width: number, height: number;
  if (soort === "proces") {
    children = [
      vak(i18next.t("writer:shapes.start"), 0, 0),
      vak(i18next.t("writer:shapes.step"), 4.5, 0),
      vak(i18next.t("writer:shapes.end"), 9, 0),
      ...[3.25, 7.75].map((x) => ({
        ...vormUitOpties({
          ...opties,
          soort: "rightArrow",
          breedte: 1,
          hoogte: 0.4,
          tekst: "",
        }),
        offset: { x: x * EMU_CM, y: 0.55 * EMU_CM },
      })),
    ];
    width = 12;
    height = 1.5;
  } else {
    children = [
      lijn(5, 1.5, 0, 0.75),
      lijn(2, 2.25, 6, 0),
      lijn(2, 2.25, 0, 0.75),
      lijn(8, 2.25, 0, 0.75),
      vak(i18next.t("writer:shapes.manager"), 3, 0, 4),
      vak(i18next.t("writer:shapes.team") + " 1", 0, 3, 4),
      vak(i18next.t("writer:shapes.team") + " 2", 6, 3, 4),
    ];
    width = 10;
    height = 4.5;
  }
  return {
    type: "shape",
    shapeType: "rect",
    name: i18next.t("writer:shapes." + soort),
    size: { width: width * EMU_CM, height: height * EMU_CM },
    fill: { type: "none" },
    outline: { width: 0 },
    children,
  };
}
