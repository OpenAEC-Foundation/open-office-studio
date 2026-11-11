import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createYrsPositionProjection,
  createYrsSession,
  saveYrsDocx,
  type YrsSession,
} from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { getekendRaster } from "../liniaal/tabelraster";
import { registreerSplitsRaster, splitsCelMetBehoud } from "./splitsBreedte";
import { herstelSplitsBreedtes, herstelSplitsUitleg, tekstengineCompatibiliteit } from "../../../scripts/tekstengine-compatibiliteit";

type Vak = { x: number; y: number; w: number; h: number };
type Payload = {
  grid: number[];
  rows: { cells: { story: string; tcPr: Record<string, unknown> }[] }[];
};
function geometrie(s: YrsSession) {
  const font = s.registerFont(
    readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf"),
  );
  const vraag = {
    bodyStory: "body",
    renderEnv: {},
    options: { pageGap: 24 },
    regions: { sections: [{ sectionId: "main", properties: {} }] },
  };
  const nodig = JSON.parse(
    s.layoutFontRequirementsJson(JSON.stringify(vraag)),
  ) as { key: string }[];
  const indeling = s.layoutDocumentWithRegionsJson(
    JSON.stringify({
      ...vraag,
      measurement: {
        fontChains: Object.fromEntries(nodig.map((x) => [x.key, [font]])),
        defaults: { fontSize: 11, fontFamily: "Caladea" },
        authoritativeShaping: true,
      },
    }),
  );
  const lijst = JSON.parse(s.buildDisplayListJson(indeling)) as {
    pages: {
      primitives: {
        cell?: unknown;
        docStart?: number;
        clipGroup?: { clip: Vak };
      }[];
    }[];
  };
  const projectie = createYrsPositionProjection(s, "body")!;
  const vakken = new Map<string, Vak>();
  for (const p of lijst.pages.flatMap((p) => p.primitives))
    if (p.cell && p.docStart !== undefined && p.clipGroup)
      vakken.set(projectie.targetAt(p.docStart).story, p.clipGroup.clip);
  return vakken;
}
function bron(
  grid: number[],
  voorkeur: "geen" | "dxa" | "pct",
  indeling: "fixed" | "autofit",
) {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  const cel = (tekst: string, span: number) =>
    `<w:tc><w:tcPr>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${voorkeur === "geen" ? "" : `<w:tcW w:type="${voorkeur}" w:w="${(voorkeur === "pct" ? 2500 : 4680) * (span === grid.length ? 2 : 1)}"/>`}</w:tcPr><w:p><w:r><w:t>${tekst}</w:t></w:r></w:p></w:tc>`;
  const tabel = `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="9360"/><w:tblLayout w:type="${indeling}"/></w:tblPr><w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid><w:tr>${cel("Top", grid.length)}</w:tr><w:tr>${cel("R2C1", 1)}${cel("R2C2", grid.length - 1)}</w:tr><w:tr>${cel("R3C1", 1)}${cel("R3C2", grid.length - 1)}</w:tr></w:tbl>`;
  p.schrijf(
    "word/document.xml",
    p.lees("word/document.xml").replace("<w:body>", `<w:body>${tabel}`),
  );
  return p.inpakken();
}
const gevallen = [
  [4680, 4680],
  [3120, 3120, 3120],
  [2340, 2340, 2340, 2340],
  [3000, 6360],
].flatMap((grid) =>
  (["geen", "dxa", "pct"] as const).flatMap((voorkeur) =>
    (["fixed", "autofit"] as const).map((indeling) => ({
      grid,
      voorkeur,
      indeling,
    })),
  ),
);

describe("splitsen van afwijkende brontabellen (#130)", () => {
  it.each(gevallen)(
    "behoudt onderrijen met raster $grid, $voorkeur, $indeling",
    async ({ grid, voorkeur, indeling }) => {
      const s = await createYrsSession();
      try {
        s.openDocx(bron(grid, voorkeur, indeling), true);
        s.beginUndoCapture();
        s.setUndoCaptureMode("manual");
        const payload = () => s.tablePayload("body", 0) as unknown as Payload;
        const onder = payload()
          .rows.slice(1)
          .flatMap((r) => r.cells.map((c) => c.story));
        const voor = geometrie(s);
        const payloadVoor = payload();
        s.addUndoBoundary();
        const stop = registreerSplitsRaster(s, () => {
          const cellen = payloadVoor.rows.flatMap((r) => {
            let col = 0;
            return r.cells.map((c) => {
              const colSpan = Number(c.tcPr.colspan ?? 1);
              const v = voor.get(c.story)!;
              const out = { col, colSpan, x: v.x, w: v.w, exact: true };
              col += colSpan;
              return out;
            });
          });
          return getekendRaster(
            payloadVoor.grid,
            voor.values().next().value!.x,
            cellen,
          ).raster;
        });
        try {
          splitsCelMetBehoud(
            s,
            { story: "body", tableIndex: 0, row: 0, column: 0 },
            1,
            2,
          );
        } finally {
          stop();
        }
        s.addUndoBoundary();
        const na = geometrie(s);
        expect(payload().rows[0].cells).toHaveLength(2);
        payload()
          .rows.slice(1)
          .forEach((r, i) =>
            r.cells.forEach((c, j) => {
              expect(c.tcPr.width).toEqual(
                payloadVoor.rows[i + 1].cells[j].tcPr.width,
              );
              expect(c.tcPr.widthType).toEqual(
                payloadVoor.rows[i + 1].cells[j].tcPr.widthType,
              );
            }),
          );
        for (const id of onder) {
          expect(Math.abs(na.get(id)!.x - voor.get(id)!.x)).toBeLessThan(0.1);
          expect(Math.abs(na.get(id)!.w - voor.get(id)!.w)).toBeLessThan(0.1);
        }
        const bewaard = (await saveYrsDocx(s)).bytes;
        const terug = await createYrsSession();
        try {
          terug.openDocx(bewaard, true);
          const vakken = geometrie(terug);
          const cellen = (
            terug.tablePayload("body", 0) as unknown as Payload
          ).rows
            .slice(1)
            .flatMap((r) => r.cells);
          cellen.forEach((c, i) => {
            expect(
              Math.abs(vakken.get(c.story)!.x - voor.get(onder[i])!.x),
            ).toBeLessThan(0.1);
            expect(
              Math.abs(vakken.get(c.story)!.w - voor.get(onder[i])!.w),
            ).toBeLessThan(0.1);
          });
        } finally {
          terug.destroy();
        }
        expect(s.undo()).toBe(true);
        expect(payload().rows[0].cells).toHaveLength(1);
        expect(s.redo()).toBe(true);
        expect(geometrie(s)).toEqual(na);
      } finally {
        s.destroy();
      }
    },
  );
  it("weigert een AutoFit-splitsing zonder actuele meting zonder bronwijziging", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(bron([3120, 3120, 3120], "dxa", "autofit"), true);
      const voor = s.version();
      expect(() =>
        splitsCelMetBehoud(
          s,
          { story: "body", tableIndex: 0, row: 0, column: 0 },
          1,
          2,
        ),
      ).toThrow();
      expect(s.version()).toBe(voor);
    } finally {
      s.destroy();
    }
  });
  it("bewaakt de exacte productie-aansluiting van de splitsopdracht", () => {
    const bron = readFileSync(
      "node_modules/@betteroffice/docx-react/dist/index.mjs",
      "utf8",
    );
    expect(herstelSplitsBreedtes(bron)).toContain(
      "oosSplitsCel(I,re.focused,T.rows,T.columns)",
    );
    expect(() => herstelSplitsBreedtes("andere engine")).toThrow();
    expect(() => herstelSplitsBreedtes(bron + bron)).toThrow();
  });
  it("deelt een actuele meting tussen de invoer- en weergavehandle", async () => {
    const s = await createYrsSession();
    let stop: undefined | (() => void);
    try {
      s.openDocx(bron([4680, 4680], "dxa", "autofit"), true);
      stop = registreerSplitsRaster(s, () => [4680, 4680]);
      const facade = { ...s };
      splitsCelMetBehoud(
        facade,
        { story: "body", tableIndex: 0, row: 0, column: 0 },
        1,
        2,
      );
      expect((s.tablePayload("body", 0) as Payload).rows[0].cells).toHaveLength(
        2,
      );
    } finally {
      stop?.();
      s.destroy();
    }
  });
  it("weigert dubbelzinnige meetregistraties en ruimt alleen de eigen registratie op", async () => {
    const s = await createYrsSession();
    let stop1: undefined | (() => void), stop2: undefined | (() => void);
    try {
      s.openDocx(bron([4680, 4680], "dxa", "autofit"), true);
      stop1 = registreerSplitsRaster(s, () => [4680, 4680]);
      stop2 = registreerSplitsRaster(s, () => [5000, 4360]);
      const versie = s.version(),
        plek = { story: "body", tableIndex: 0, row: 0, column: 0 };
      expect(() => splitsCelMetBehoud(s, plek, 1, 2)).toThrow();
      expect(s.version()).toBe(versie);
      stop2();
      splitsCelMetBehoud(s, plek, 1, 2);
      expect((s.tablePayload("body", 0) as Payload).rows[0].cells).toHaveLength(
        2,
      );
    } finally {
      stop1?.();
      stop2?.();
      s.destroy();
    }
  });
  it("weigert een kleinere rijspan vóór de bron wordt aangepast",async()=>{
    const s=await createYrsSession();let stop:undefined|(()=>void);
    try{s.openDocx(bron([4680,4680],"dxa","autofit"),true);s.mergeCells({anchor:{story:"body",tableIndex:0,row:0,column:0},head:{story:"body",tableIndex:0,row:1,column:1}});
      stop=registreerSplitsRaster(s,()=>[4680,4680]);const versie=s.version();
      expect(()=>splitsCelMetBehoud(s,{story:"body",tableIndex:0,row:0,column:0},1,2)).toThrow();expect(s.version()).toBe(versie);
    }finally{stop?.();s.destroy();}
  });
  it("bewaakt uitleg en één Windows-module voor opdracht én meetregistratie",()=>{
    const bron=readFileSync("node_modules/@betteroffice/docx-react/dist/chunk-RHVJ6TAE.mjs","utf8");
    expect(herstelSplitsUitleg(bron)).toContain("oosSplitsUitleg()");expect(()=>herstelSplitsUitleg("anders")).toThrow();expect(()=>herstelSplitsUitleg(bron+bron)).toThrow();
    const resolve=tekstengineCompatibiliteit().resolveId;if(typeof resolve!=="function")throw new Error("missing resolver");
    const id=resolve.call({} as never,"openaec-tekst-splitsbreedte",undefined,{attributes:{},isEntry:false});expect(typeof id).toBe("string");expect(id).not.toContain("\\");
  });

});
