import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  kind,
  leesXml,
  zoekAlle,
  vervang,
  elementen,
} from "../grafieken/xml";
import {
  legeNotities,
  notitieTekst,
  vervangNotitieTekst,
  formatteerNotities,
  formatteerAlineas,
  notitieStap,
  valideerNotities,
  type NotitieDocument,
} from "./notitiesModel";
import {
  leesRijkeNotities,
  schrijfRijkeNotities,
  notitieDiaPaden,
  NotitieFout,
} from "./notitiesPakket";
import {
  RijkeNotitieSessie,
  metRijkeNotities,
  rijkeNotitieSessie,
} from "./notitiesSessie";
beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
const handles: PresentationHandle[] = [];
afterEach(() => {
  handles.splice(0).forEach((h) => h.dispose());
  vi.restoreAllMocks();
});
const open = (b: Uint8Array) => {
  const h = openPresentation(b);
  handles.push(h);
  return h;
};
const book = () => new Uint8Array(readFileSync("public/templates/nieuw.pptx"));
const doc = (text: string) => vervangNotitieTekst(legeNotities(), 0, 0, text);
const read = (b: Uint8Array, i = 0) => {
  const p = new Pakket(b);
  return leesRijkeNotities(p, notitieDiaPaden(p)[i]);
};
const notePart = (b: Uint8Array) => {
  const p = new Pakket(b),
    slide = notitieDiaPaden(p)[0],
    r = p.relaties(slide).find((r) => r.type.endsWith("/notesSlide"))!;
  return { p, path: p.doel(slide, r.id)! };
};
function baseline() {
  const h = open(book());
  h.setSlideNotes(h.snapshot().slides[0].id, "Bold text\nSecond paragraph");
  return h.save();
}
function addMetadata(bytes: Uint8Array) {
  const { p, path } = notePart(bytes);
  p.schrijf(
    path,
    p
      .lees(path)
      .replace(
        "<a:r>",
        '<a:r><a:rPr b="1" i="1" sz="1800"><a:solidFill><a:srgbClr val="AA1122"/></a:solidFill><a:latin typeface="Arial"/><a:extLst><a:ext uri="keep"><x:data xmlns:x="urn:preserve" value="exact"/></a:ext></a:extLst></a:rPr>',
      )
      .replace(
        "</p:spTree>",
        '<p:sp><p:nvSpPr><p:cNvPr id="9" name="Footer"/><p:cNvSpPr/><p:nvPr><p:ph type="ftr"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Private footer</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>',
      ),
  );
  return p.inpakken();
}
describe("rijke notitiemodellen", () => {
  it("keeps Unicode text and styles around a minimal edit", () => {
    let d = doc("A🧱B\nZ");
    d = formatteerNotities(d, 1, 3, { bold: true, color: "#FF0000" });
    d = vervangNotitieTekst(d, 3, 4, "C");
    expect(notitieTekst(d)).toBe("A🧱C\nZ");
    expect(
      d.paragraphs[0].runs.find((r) => r.text === "🧱")?.style,
    ).toMatchObject({ bold: true, color: "#FF0000" });
    expect(notitieStap("A🧱C", 3, -1)).toBe(1);
    expect(notitieStap("A🧱C", 1, 1)).toBe(3);
  });
  it("splits and joins paragraphs while retaining surrounding formatting", () => {
    let d = formatteerNotities(doc("FirstSecond"), 0, 11, {
      italic: true,
      size: 20,
    });
    d = vervangNotitieTekst(d, 5, 5, "\n");
    expect(d.paragraphs).toHaveLength(2);
    expect(notitieTekst(d)).toBe("First\nSecond");
    d = vervangNotitieTekst(d, 5, 6, "");
    expect(notitieTekst(d)).toBe("FirstSecond");
    expect(d.paragraphs[0].runs.every((r) => r.style.italic)).toBe(true);
  });
  it("formats selected paragraphs without changing their words", () => {
    let d = doc("One\nTwo\nThree");
    d = formatteerAlineas(d, 0, 7, { list: "number", align: "right" });
    expect(d.paragraphs.map((p) => p.list)).toEqual([
      "number",
      "number",
      "none",
    ]);
    expect(notitieTekst(d)).toBe("One\nTwo\nThree");
  });
  it("keeps fields atomic during text edits and formatting", () => {
    const d = doc("123");
    d.paragraphs[0].runs[0].field = true;
    expect(() => vervangNotitieTekst(d, 1, 2, "x")).toThrow("field");
    expect(() => formatteerNotities(d, 1, 2, { bold: true })).toThrow("field");
    expect(notitieTekst(vervangNotitieTekst(d, 0, 3, "New"))).toBe("New");
  });
  it("rejects invalid style data and bounded oversized notes", () => {
    const d = doc("x");
    d.paragraphs[0].runs[0].style.color = "url(https://example.invalid/)";
    expect(() => valideerNotities(d)).toThrow("invalid");
    expect(() => doc("x".repeat(200001))).toThrow("tooLarge");
    expect(() => doc("\u0000")).toThrow("invalid");
  });
});
describe("rijke PPTX-notities", () => {
  it("creates standard editable notes in a presentation without a notes part", () => {
    let d = doc("Speaker 🧱\nSecond");
    d = formatteerNotities(d, 0, 7, {
      bold: true,
      italic: true,
      underline: true,
      size: 24,
      color: "#123456",
      font: "Arial",
    });
    d = formatteerAlineas(d, 0, 7, { list: "bullet", align: "center" });
    const bytes = schrijfRijkeNotities(book(), new Map([[0, d]])),
      h = open(bytes),
      saved = h.save(),
      again = read(saved);
    expect(h.snapshot().slides[0].notes).toBe("Speaker 🧱\nSecond");
    expect(again.paragraphs[0]).toMatchObject({
      align: "center",
      list: "bullet",
    });
    expect(again.paragraphs[0].runs[0].style).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
      size: 24,
      color: "#123456",
      font: "Arial",
    });
    expect(open(saved).snapshot().slides[0].notes).toBe(
      h.snapshot().slides[0].notes,
    );
  });
  it("leaves untouched note parts byte-for-byte unchanged", () => {
    const b = addMetadata(baseline()),
      before = notePart(b),
      saved = schrijfRijkeNotities(b, new Map());
    expect(saved).toBe(b);
    expect(notePart(saved).p.bytes(before.path)).toEqual(
      before.p.bytes(before.path),
    );
  });
  it("retains inherited source formatting, unknown XML and non-body placeholders", () => {
    const b = addMetadata(baseline()),
      d = read(b);
    expect(d.paragraphs[0].runs[0].style).toMatchObject({
      bold: true,
      italic: true,
      size: 18,
      color: "#AA1122",
    });
    const changed = vervangNotitieTekst(d, 9, 9, " added"),
      result = schrijfRijkeNotities(b, new Map([[0, changed]])),
      { p, path } = notePart(result),
      xml = p.lees(path);
    expect(xml).toContain('<x:data xmlns:x="urn:preserve" value="exact"/>');
    expect(xml).toContain("Private footer");
    expect(xml).toContain('name="Footer"');
    expect(notitieTekst(read(open(result).save()))).toBe(
      "Bold text added\nSecond paragraph",
    );
  });
  it("retains fields, hyperlinks, and soft line breaks when another run is formatted", () => {
    const b = baseline(),
      { p, path } = notePart(b),
      xml = p.lees(path),
      r = zoekAlle(leesXml(xml), "r")[0],
      field =
        '<a:fld id="{11111111-2222-3333-4444-555555555555}" type="slidenum"><a:rPr b="1"/><a:t>7</a:t></a:fld><a:br/>';
    p.schrijf(
      path,
      vervang(xml, [
        { start: r.start, eind: r.start, tekst: field },
        {
          start: r.inhoudStart,
          eind: r.inhoudStart,
          tekst:
            '<a:rPr><a:hlinkClick xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="richLink"/></a:rPr>',
        },
      ]),
    );
    const relsPath = Pakket.relsPad(path),
      rels = p.lees(relsPath),
      relRoot = leesXml(rels);
    p.schrijf(
      relsPath,
      vervang(rels, [
        {
          start: relRoot.inhoudEind,
          eind: relRoot.inhoudEind,
          tekst:
            '<Relationship Id="richLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/notes" TargetMode="External"/>',
        },
      ]),
    );
    const input = p.inpakken(),
      d = read(input),
      changed = formatteerNotities(d, 2, 6, { italic: true }),
      result = schrijfRijkeNotities(input, new Map([[0, changed]])),
      out = notePart(result);
    expect(out.p.lees(out.path)).toContain(
      'id="{11111111-2222-3333-4444-555555555555}"',
    );
    expect(out.p.lees(out.path)).toContain('type="slidenum"');
    expect(out.p.lees(out.path)).toContain('r:id="richLink"');
    expect(out.p.bytes(relsPath)).toEqual(p.bytes(relsPath));
    expect(notitieTekst(read(result))).toContain("7\u2028Bold text");
  });
  it("materializes paragraph-inherited text styles when Enter creates a new paragraph", () => {
    const b = baseline(),
      { p, path } = notePart(b);
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(
          '<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
          '<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:pPr><a:defRPr sz="3000" b="1"/></a:pPr>',
        ),
    );
    const d = read(p.inpakken()),
      changed = vervangNotitieTekst(d, 4, 4, "\n"),
      result = read(
        open(
          schrijfRijkeNotities(p.inpakken(), new Map([[0, changed]])),
        ).save(),
      );
    expect(result.paragraphs[1].runs[0].style).toMatchObject({
      size: 30,
      bold: true,
    });
  });
  it("writes newly inserted soft line breaks as DrawingML breaks with surrounding formatting", () => {
    const b = baseline(),
      d = read(b),
      changed = vervangNotitieTekst(d, 4, 4, "\u2028", {
        bold: true,
        size: 20,
      }),
      saved = schrijfRijkeNotities(b, new Map([[0, changed]])),
      out = notePart(saved);
    expect(out.p.lees(out.path)).toContain("<a:br");
    expect(notitieTekst(read(open(saved).save()))).toBe(
      "Bold\u2028 text\nSecond paragraph",
    );
  });
  it("preserves every unrelated package part and resolves all internal relationships", () => {
    const b = baseline(),
      before = notePart(b),
      result = schrijfRijkeNotities(
        b,
        new Map([[0, formatteerNotities(read(b), 0, 4, { bold: true })]]),
      ),
      after = new Pakket(result);
    for (const name of before.p.namen().filter((n) => n !== before.path))
      expect(after.bytes(name)).toEqual(before.p.bytes(name));
    for (const name of after.namen().filter((n) => !n.endsWith(".rels")))
      for (const r of after.relaties(name).filter((r) => !r.extern))
        expect(
          after.heeft(Pakket.doelPad(name, r.target)),
          `${name} → ${r.target}`,
        ).toBe(true);
  });
  it("refuses multiple notes bodies without touching source XML", () => {
    const b = baseline(),
      { p, path } = notePart(b),
      xml = p.lees(path),
      body = zoekAlle(leesXml(xml), "sp")[0];
    p.schrijf(
      path,
      xml.replace(
        "</p:spTree>",
        xml.slice(body.start, body.eind) + "</p:spTree>",
      ),
    );
    const input = p.inpakken();
    expect(() => read(input)).toThrow(NotitieFout);
    expect(() =>
      schrijfRijkeNotities(input, new Map([[0, doc("New")]])),
    ).toThrow(NotitieFout);
    expect(new Pakket(input).lees(path)).toBe(p.lees(path));
  });
});
describe("documentgebonden notitieconcepten", () => {
  it("keeps native slides and unchanged saves available when the rich-notes package reader refuses input", () => {
    const h = open(baseline()),
      s = new RijkeNotitieSessie(h, new Uint8Array([0]), () => {}),
      n = s.lees(0),
      bytes = h.save();
    expect(n.error?.code).toBe("unsupported");
    expect(s.huidig(n.id).plain).toBe("Bold text\nSecond paragraph");
    expect(s.serialiseer(bytes)).toBe(bytes);
    expect(h.snapshot().slides).toHaveLength(1);
  });
  it("saves drafts and exposes their plain text through the public facade", () => {
    const b = baseline(),
      h = open(b),
      api = {
        handle: h,
        save: () => h.save(),
        commands: { getState: () => ({ enabled: true }) },
      } as unknown as PptxEditorApi,
      dirty = vi.fn(),
      facade = metRijkeNotities(api, b, dirty),
      s = rijkeNotitieSessie(facade)!,
      state = s.lees(0);
    s.schrijf(
      state.id,
      formatteerNotities(vervangNotitieTekst(state.doc, 0, 4, "Rich"), 0, 4, {
        bold: true,
      }),
    );
    expect(facade.handle.snapshot().slides[0].notes).toBe(
      "Rich text\nSecond paragraph",
    );
    expect(h.snapshot().slides[0].notes).toBe("Bold text\nSecond paragraph");
    expect(read(facade.save()).paragraphs[0].runs[0].style.bold).toBe(true);
    expect(read(facade.handle.save()).paragraphs[0].runs[0].style.bold).toBe(
      true,
    );
    expect(dirty).toHaveBeenCalled();
  });
  it("does not save or snapshot the presentation during typing, formatting or notes undo/redo", () => {
    const b = baseline(),
      h = open(b),
      save = vi.spyOn(h, "save"),
      snapshot = vi.spyOn(h, "snapshot"),
      s = new RijkeNotitieSessie(h, b, () => {}),
      state = s.lees(0);
    save.mockClear();
    snapshot.mockClear();
    let d = state.doc;
    for (let i = 0; i < 20; i++) {
      d = vervangNotitieTekst(d, 0, 0, "x");
      s.schrijf(state.id, d, "typing");
      s.huidig(state.id);
    }
    s.schrijf(state.id, formatteerNotities(d, 0, 2, { bold: true }));
    s.undo(state.id);
    s.redo(state.id);
    expect(save).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });
  it("restores text and formatting independently of the native slide history", () => {
    const b = baseline(),
      h = open(b),
      s = new RijkeNotitieSessie(h, b, () => {}),
      x = s.lees(0);
    s.schrijf(x.id, formatteerNotities(x.doc, 0, 4, { bold: true }));
    s.undo(x.id);
    expect(s.huidig(x.id).doc).toEqual(x.doc);
    expect(s.huidig(x.id).changed).toBe(false);
    s.redo(x.id);
    expect(s.huidig(x.id).doc.paragraphs[0].runs[0].style.bold).toBe(true);
    expect(h.snapshot().slides[0].notes).toBe("Bold text\nSecond paragraph");
  });
  it("keeps slide drafts independent through navigation and native reordering", () => {
    const h = open(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx")),
      b = h.save(),
      s = new RijkeNotitieSessie(h, b, () => {}),
      a = s.lees(0),
      second = s.lees(1);
    s.schrijf(a.id, doc("First rich"));
    s.schrijf(second.id, doc("Second rich"));
    h.moveSlide(h.snapshot().slides[0].id, 2);
    const saved = s.serialiseer(h.save()),
      again = open(saved).snapshot();
    expect(again.slides[0].notes).toBe("Second rich");
    expect(again.slides[2].notes).toBe("First rich");
  });
  it("rejects a concurrent native notes change and can explicitly discard the draft", () => {
    const b = baseline(),
      h = open(b),
      s = new RijkeNotitieSessie(h, b, () => {}),
      state = s.lees(0);
    s.schrijf(state.id, doc("Local draft"));
    h.setSlideNotes(h.snapshot().slides[0].id, "Incoming notes");
    expect(() => s.serialiseer(h.save())).toThrow(NotitieFout);
    expect(notitieTekst(s.huidig(state.id).doc)).toBe("Local draft");
    s.reset(0);
    expect(notitieTekst(s.lees(0).doc)).toBe("Incoming notes");
  });
  it("refuses read-only draft mutations while keeping existing changes saveable", () => {
    const b = baseline(),
      h = open(b),
      s = new RijkeNotitieSessie(
        h,
        b,
        () => {},
        () => false,
      ),
      state = s.lees(0);
    expect(() => s.schrijf(state.id, doc("No"))).toThrow(NotitieFout);
    s.undo(state.id);
    s.redo(state.id);
    expect(s.huidig(state.id).changed).toBe(false);
  });
});
