/** Afzonderlijke draadproef; geen echte Tauri-IPC, GUI of prestatietest. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { Buffer } from "buffer";
import { describe, expect, it, vi } from "vitest";
import { createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import { maakRustTekstKoppeling } from "./rustTekst";
import type { RustTransportAntwoord } from "./rustPlakken";
import type { JournaalInvoke } from "./rustJournaal";

function brug() {
  const p = spawn(process.env.WRITER_JOURNAAL_HOST!, [], { stdio: ["pipe", "pipe", "pipe"] });
  const wacht: { klaar: (v: unknown) => void; fout: (e: unknown) => void }[] = [];
  let fouten = "";p.stderr.on("data", b => { fouten += String(b); });
  createInterface({ input: p.stdout }).on("line", regel => {
    const v = JSON.parse(regel), taak = wacht.shift();
    if (!taak) throw Error("Ongevraagd antwoord uit de eigen hostbrug");
    if ("fout" in v) taak.fout(v.fout);else taak.klaar(v.ok);
  });
  p.on("error", e => { for (const w of wacht.splice(0)) w.fout(e); });
  const gesloten = new Promise<number | null>(r => p.on("close", code => { for (const w of wacht.splice(0)) w.fout(Error(fouten || "Hostbrug gesloten"));r(code); }));
  const invoke: JournaalInvoke = (command, argumenten) => new Promise((klaar, fout) => {
    wacht.push({ klaar, fout });p.stdin.write(JSON.stringify({ command, argumenten }) + "\n");
  });
  return { invoke: vi.fn(invoke), async stop() { p.stdin.end();expect(await gesloten).toBe(0);expect(fouten).toBe(""); } };
}
const stand = (s: YrsSession) => Object.fromEntries(s.storyIds().sort().map(id => [id, s.storySegments(id)]));

describe.skipIf(!process.env.WRITER_JOURNAAL_HOST)("frontend met de echte Rust-host op stdin/stdout", () => {
  it("bewaart opeenvolgende delta’s, Unicode, bronbinding, selectie en Undo/Redo", async () => {
    const b = brug(), s = await createYrsSession({ clientId: 71 });
    s.openDocx(new Uint8Array(readFileSync("public/templates/nieuw.docx")), true);
    const positie = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };s.setSelection(positie);
    s.beginUndoCapture();s.setUndoCaptureMode("manual");s.addUndoBoundary();const voor = stand(s);
    const oud = vi.fn(async () => { throw Error("Onverwachte bestaande route in de echte journaalproef"); });
    const k = maakRustTekstKoppeling({ documentId: "draadproef", transport: oud, journaal: { optIn: true, invoke: b.invoke }, gewijzigd: vi.fn() });
    const groep = ["Eigen tekst ", "één 😀 ", "𝄞 einde "];
    k.activeer();await k.gereed();
    try {
      for (let n = 0; n < 36; n++) expect(await k.tekst(s, s.selection()!.head, groep[n % groep.length], undefined, () => true, [n * 20, n * 20 + 10])).toBe(true);
      expect(s.paragraphs("body")[0].text).toBe(groep.join("").repeat(12));
      const na = stand(s);s.addUndoBoundary();expect(s.undo()).toBe(true);expect(stand(s)).toEqual(voor);expect(s.redo()).toBe(true);expect(stand(s)).toEqual(na);
      const vragen = b.invoke.mock.calls.filter(([c]) => c === "writer_journaal_voorbereiden").map(([, a]) => a!.gegevens as { volgnummer: number; aanvraag: Record<string, unknown> });
      expect(vragen).toHaveLength(36);expect(vragen.map(a => a.volgnummer)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
      expect(vragen[0].aanvraag.basis).toBeUndefined();expect(vragen.slice(1).every(a => typeof a.aanvraag.basis === "string")).toBe(true);
      expect(vragen.every(a => a.aanvraag.schema === 3)).toBe(true);expect(oud).not.toHaveBeenCalled();
      // De volledige eindbron opnieuw inlezen, los van de verwerker van antwoorden.
      const herlezen = await createYrsSession({ clientId: 72 });
      try { herlezen.applyUpdate(new Uint8Array(s.encodeStateAsUpdate()));expect(stand(herlezen)).toEqual(na); } finally { herlezen.destroy(); }
    } finally { k.stop();await k.gereed();s.destroy();await b.stop(); }
  }, 30_000);
  it.each(["selectie", "bron", "sluiten"] as const)("bewaakt %s tijdens een vertraagd echt Rust-antwoord", async actie => {
    const b = brug(), s = await createYrsSession({ clientId: 71 });
    s.openDocx(new Uint8Array(readFileSync("public/templates/nieuw.docx")), true);
    const p = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };
    s.insertText(p, "Eigen begin en einde");s.setSelection({ ...p, offset: 6 });
    let gestart!: () => void, los!: () => void;
    const start = new Promise<void>(r => { gestart = r; }), wacht = new Promise<void>(r => { los = r; });
    let eerste = true;
    const invoke: JournaalInvoke = async (c, a) => {
      const r = await b.invoke(c, a);
      if (c === "writer_journaal_voorbereiden" && eerste) { eerste = false;gestart();await wacht; }
      return r;
    };
    const oud = vi.fn(async (): Promise<RustTransportAntwoord> => { throw Error("Onverwachte schema-2-route"); });
    const fout = vi.fn();
    const k = maakRustTekstKoppeling({ documentId: "vertraging", transport: oud,
      journaal: { optIn: true, invoke }, gewijzigd: vi.fn(), fout });
    k.activeer();await k.gereed();
    try {
      const werk = k.tekst(s, s.selection()!.head, "GETYPT ", undefined, () => true);await start;
      if (actie === "selectie") s.setSelection({ ...p, offset: 15 }, { ...p, offset: 19 });
      if (actie === "bron") s.insertText(p, "VOOR ");
      if (actie === "sluiten") { k.stop();k.activeer();await k.gereed(); }
      const selectie = s.selection()!;
      const anker = s.encodeStickyPosition(selectie.anchor), hoofd = s.encodeStickyPosition(selectie.head);
      los();expect(await werk).toBe(actie !== "sluiten");
      if (actie === "selectie") {
        // Invoeging vóór de selectie verschuift offsets; dezelfde letters blijven geselecteerd.
        const na = s.selection()!;
        expect(na).toEqual({ anchor: s.resolveStickyPosition(anker), head: s.resolveStickyPosition(hoofd) });
        expect(s.paragraphs("body")[0].text.slice(na.anchor.offset, na.head.offset)).toBe("eind");
      }
      expect(s.paragraphs("body")[0].text).toBe(actie === "sluiten" ? "Eigen begin en einde" : (actie === "bron" ? "VOOR " : "") + "Eigen GETYPT begin en einde");
      if (actie === "sluiten") expect(await k.tekst(s, s.selection()!.head, "NIEUW ", undefined, () => true)).toBe(true);
      expect(fout).not.toHaveBeenCalled();expect(oud).not.toHaveBeenCalled();
    } finally { los();k.stop();await k.gereed();s.destroy();await b.stop(); }
  }, 30_000);

});
