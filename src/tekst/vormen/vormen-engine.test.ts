import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTekstkernProef } from "../../../scripts/tekstkern-proef";
let kern: Awaited<ReturnType<typeof openTekstkernProef>>;
beforeAll(async () => {
  kern = await openTekstkernProef();
});
afterAll(() => kern?.sluit());
const createYrsSession = () => kern.sdk.createYrsSession();
function proefbestand(naam: string, bytes: Uint8Array) {
  if (!process.env.OOS_VORMEN_UITVOER) return;
  mkdirSync(process.env.OOS_VORMEN_UITVOER, { recursive: true });
  writeFileSync(join(process.env.OOS_VORMEN_UITVOER, naam + ".docx"), bytes);
}
const saveYrsDocx: (typeof import("@betteroffice/docx/yrs"))["saveYrsDocx"] = (
  ...args
) => kern.sdk.saveYrsDocx(...args);
import { vormBewerkbaar } from "./groep";
import { vormKadersUitLijst, getekendeVormKaders } from "./kaders";
import type { DisplayList } from "@betteroffice/docx/layout/render";
import type {
  DocxPluginGeometry,
  DocxEditorRef,
} from "@betteroffice/docx-react";
import { Pakket } from "../../grafieken/pakket";
import {
  VORMEN,
  STANDAARD_VORM,
  vormUitOpties,
  optiesVanVorm,
  voegVormInSessie,
  vormenLijst,
  wijzigVormInSessie,
  verwijderVormInSessie,
  groepeerVormen,
  hefGroepOp,
  maakSchema,
  zetVormLaag,
} from "./model";

async function sessie() {
  const s = await createYrsSession();
  s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
  s.beginUndoCapture();
  s.setUndoCaptureMode("manual");
  return s;
}
describe("native Writer-vormen (#56)", () => {
  it("verwijdert schaduw en omtrek uit een heropende vorm zonder andere onderdelen te wijzigen", async () => {
    const s = await sessie();
    const heropend = await createYrsSession();
    const nogmaals = await createYrsSession();
    try {
      const loc = {
        story: "body",
        paraId: s.paragraphs("body")[0].paraId,
        offset: 0,
      };
      voegVormInSessie(s, loc, maakSchema("organisatie"));
      const plek = vormenLijst(s)[0];
      const vorm = structuredClone(plek.vorm);
      const index = vorm.children!.findIndex(
        (c) => c.shapeType === "roundRect",
      );
      vorm.children![index] = vormUitOpties(
        { ...optiesVanVorm(vorm.children![index]), schaduw: true },
        vorm.children![index],
      );
      wijzigVormInSessie(s, plek, vorm);
      heropend.openDocx((await saveYrsDocx(s)).bytes, true);
      const geopend = vormenLijst(heropend)[0];
      const gewijzigd = structuredClone(geopend.vorm);
      const voor = gewijzigd.children![index];
      expect(optiesVanVorm(voor).schaduw).toBe(true);
      gewijzigd.children![index] = vormUitOpties(
        { ...optiesVanVorm(voor), schaduw: false, lijn: "" },
        voor,
      );
      wijzigVormInSessie(heropend, geopend, gewijzigd);
      nogmaals.openDocx((await saveYrsDocx(heropend)).bytes, true);
      const na = vormenLijst(nogmaals)[0].vorm;
      expect(optiesVanVorm(na.children![index]).schaduw).toBe(false);
      expect(optiesVanVorm(na.children![index]).lijn).toBe("");
      expect(na.children![index].size).toEqual(voor.size);
      expect(na.children![index].fill).toEqual(voor.fill);
      expect(na.children!.filter((_, i) => i !== index)).toEqual(
        geopend.vorm.children!.filter((_, i) => i !== index),
      );
    } finally {
      s.destroy();
      heropend.destroy();
      nogmaals.destroy();
    }
  });
  it.each(VORMEN)(
    "voegt %s in als native DrawingML, bewerkt en bewaart de vorm",
    async (soort) => {
      const s = await sessie();
      try {
        const loc = {
          story: "body",
          paraId: s.paragraphs("body")[0].paraId,
          offset: 0,
        };
        const vorm = vormUitOpties({
          ...STANDAARD_VORM,
          soort,
          tekst: "Een eigen tekst",
          schaduw: true,
        });
        s.addUndoBoundary();
        voegVormInSessie(s, loc, vorm);
        s.addUndoBoundary();
        expect(vormenLijst(s)).toHaveLength(1);
        expect(
          s
            .yrsBlocksForStory("body", {})
            .some((b) => (b as { kind: string }).kind === "shape"),
        ).toBe(true);
        expect(s.undo()).toBe(true);
        expect(vormenLijst(s)).toHaveLength(0);
        expect(s.redo()).toBe(true);
        const [plek] = vormenLijst(s);
        s.addUndoBoundary();
        wijzigVormInSessie(
          s,
          plek,
          vormUitOpties(
            {
              ...optiesVanVorm(plek.vorm),
              tekst: "Bewerkte tekst",
              breedte: 6,
            },
            plek.vorm,
          ),
        );
        s.addUndoBoundary();
        const bytes = (await saveYrsDocx(s)).bytes;
        proefbestand(soort, bytes);
        const xml = new Pakket(bytes).lees("word/document.xml");
        expect(xml).toContain("Bewerkte tekst");
        expect(xml).toContain("2468AB");
        expect(xml).toContain("w:drawing");
        expect(xml).not.toContain("data:image/svg");
        const heropend = await createYrsSession();
        try {
          heropend.openDocx(bytes, true);
          const [v] = vormenLijst(heropend);
          expect(v.vorm.shapeType).toBe(
            soort === "textBox"
              ? "rect"
              : soort === "wedgeRectCallout"
                ? "rect"
                : soort,
          );
          expect(v.vorm.size.width).toBe(2160000);
          if (soort === "wedgeRectCallout")
            expect(v.vorm.geometryPath).toEqual(vorm.geometryPath);
          expect(v.vorm.effects?.some((e) => e.kind === "shadow")).toBe(true);
          const opnieuw = (await saveYrsDocx(heropend)).bytes;
          const tweede = await createYrsSession();
          try {
            tweede.openDocx(opnieuw, true);
            const vv = vormenLijst(tweede)[0].vorm;
            expect(vv.geometryPath).toEqual(v.vorm.geometryPath);
            expect(optiesVanVorm(vv).tekst).toBe("Bewerkte tekst");
          } finally {
            tweede.destroy();
          }
          expect(optiesVanVorm(v.vorm).tekst).toBe("Bewerkte tekst");
        } finally {
          heropend.destroy();
        }
      } finally {
        s.destroy();
      }
    },
  );
  it("groepeert en ontgroepeert twee vormen zonder ze naar afbeeldingen om te zetten", async () => {
    const s = await sessie();
    try {
      const loc = {
        story: "body",
        paraId: s.paragraphs("body")[0].paraId,
        offset: 0,
      };
      voegVormInSessie(
        s,
        loc,
        vormUitOpties({ ...STANDAARD_VORM, tekst: "Eén" }),
      );
      voegVormInSessie(
        s,
        { ...loc, offset: 1 },
        vormUitOpties({ ...STANDAARD_VORM, soort: "ellipse", tekst: "Twee" }),
      );
      s.addUndoBoundary();
      groepeerVormen(s, vormenLijst(s));
      s.addUndoBoundary();
      expect(vormenLijst(s)).toHaveLength(1);
      expect(vormenLijst(s)[0].vorm.children).toHaveLength(2);
      expect(s.undo()).toBe(true);
      expect(vormenLijst(s)).toHaveLength(2);
      expect(s.redo()).toBe(true);
      const bytes = (await saveYrsDocx(s)).bytes;

      const heropend = await createYrsSession();
      try {
        heropend.openDocx(bytes, true);
        const [groep] = vormenLijst(heropend);
        expect(groep.vorm.children).toHaveLength(2);
        hefGroepOp(heropend, groep);
        expect(vormenLijst(heropend)).toHaveLength(2);
      } finally {
        heropend.destroy();
      }
    } finally {
      s.destroy();
    }
  });
  it("behoudt geïmporteerde niet-bewerkte opmaak en positioneringsmetadata", () => {
    const bron = vormUitOpties({
      ...STANDAARD_VORM,
      tekst: "Behouden",
      terugloop: "square",
    });
    bron.position!.horizontal.relativeTo = "page";
    bron.position!.vertical.relativeTo = "margin";
    bron.fillPaint = { kind: "gradient", angle: 22 };
    bron.effects = [{ kind: "shadow", distance: 5555 }];
    const uit = vormUitOpties({ ...optiesVanVorm(bron), breedte: 7 }, bron);
    expect(uit.position).toEqual(bron.position);
    expect(uit.fillPaint).toEqual(bron.fillPaint);
    expect(uit.effects).toEqual(bron.effects);
    expect(uit.textBody).toEqual(bron.textBody);
  });
  it("verwijdert alleen de gekozen vorm en laat gewone tekst staan", async () => {
    const s = await sessie();
    try {
      const loc = {
        story: "body",
        paraId: s.paragraphs("body")[0].paraId,
        offset: 0,
      };
      s.insertText(loc, "Bewaren");
      voegVormInSessie(s, { ...loc, offset: 7 }, vormUitOpties(STANDAARD_VORM));
      s.addUndoBoundary();
      verwijderVormInSessie(s, vormenLijst(s)[0]);
      s.addUndoBoundary();
      expect(vormenLijst(s)).toHaveLength(0);
      expect(s.paragraphs("body")[0].text).toContain("Bewaren");
      expect(s.undo()).toBe(true);
      expect(vormenLijst(s)).toHaveLength(1);
    } finally {
      s.destroy();
    }
  });
  it.each(["proces", "organisatie"] as const)(
    "bewaart een bewerkbaar %s-schema via beide opslagroutes",
    async (soort) => {
      const source = readFileSync("public/templates/nieuw.docx"),
        s = await sessie();
      try {
        const loc = {
          story: "body",
          paraId: s.paragraphs("body")[0].paraId,
          offset: 0,
        };
        voegVormInSessie(s, loc, maakSchema(soort));
        const groep = vormenLijst(s)[0],
          aantal = groep.vorm.children!.length;
        expect(aantal).toBe(soort === "proces" ? 5 : 7);
        const ids = [groep.vorm.id, ...groep.vorm.children!.map((c) => c.id)];
        expect(new Set(ids).size).toBe(ids.length);
        expect(
          (
            s.yrsBlocksForStory("body", {}) as {
              kind: string;
              children?: unknown[];
            }[]
          ).find((b) => b.kind === "shape")?.children,
        ).toHaveLength(aantal);
        for (const route of ["sessie", "editor"]) {
          const doc = await kern.docx.parseDocx(source, {
            preloadFonts: false,
          });
          const bytes =
            route === "sessie"
              ? (await saveYrsDocx(s)).bytes
              : new Uint8Array(
                  await kern.sdk.saveEditorDocument(
                    s,
                    kern.sdk.yrsToDocument(s, doc),
                    [],
                  ),
                );
          if (route === "sessie") proefbestand(soort, bytes);
          expect(new Pakket(bytes).lees("word/document.xml")).toContain(
            "wordprocessingGroup",
          );
          const terug = await createYrsSession();
          try {
            terug.openDocx(bytes, true);
            const plek = vormenLijst(terug)[0];
            expect(plek.vorm.children).toHaveLength(aantal);
            const child = plek.vorm.children!.findIndex(
              (c) => c.shapeType === "roundRect",
            );
            const gewijzigd = {
              ...plek.vorm,
              children: plek.vorm.children!.map((c, i) =>
                i === child
                  ? vormUitOpties(
                      { ...optiesVanVorm(c), tekst: "Eigen onderdeel" },
                      c,
                    )
                  : c,
              ),
            };
            wijzigVormInSessie(terug, plek, gewijzigd);
            const nogmaals = (await saveYrsDocx(terug)).bytes;
            expect(new Pakket(nogmaals).lees("word/document.xml")).toContain(
              "Eigen onderdeel",
            );
          } finally {
            terug.destroy();
          }
        }
      } finally {
        s.destroy();
      }
    },
  );
  it("schaalt alle groepsonderdelen en behoudt de tekst, kleuren en onderlinge afstanden", async () => {
    const s = await sessie();
    try {
      const loc = {
        story: "body",
        paraId: s.paragraphs("body")[0].paraId,
        offset: 0,
      };
      voegVormInSessie(
        s,
        loc,
        vormUitOpties({ ...STANDAARD_VORM, breedte: 2, hoogte: 1, tekst: "A" }),
      );
      voegVormInSessie(
        s,
        { ...loc, offset: 1 },
        vormUitOpties({ ...STANDAARD_VORM, breedte: 3, hoogte: 2, tekst: "B" }),
      );
      groepeerVormen(s, vormenLijst(s));
      const plek = vormenLijst(s)[0],
        v = vormUitOpties(
          { ...optiesVanVorm(plek.vorm), breedte: 10, hoogte: 6 },
          plek.vorm,
        );
      wijzigVormInSessie(s, plek, v);
      expect(
        v.children!.map((c) => [c.size.width, c.size.height, c.offset?.x]),
      ).toEqual([
        [1440000, 1080000, 0],
        [2160000, 2160000, 1440000],
      ]);
      expect(optiesVanVorm(v.children![1]).tekst).toBe("B");
      const bytes = (await saveYrsDocx(s)).bytes,
        terug = await createYrsSession();
      try {
        terug.openDocx(bytes, true);
        expect(vormenLijst(terug)[0].vorm.children!.map((c) => c.size)).toEqual(
          v.children!.map((c) => c.size),
        );
      } finally {
        terug.destroy();
      }
    } finally {
      s.destroy();
    }
  });
  it("groepeert zwevende vormen en behoudt hun gemeten plaats bij ontgroeperen", async () => {
    const s = await sessie();
    try {
      const loc = {
        story: "body",
        paraId: s.paragraphs("body")[0].paraId,
        offset: 0,
      };
      for (const [offset, links, boven] of [
        [0, 1, 2],
        [1, 6, 4],
      ])
        voegVormInSessie(
          s,
          { ...loc, offset },
          vormUitOpties({
            ...STANDAARD_VORM,
            breedte: 2,
            hoogte: 1,
            terugloop: "square",
            links,
            boven,
          }),
        );
      const lijst = vormenLijst(s),
        kaders = new Map(
          lijst.map((v, i) => [
            v.sleutel,
            {
              x: [1, 6][i] * 360000,
              y: [2, 4][i] * 360000,
              breedte: 720000,
              hoogte: 360000,
              pagina: 0,
            },
          ]),
        );
      groepeerVormen(s, lijst, kaders);
      const plek = vormenLijst(s)[0];
      expect(plek.vorm.size).toEqual({ width: 2520000, height: 1080000 });
      hefGroepOp(s, plek, {
        x: 360000,
        y: 720000,
        breedte: 2520000,
        hoogte: 1080000,
        pagina: 0,
      });
      expect(
        vormenLijst(s).map((v) => [
          v.vorm.position?.horizontal.posOffset,
          v.vorm.position?.vertical.posOffset,
        ]),
      ).toEqual([
        [360000, 720000],
        [2160000, 1440000],
      ]);
      const bytes = (await saveYrsDocx(s)).bytes;
      expect(new Pakket(bytes).lees("word/document.xml")).toContain(
        "wp:anchor",
      );
    } finally {
      s.destroy();
    }
  });
  it("brengt een vorm naar voor/achter met behoud van nog bewerkte tekst", async () => {
    const s = await sessie();
    try {
      const loc = {
        story: "body",
        paraId: s.paragraphs("body")[0].paraId,
        offset: 0,
      };
      for (let i = 0; i < 2; i++)
        voegVormInSessie(
          s,
          { ...loc, offset: i },
          vormUitOpties({
            ...STANDAARD_VORM,
            terugloop: "square",
            tekst: String(i),
          }),
        );
      let plek = vormenLijst(s)[0];
      zetVormLaag(
        s,
        plek,
        true,
        vormUitOpties(
          { ...optiesVanVorm(plek.vorm), tekst: "Bewerkt" },
          plek.vorm,
        ),
      );
      expect(vormenLijst(s)[0].vorm.relativeHeight).toBe(1);
      plek = vormenLijst(s)[0];
      zetVormLaag(s, plek, false);
      const lijst = vormenLijst(s);
      expect(lijst.map((v) => v.vorm.relativeHeight)).toEqual([0, 1]);
      expect(optiesVanVorm(lijst[0].vorm).tekst).toBe("Bewerkt");
    } finally {
      s.destroy();
    }
  });
  it("behoudt oorspronkelijke gemengde DrawingML-groepen en afbeeldingsbytes bij beide opslagroutes", async () => {
    const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
    const drawing =
      '<w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><wp:inline><wp:extent cx="720000" cy="360000"/><wp:docPr id="77" name="Mixed original"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="720000" cy="360000"/><a:chOff x="0" y="0"/><a:chExt cx="720000" cy="360000"/></a:xfrm></wpg:grpSpPr><pic:pic><pic:nvPicPr><pic:cNvPr id="78" name="Original picture"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rGroupPicture"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="720000" cy="360000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing>';
    p.schrijf(
      "word/document.xml",
      p
        .lees("word/document.xml")
        .replace(
          "<w:body>",
          "<w:body><w:p><w:r>" +
            drawing +
            "</w:r></w:p><w:p><w:r><w:t>Edit me.</w:t></w:r></w:p>",
        ),
    );
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVR4nGN8pmvzn4ECwESJ5lEDIICJgULANGoAw2gYMFAeBgCchwJuF6mX+QAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    p.schrijf("word/media/group.png", png);
    p.schrijf(
      "word/_rels/document.xml.rels",
      p
        .lees("word/_rels/document.xml.rels")
        .replace(
          "</Relationships>",
          '<Relationship Id="rGroupPicture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/group.png"/></Relationships>',
        ),
    );
    p.schrijf(
      "[Content_Types].xml",
      p
        .lees("[Content_Types].xml")
        .replace(
          "</Types>",
          '<Default Extension="png" ContentType="image/png"/></Types>',
        ),
    );
    const source = p.inpakken();
    if (process.env.OOS_VORMEN_EXTRA_UITVOER) {
      mkdirSync(process.env.OOS_VORMEN_EXTRA_UITVOER, { recursive: true });
      writeFileSync(
        join(process.env.OOS_VORMEN_EXTRA_UITVOER, "mixed-picture.docx"),
        source,
      );
    }
    for (const route of ["sessie", "editor"]) {
      const s = await createYrsSession();
      try {
        s.openDocx(source, true);
        const [vorm] = vormenLijst(s);
        expect(vorm).toBeDefined();
        expect(vormBewerkbaar(vorm.vorm)).toBe(false);
        const versie = s.version();
        expect(() =>
          wijzigVormInSessie(s, vorm, { ...vorm.vorm, name: "Unsafe edit" }),
        ).toThrow();
        expect(s.version()).toBe(versie);
        const para = s
          .paragraphs("body")
          .find((p) => p.text.includes("Edit me"))!;
        s.insertText(
          { story: "body", paraId: para.paraId, offset: 0 },
          "Changed. ",
        );
        const doc = await kern.docx.parseDocx(source, { preloadFonts: false });
        const bytes =
          route === "sessie"
            ? (await saveYrsDocx(s)).bytes
            : new Uint8Array(
                await kern.sdk.saveEditorDocument(
                  s,
                  kern.sdk.yrsToDocument(s, doc),
                  [],
                ),
              );
        const uit = new Pakket(bytes);
        expect(uit.lees("word/document.xml")).toContain("<pic:pic>");
        expect(uit.lees("word/document.xml")).toContain("Changed.");
        expect(uit.bytes("word/media/group.png")).toEqual(png);
        expect(uit.lees("word/_rels/document.xml.rels")).toContain(
          "rGroupPicture",
        );
        const terug = await createYrsSession();
        try {
          terug.openDocx(bytes, true);
          expect(vormenLijst(terug)[0].vorm.scene).toBeDefined();
        } finally {
          terug.destroy();
        }
      } finally {
        s.destroy();
      }
    }
  });
  it("leest het echte getekende groepskader ook zonder tekstbereik-rechthoek", async () => {
    const s = await sessie();
    try {
      voegVormInSessie(
        s,
        { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 },
        maakSchema("proces"),
      );
      const font = s.registerFont(
        readFileSync(
          "node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf",
        ),
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
      const layout = s.layoutDocumentWithRegionsJson(
        JSON.stringify({
          ...vraag,
          measurement: {
            fontChains: Object.fromEntries(nodig.map((f) => [f.key, [font]])),
            defaults: { fontFamily: "Caladea", fontSize: 11 },
            authoritativeShaping: true,
          },
        }),
      );
      const display = JSON.parse(s.buildDisplayListJson(layout)) as DisplayList;
      const projectie = kern.sdk.createYrsInputPositionMap(
        "body",
        s.paragraphSpans("body"),
      );
      const ed = {
        displayPositionToYrsLoc: (p: number | { position: number }) =>
          kern.sdk.displayPositionToYrsLoc(
            projectie,
            typeof p === "number" ? p : p.position,
          ),
      };
      const keuze = vormenLijst(s),
        g = {
          layout: { version: s.version() },
          dom: { queries: { displayList: display, isReady: () => true } },
          getPageRect: () => ({ built: true }),
        } as unknown as DocxPluginGeometry;
      const kader = getekendeVormKaders(g, ed, keuze, s.version())!.get(
        keuze[0].sleutel,
      )!;
      expect(Math.abs(kader.breedte - 4320000)).toBeLessThan(10);
      expect(Math.abs(kader.hoogte - 540000)).toBeLessThan(10);
      expect(kader.pagina).toBe(0);
      expect(getekendeVormKaders(g, ed, keuze, "stale")).toBeNull();
      const dubbel = {
        ...display,
        pages: display.pages.map((p) => ({
          ...p,
          primitives: [...p.primitives, ...p.primitives],
        })),
      };
      expect(
        vormKadersUitLijst(dubbel, keuze, ed.displayPositionToYrsLoc),
      ).toBeNull();
      hefGroepOp(s, keuze[0], kader);
      expect(vormenLijst(s)).toHaveLength(5);
      expect(
        vormenLijst(s).every(
          (v) => v.vorm.position?.horizontal.relativeTo === "page",
        ),
      ).toBe(true);
    } finally {
      s.destroy();
    }
  });

  it("bewaart oorspronkelijke tekstgeometrie en effecten van een geïmporteerd groepsonderdeel", async () => {
    const s = await sessie();
    let source: Uint8Array;
    try {
      voegVormInSessie(
        s,
        { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 },
        maakSchema("proces"),
      );
      source = (await saveYrsDocx(s)).bytes;
    } finally {
      s.destroy();
    }
    const p = new Pakket(source!);
    p.schrijf(
      "word/document.xml",
      p
        .lees("word/document.xml")
        .replace(
          '<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>',
          '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="123" t="456" r="90000" b="60000"/><a:pathLst><a:path w="100000" h="100000"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100000" y="0"/></a:lnTo><a:lnTo><a:pt x="100000" y="100000"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>',
        ),
    );
    const terug = await createYrsSession();
    try {
      terug.openDocx(p.inpakken(), true);
      const plek = vormenLijst(terug)[0];
      expect(plek.vorm.children![0].geometryPath?.length).toBeGreaterThan(0);
      wijzigVormInSessie(terug, plek, {
        ...plek.vorm,
        children: plek.vorm.children!.map((v, i) =>
          i === 0
            ? vormUitOpties({ ...optiesVanVorm(v), tekst: "Custom text" }, v)
            : v,
        ),
      });
      const xml = new Pakket((await saveYrsDocx(terug)).bytes).lees(
        "word/document.xml",
      );
      expect(xml).toContain('l="123" t="456" r="90000" b="60000"');
      expect(xml).toContain("Custom text");
    } finally {
      terug.destroy();
    }
  });

  it("bewaart en bewerkt een groep in een koptekst via beide native opslagroutes", async () => {
    const s = await sessie();
    let drawing: string;
    try {
      voegVormInSessie(
        s,
        { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 },
        maakSchema("proces"),
      );
      drawing = new Pakket((await saveYrsDocx(s)).bytes)
        .lees("word/document.xml")
        .match(/<w:drawing\b[\s\S]*?<\/w:drawing>/)![0];
    } finally {
      s.destroy();
    }
    const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
    p.schrijf(
      "word/headerShapes.xml",
      '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><w:p><w:r>' +
        drawing! +
        "</w:r></w:p></w:hdr>",
    );
    p.schrijf(
      "word/document.xml",
      p
        .lees("word/document.xml")
        .replace(
          /<w:sectPr\b[^>]*>/,
          (m) =>
            m + '<w:headerReference w:type="default" r:id="rShapesHeader"/>',
        ),
    );
    p.schrijf(
      "word/_rels/document.xml.rels",
      p
        .lees("word/_rels/document.xml.rels")
        .replace(
          "</Relationships>",
          '<Relationship Id="rShapesHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="headerShapes.xml"/></Relationships>',
        ),
    );
    p.schrijf(
      "[Content_Types].xml",
      p
        .lees("[Content_Types].xml")
        .replace(
          "</Types>",
          '<Override PartName="/word/headerShapes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
        ),
    );
    const source = p.inpakken();
    for (const route of ["sessie", "editor"]) {
      const e = await createYrsSession();
      try {
        e.openDocx(source, true);
        e.setUndoCaptureMode("manual");
        const plek = vormenLijst(e).find((v) => v.story !== "body")!;
        expect(plek).toBeDefined();
        e.addUndoBoundary();
        wijzigVormInSessie(e, plek, {
          ...plek.vorm,
          children: plek.vorm.children!.map((c, i) =>
            i === 0
              ? vormUitOpties(
                  { ...optiesVanVorm(c), tekst: "Header edited" },
                  c,
                )
              : c,
          ),
        });
        e.addUndoBoundary();
        const doc = await kern.docx.parseDocx(source, { preloadFonts: false });
        const bytes =
          route === "sessie"
            ? (await saveYrsDocx(e)).bytes
            : new Uint8Array(
                await kern.sdk.saveEditorDocument(
                  e,
                  kern.sdk.yrsToDocument(e, doc),
                  [],
                ),
              );
        expect(new Pakket(bytes).lees("word/headerShapes.xml")).toContain(
          "Header edited",
        );
        const again = await createYrsSession();
        try {
          again.openDocx(bytes, true);
          const v = vormenLijst(again).find((v) => v.story !== "body")!;
          expect(v.vorm.children).toHaveLength(5);
          expect(optiesVanVorm(v.vorm.children![0]).tekst).toBe(
            "Header edited",
          );
        } finally {
          again.destroy();
        }
        expect(e.undo()).toBe(true);
        expect(
          optiesVanVorm(
            vormenLijst(e).find((v) => v.story !== "body")!.vorm.children![0],
          ).tekst,
        ).toBe("Start");
      } finally {
        e.destroy();
      }
    }
  });
  it("behoudt presetcurven wanneer binnen- en buitenkader verschillend zijn afgerond", async () => {
    const s = await sessie();
    let bron: Uint8Array;
    try {
      voegVormInSessie(
        s,
        { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 },
        vormUitOpties({
          ...STANDAARD_VORM,
          soort: "rightArrow",
          breedte: 6,
          tekst: "Original",
        }),
      );
      bron = (await saveYrsDocx(s)).bytes;
    } finally {
      s.destroy();
    }
    const p = new Pakket(bron!);
    p.schrijf(
      "word/document.xml",
      p
        .lees("word/document.xml")
        .replace(
          /<wp:extent\b[^>]*\/>/,
          '<wp:extent cx="2160270" cy="899795"/>',
        )
        .replace(/<a:ext\b[^>]*\/>/, '<a:ext cx="2160360" cy="899640"/>')
        .replace(
          /<a:prstGeom\b[^>]*>[\s\S]*?<\/a:prstGeom>/,
          '<a:prstGeom prst="rightArrow"><a:avLst><a:gd name="adj1" fmla="val 50000"/><a:gd name="adj2" fmla="val 50000"/></a:avLst></a:prstGeom>',
        ),
    );
    let bytes = p.inpakken(),
      verwacht: unknown;
    for (let ronde = 0; ronde < 3; ronde++) {
      const e = await createYrsSession();
      try {
        e.openDocx(bytes, true);
        const plek = vormenLijst(e)[0];
        expect(plek.vorm.geometryPath).toHaveLength(8);
        if (ronde === 0) {
          verwacht = plek.vorm.geometryPath;
          wijzigVormInSessie(
            e,
            plek,
            vormUitOpties(
              {
                ...optiesVanVorm(plek.vorm),
                tekst: "Edited without geometry loss",
              },
              plek.vorm,
            ),
          );
        } else expect(plek.vorm.geometryPath).toEqual(verwacht);
        if (ronde < 2) bytes = (await saveYrsDocx(e)).bytes;
      } finally {
        e.destroy();
      }
    }
    expect(new Pakket(bytes).lees("word/document.xml")).toContain(
      '<a:ext cx="2160360" cy="899640"/>',
    );
  });

  it("bewaart geneste groepen met unieke ids en schaalt hun actuele onderdelen", async () => {
    const s = await sessie();
    let bytes: Uint8Array;
    try {
      voegVormInSessie(
        s,
        { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 },
        {
          type: "shape",
          shapeType: "rect",
          name: "Nested",
          size: { width: 4320000, height: 1620000 },
          fill: { type: "none" },
          outline: { width: 0 },
          children: [
            { ...maakSchema("proces"), offset: { x: 0, y: 0 } },
            { ...maakSchema("proces"), offset: { x: 0, y: 1080000 } },
          ],
        },
      );
      bytes = (await saveYrsDocx(s)).bytes;
    } finally {
      s.destroy();
    }
    const e = await createYrsSession();
    try {
      e.openDocx(bytes!, true);
      const plek = vormenLijst(e)[0];
      expect(plek.vorm.children).toHaveLength(2);
      expect(plek.vorm.children![1].children).toHaveLength(5);
      const v = vormUitOpties(
        { ...optiesVanVorm(plek.vorm), breedte: 6, hoogte: 2.25 },
        plek.vorm,
      );
      expect(v.children![1].offset?.y).toBe(540000);
      expect(v.children![1].scene).toBeUndefined();
      wijzigVormInSessie(e, plek, v);
      bytes = (await saveYrsDocx(e)).bytes;
    } finally {
      e.destroy();
    }
    const r = await createYrsSession();
    try {
      r.openDocx(bytes!, true);
      const v = vormenLijst(r)[0].vorm;
      const ids: string[] = [];
      const lees = (c: typeof v) => {
        expect(c.id).toBeTruthy();
        ids.push(c.id!);
        c.children?.forEach(lees);
      };
      lees(v);
      expect(new Set(ids).size).toBe(ids.length);
      expect(v.children![1].offset?.y).toBe(540000);
      expect(optiesVanVorm(v.children![1].children![0]).tekst).toBe("Start");
    } finally {
      r.destroy();
    }
  });

  it("geeft geïmporteerde groepslijnen zonder id unieke ids bij opslaan", async () => {
    const s = await sessie();
    let bytes: Uint8Array;
    try {
      voegVormInSessie(
        s,
        { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 },
        maakSchema("organisatie"),
      );
      bytes = (await saveYrsDocx(s)).bytes;
    } finally {
      s.destroy();
    }
    const p = new Pakket(bytes!);
    p.schrijf(
      "word/document.xml",
      p
        .lees("word/document.xml")
        .replace(/<wps:wsp\b[\s\S]*?<\/wps:wsp>/g, (m) =>
          m.includes('prst="line"') ? m.replace(/<wps:cNvPr\b[^>]*\/>/, "") : m,
        ),
    );
    const e = await createYrsSession();
    try {
      e.openDocx(p.inpakken(), true);
      expect(
        vormenLijst(e)[0]
          .vorm.children!.slice(0, 4)
          .every((c) => !c.id),
      ).toBe(true);
      bytes = (await saveYrsDocx(e)).bytes;
    } finally {
      e.destroy();
    }
    const r = await createYrsSession();
    try {
      r.openDocx(bytes!, true);
      const v = vormenLijst(r)[0].vorm;
      const ids = [v.id, ...v.children!.map((c) => c.id)];
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      r.destroy();
    }
  });
});
