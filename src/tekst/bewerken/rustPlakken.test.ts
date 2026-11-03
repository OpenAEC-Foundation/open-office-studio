import { readFileSync } from "node:fs";
import { Buffer } from "buffer";
import { describe, expect, it, vi } from "vitest";
import { applyClipboardFragment, createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import { handelOpenAecPlakAf } from "../../../node_modules/@betteroffice/docx-react/dist/openaec-plakken.mjs";
import { maakRustPlakKoppeling, type RustPlakAanvraag, type RustPlakAntwoord } from "./rustPlakken";
import { registreerPlakAfronding, neemPlakAfronding } from "./plakAfronding";
import { maakPlaksessie, pasPlakOpmaakToe } from "./plakopmaak";

const bytes = new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"));
const fragment = { paragraphs: [{ text: "Nieuw 😀" }, { text: "Daarna" }] };
function uitgesteld<T>() {
  let resolve!: (waarde: T) => void, reject!: (fout: unknown) => void;
  const promise = new Promise<T>((ja, nee) => { resolve = ja; reject = nee; });
  return { promise, resolve, reject };
}
async function bron() {
  const s = await createYrsSession({ clientId: 71 }); s.openDocx(bytes, true); s.beginUndoCapture();
  s.setUndoCaptureMode("manual");
  const p = s.paragraphs("body")[0], punt = { paraId: p.paraId, offset: 7 };
  s.setSelection({ story: "body", ...punt }); s.addUndoBoundary();
  const bereik = { story: "body", start: punt, end: punt };
  return { s, p, bereik, voor: stand(s) };
}
function stand(s: YrsSession) { return Object.fromEntries(s.storyIds().sort().map(story => [story, s.storySegments(story)])); }
/** Onafhankelijke SDK-referentie voor de transportdubbel; de echte Rust-code heeft eigen protocol-/DOCX-proeven. */
async function antwoord(r: RustPlakAanvraag): Promise<RustPlakAntwoord> {
  const kopie = await createYrsSession({ clientId: r.clientId });
  try {
    kopie.applyUpdate(Buffer.from(r.snapshot, "base64"));
    const caret = applyClipboardFragment(kopie, r.range, r.fragment, r.author);
    return { schema: 1, requestId: r.requestId, documentId: r.documentId, sourceVersion: r.sourceVersion,
      snapshotSha256: r.snapshotSha256, clientId: r.clientId,
      delta: Buffer.from(kopie.encodeStateAsUpdate()).toString("base64"), caret, preparationMs: 0 };
  } finally { kopie.destroy(); }
}

describe("brongebonden asynchrone Rust-plakafhandeling", () => {
  it("rondt echte bronopmaak af vóór volgende invoer en draait tekst plus opmaak in één stap terug", async () => {
    const b = await bron(), gebeurtenis = new Event("paste"), volgorde: string[] = [];
    const status = registreerPlakAfronding(gebeurtenis, (s, bereik) => eind => {
      const gelezen = s.readParagraphs({ story: "body", view: "accepted" });
      if (!gelezen.ok) throw Error("Geen geaccepteerde alinea's");
      const plak = maakPlaksessie(gelezen.paragraphs, { story: bereik.story, ...bereik.start }, eind,
        "<p><b>Nieuw 😀</b></p><p><i>Daarna</i></p>", null, { x: 0, y: 0 }, s);
      expect(plak?.stukken.map(p => p.tekst)).toEqual(["Nieuw 😀", "Daarna"]);
      pasPlakOpmaakToe(s, plak!, "behouden"); volgorde.push("opmaak");
    });
    const k = maakRustPlakKoppeling({ transport: antwoord, gewijzigd: vi.fn() }); k.activeer();
    try {
      await handelOpenAecPlakAf(k.plak, b.s, b.bereik, fragment, undefined, () => true, () => volgorde.push("publiceren"), gebeurtenis);
      expect(status.overgenomen).toBe(true);
      expect(neemPlakAfronding(gebeurtenis)).toBeUndefined();
      const na = stand(b.s), caret = b.s.selection()!.head;
      b.s.insertText(caret, "LATERE INVOER"); b.s.addUndoBoundary(); volgorde.push("typen");
      expect(volgorde).toEqual(["opmaak", "publiceren", "typen"]);
      expect(b.s.undo()).toBe(true); expect(stand(b.s)).toEqual(na);
      expect(b.s.undo()).toBe(true); expect(stand(b.s)).toEqual(b.voor);
      expect(b.s.redo()).toBe(true); expect(stand(b.s)).toEqual(na);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("neemt geen afronding van een andere klembordgebeurtenis over", async () => {
    const b = await bron(), voorbereiden = vi.fn(), eigen = new Event("paste");
    const status = registreerPlakAfronding(eigen, voorbereiden);
    const k = maakRustPlakKoppeling({ transport: antwoord, gewijzigd: vi.fn() }); k.activeer();
    try {
      expect(await k.plak(b.s, b.bereik, fragment, undefined, () => true, new Event("paste"))).toBe(true);
      expect(status.overgenomen).toBe(false); expect(voorbereiden).not.toHaveBeenCalled();
    } finally { k.stop(); b.s.destroy(); }
  });

  it("houdt de bron ongewijzigd tot het antwoord en neemt één lokaal ongedaan te maken bewerking over", async () => {
    const b = await bron(), klaar = uitgesteld<RustPlakAntwoord>(), gestart = uitgesteld<RustPlakAanvraag>(), gewijzigd = vi.fn();
    const k = maakRustPlakKoppeling({ transport: r => { gestart.resolve(r); return klaar.promise; }, gewijzigd }); k.activeer();
    try {
      const werk = k.plak(b.s, b.bereik, fragment, undefined, () => true), r = await gestart.promise;
      expect(gewijzigd).toHaveBeenCalledOnce(); expect(stand(b.s)).toEqual(b.voor);
      const data = await antwoord(r); klaar.resolve(data); expect(await werk).toBe(true); b.s.addUndoBoundary();
      expect(b.s.paragraphs("body").slice(0, 2).map(p => p.text)).toEqual([b.p.text.slice(0, 7) + "Nieuw 😀", "Daarna" + b.p.text.slice(7)]);
      const na = stand(b.s); expect(b.s.selection()?.head).toEqual(data.caret);
      expect(b.s.undo()).toBe(true); expect(stand(b.s)).toEqual(b.voor);
      expect(b.s.redo()).toBe(true); expect(stand(b.s)).toEqual(na);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("kan werkelijk achter de tekst van een alinea met een leidende tabel plakken", async () => {
    const b = await bron(), laatste = b.s.paragraphs("body").at(-1)!, span = b.s.paragraphSpans("body").at(-1)!;
    expect(span.length).toBeGreaterThan(laatste.text.length);
    const punt = { paraId: laatste.paraId, offset: span.length }, bereik = { story: "body", start: punt, end: punt };
    b.s.setSelection({ story: "body", ...punt });
    const k = maakRustPlakKoppeling({ transport: antwoord, gewijzigd: vi.fn() }); k.activeer();
    try {
      expect(await k.plak(b.s, bereik, fragment, undefined, () => true)).toBe(true);
      expect(b.s.paragraphs("body").slice(-2).map(p => p.text)).toEqual([laatste.text + "Nieuw 😀", "Daarna"]);
      expect(b.s.storySegments("body").filter(p => p.kind === "embed" && p.embedKind === "table")).toHaveLength(1);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("weigert een verouderde delta en bereidt de meebewogen oorspronkelijke selectie opnieuw voor", async () => {
    const b = await bron(), eerste = uitgesteld<RustPlakAntwoord>(), tweede = uitgesteld<RustPlakAntwoord>();
    const aanvragen: RustPlakAanvraag[] = [], meting = vi.fn(), afronding = vi.fn();
    const gebeurtenis = new Event("paste"), bereidAfronding = vi.fn((_s: YrsSession, _bereik: typeof b.bereik) => afronding);
    registreerPlakAfronding(gebeurtenis, bereidAfronding);
    const k = maakRustPlakKoppeling({ transport: r => { aanvragen.push(r); return aanvragen.length === 1 ? eerste.promise : tweede.promise; }, gewijzigd: vi.fn(), meting }); k.activeer();
    try {
      const werk = k.plak(b.s, b.bereik, fragment, undefined, () => true, gebeurtenis);
      await vi.waitFor(() => expect(aanvragen).toHaveLength(1));
      const oud = await antwoord(aanvragen[0]);
      b.s.insertText({ story: "body", paraId: b.p.paraId, offset: 0 }, "Voor ");
      eerste.resolve(oud);
      await vi.waitFor(() => expect(aanvragen).toHaveLength(2));
      expect(b.s.paragraphs("body")[0].text).toBe("Voor " + b.p.text);
      expect(aanvragen[1].range.start.offset).toBe(12);
      expect(aanvragen[1].snapshotSha256).not.toBe(aanvragen[0].snapshotSha256);
      tweede.resolve(await antwoord(aanvragen[1])); expect(await werk).toBe(true);
      expect(b.s.paragraphs("body").slice(0, 2).map(p => p.text)).toEqual(["Voor " + b.p.text.slice(0, 7) + "Nieuw 😀", "Daarna" + b.p.text.slice(7)]);
      expect(meting.mock.calls.map(([x]) => x.route)).toEqual(["opnieuw", "rust"]);
      expect(bereidAfronding.mock.calls.map(([, b]) => b.start.offset)).toEqual([7, 12]);
      expect(afronding).toHaveBeenCalledOnce();
    } finally { k.stop(); b.s.destroy(); }
  });

  it("legt via de echte SDK-afhandeling de selectie vast vóór andere microtaken de bron aanpassen", async () => {
    const b = await bron(), aanvragen: RustPlakAanvraag[] = [], notify = vi.fn();
    const k = maakRustPlakKoppeling({ transport: r => { aanvragen.push(r); return antwoord(r); }, gewijzigd: vi.fn() }); k.activeer();
    try {
      queueMicrotask(() => b.s.insertText({ story: "body", paraId: b.p.paraId, offset: 0 }, "Voor "));
      await handelOpenAecPlakAf(k.plak, b.s, b.bereik, fragment, undefined, () => true, notify);
      expect(aanvragen).toHaveLength(1); expect(aanvragen[0].range.start.offset).toBe(12);
      expect(b.s.paragraphs("body")[0].text).toBe("Voor " + b.p.text.slice(0, 7) + "Nieuw 😀");
      expect(notify).toHaveBeenCalledOnce();
    } finally { k.stop(); b.s.destroy(); }
  });

  it("merkt bronverwijderingen ook op wanneer de versiegetter dezelfde waarde teruggeeft", async () => {
    const b = await bron(), gestart = uitgesteld<RustPlakAanvraag>(), klaar = uitgesteld<RustPlakAntwoord>();
    vi.spyOn(b.s, "version").mockReturnValue("dezelfde-versie");
    let aantal = 0;
    const k = maakRustPlakKoppeling({ transport: r => { aantal++; if (aantal === 1) { gestart.resolve(r); return klaar.promise; } return antwoord(r); }, gewijzigd: vi.fn() }); k.activeer();
    try {
      const werk = k.plak(b.s, b.bereik, fragment, undefined, () => true), r = await gestart.promise;
      const oud = await antwoord(r);
      b.s.deleteRange({ story: "body", start: { paraId: b.p.paraId, offset: 0 }, end: { paraId: b.p.paraId, offset: 2 } });
      klaar.resolve(oud); expect(await werk).toBe(true); expect(aantal).toBe(2);
      expect(b.s.paragraphs("body")[0].text).toBe(b.p.text.slice(2, 7) + "Nieuw 😀");
    } finally { k.stop(); b.s.destroy(); }
  });

  it("houdt een latere cursorbeweging vast terwijl de oorspronkelijke plakopdracht wel doorgaat", async () => {
    const b = await bron(), gestart = uitgesteld<RustPlakAanvraag>(), klaar = uitgesteld<RustPlakAntwoord>();
    const k = maakRustPlakKoppeling({ transport: r => { gestart.resolve(r); return klaar.promise; }, gewijzigd: vi.fn() }); k.activeer();
    try {
      const werk = k.plak(b.s, b.bereik, fragment, undefined, () => true), r = await gestart.promise;
      const andere = { story: "body", paraId: b.s.paragraphs("body")[3].paraId, offset: 2 };
      b.s.setSelection(andere); klaar.resolve(await antwoord(r)); expect(await werk).toBe(true);
      expect(b.s.selection()).toEqual({ anchor: andere, head: andere });
      expect(b.s.paragraphs("body")[0].text).toContain("Nieuw 😀");
    } finally { k.stop(); b.s.destroy(); }
  });

  it("laat een oud antwoord niet na stop/reactivatie in dezelfde editor schrijven", async () => {
    const b = await bron(), gestart = uitgesteld<RustPlakAanvraag>(), klaar = uitgesteld<RustPlakAntwoord>();
    const toepassen = vi.spyOn(b.s, "applyLocalUpdate"), fout = vi.fn(), afronding = vi.fn(), gebeurtenis = new Event("paste");
    const overname = registreerPlakAfronding(gebeurtenis, () => afronding);
    const k = maakRustPlakKoppeling({ transport: r => { gestart.resolve(r); return klaar.promise; }, gewijzigd: vi.fn(), fout }); k.activeer();
    try {
      const werk = k.plak(b.s, b.bereik, fragment, undefined, () => true, gebeurtenis), r = await gestart.promise;
      k.stop(); k.activeer(); klaar.resolve(await antwoord(r)); expect(await werk).toBe(false);
      expect(toepassen).not.toHaveBeenCalled(); expect(stand(b.s)).toEqual(b.voor); expect(fout).not.toHaveBeenCalled();
      expect(overname.overgenomen).toBe(true); expect(afronding).not.toHaveBeenCalled();
    } finally { k.stop(); b.s.destroy(); }
  });

  it("raakt een vernietigde sessie niet meer aan wanneer het antwoord pas na sluiten komt", async () => {
    const b = await bron(), gestart = uitgesteld<RustPlakAanvraag>(), klaar = uitgesteld<RustPlakAntwoord>();
    const toepassen = vi.spyOn(b.s, "applyLocalUpdate"), fout = vi.fn();
    const k = maakRustPlakKoppeling({ transport: r => { gestart.resolve(r); return klaar.promise; }, gewijzigd: vi.fn(), fout }); k.activeer();
    const werk = k.plak(b.s, b.bereik, fragment, undefined, () => true), r = await gestart.promise;
    const data = await antwoord(r); k.stop(); b.s.destroy(); klaar.resolve(data);
    expect(await werk).toBe(false); expect(toepassen).not.toHaveBeenCalled(); expect(fout).not.toHaveBeenCalled();
  });

  it("toont na sluiten geen late transportfout in een andere editor", async () => {
    const b = await bron(), gestart = uitgesteld<RustPlakAanvraag>(), klaar = uitgesteld<RustPlakAntwoord>(), fout = vi.fn();
    const k = maakRustPlakKoppeling({ transport: r => { gestart.resolve(r); return klaar.promise; }, gewijzigd: vi.fn(), fout }); k.activeer();
    const werk = k.plak(b.s, b.bereik, fragment, undefined, () => true); await gestart.promise;
    k.stop(); b.s.destroy(); klaar.reject(new Error("Eigen late transportfout"));
    expect(await werk).toBe(false); expect(fout).not.toHaveBeenCalled();
  });

  it.each(["requestId", "documentId", "sourceVersion", "snapshotSha256", "clientId"] as const)("weigert een antwoord met een afwijkende %s vóór opname", async veld => {
    const b = await bron(), fout = vi.fn();
    const k = maakRustPlakKoppeling({ transport: async r => {
      const data = await antwoord(r); return { ...data, [veld]: veld === "clientId" ? r.clientId + 1 : "verkeerd" };
    }, gewijzigd: vi.fn(), fout }); k.activeer();
    try {
      await expect(k.plak(b.s, b.bereik, fragment, undefined, () => true)).rejects.toThrow("hoort niet bij");
      expect(stand(b.s)).toEqual(b.voor); expect(fout).toHaveBeenCalledOnce(); expect(b.s.undo()).toBe(false);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("behoudt alle andere wijzigingen wanneer een voortdurend gewijzigde bron de volledige bestaande route nodig maakt", async () => {
    const b = await bron(), meting = vi.fn();
    const laatste = b.s.paragraphs("body").at(-1)!, oorspronkelijkeStaart = laatste.text;
    const k = maakRustPlakKoppeling({ transport: async r => {
      const data = await antwoord(r); const p = b.s.paragraphs("body").at(-1)!;
      b.s.addUndoBoundary(); b.s.insertText({ story: "body", paraId: p.paraId, offset: b.s.paragraphSpans("body").find(v => v.paraId === p.paraId)!.length }, "x"); b.s.addUndoBoundary(); return data;
    }, gewijzigd: vi.fn(), meting }); k.activeer();
    try {
      expect(await k.plak(b.s, b.bereik, fragment, undefined, () => true)).toBe(true); b.s.addUndoBoundary();
      expect(b.s.paragraphs("body").at(-1)!.text).toBe(oorspronkelijkeStaart + "xxx");
      expect(b.s.paragraphs("body")[0].text).toContain("Nieuw 😀");
      expect(meting.mock.calls.map(([x]) => x.route)).toEqual(["opnieuw", "opnieuw", "opnieuw", "synchroon"]);
      expect(b.s.undo()).toBe(true); expect(b.s.paragraphs("body")[0].text).toBe(b.p.text);
      expect(b.s.paragraphs("body").at(-1)!.text).toBe(oorspronkelijkeStaart + "xxx");
    } finally { k.stop(); b.s.destroy(); }
  });
});
