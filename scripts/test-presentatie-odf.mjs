/** Native ODF-matrix: dezelfde productiecorrectie en echte engine als de app. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { createServer } from "vite";

const out = path.resolve(
  process.env.OOS_PRESENTATIE_ODF_UIT ?? ".local/presentatie-odf",
);
const [mode, ext] = process.argv.slice(2);
const loader = await createServer({
  configFile: false,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const { naPresentatieConversie } = await loader.ssrLoadModule(
    "/src/presentatie/odf-overgangen.ts",
  );
  const { GEEN_OVERGANG, schrijfOvergangen, leesOvergangGegevens } =
    await loader.ssrLoadModule("/src/presentatie/overgangen.ts");
  const bytes = async (p) => new Uint8Array(await readFile(p));
  const dirs = ["r", "l", "u", "d"],
    times = [1800, 1234, 2500, 3750],
    durations = [400, 600, 800, 1000];
  if (mode === "prepare") {
    await mkdir(out, { recursive: true });
    await initWasm(
      await readFile(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
    const h = openPresentation(
      await bytes("docs/voorbeelden/Ontwerpvisie.pptx"),
    );
    let source;
    try {
      h.duplicateSlide(h.snapshot().slides[2].id, 3);
      h.setSlideNotes(
        h.snapshot().slides[3].id,
        "ODF transition notes preserved 2026",
      );
      source = h.save();
    } finally {
      h.dispose();
    }
    const wav = new Uint8Array(844),
      v = new DataView(wav.buffer);
    const text = (s) => new TextEncoder().encode(s);
    wav.set(text("RIFF"));
    v.setUint32(4, wav.length - 8, true);
    wav.set(text("WAVEfmt "), 8);
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    wav.set(text("data"), 36);
    v.setUint32(40, 800, true);
    for (const format of ["odp", "otp", "fodp"]) {
      let deck = schrijfOvergangen(
        source,
        [0, 1, 2, 3],
        { ...GEEN_OVERGANG, effect: "push", klik: false, na: 1800 },
        true,
        format === "fodp"
          ? undefined
          : { bytes: wav, naam: "transition-matrix.wav" },
      );
      for (let i = 0; i < 4; i++)
        deck = schrijfOvergangen(deck, [i], {
          ...GEEN_OVERGANG,
          effect: "push",
          richting: dirs[i],
          duur: durations[i],
          na: times[i],
          klik: false,
        });
      await writeFile(path.join(out, `source-${format}.pptx`), deck);
    }
    await writeFile(
      path.join(out, "expected.json"),
      JSON.stringify(
        {
          dirs,
          times,
          durations,
          notes: "ODF transition notes preserved 2026",
        },
        null,
        2,
      ) + "\n",
    );
  } else if (mode === "export") {
    const corrected = naPresentatieConversie(
      await bytes(path.join(out, `source-${ext}.pptx`)),
      "pptx",
      ext,
      await bytes(path.join(out, `raw-${ext}/source-${ext}.${ext}`)),
    );
    await mkdir(path.join(out, `corrected-${ext}`), { recursive: true });
    await writeFile(
      path.join(out, `corrected-${ext}/source-${ext}.${ext}`),
      corrected,
    );
  } else if (mode === "import") {
    const corrected = naPresentatieConversie(
      await bytes(path.join(out, `corrected-${ext}/source-${ext}.${ext}`)),
      ext,
      "pptx",
      await bytes(path.join(out, `returned-${ext}/source-${ext}.pptx`)),
    );
    await initWasm(
      await readFile(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
    const h = openPresentation(corrected);
    let saved;
    try {
      assert.equal(h.snapshot().slides.length, 4);
      saved = h.save();
    } finally {
      h.dispose();
    }
    const reopened = openPresentation(saved);
    try {
      assert.equal(reopened.snapshot().slides.length, 4);
    } finally {
      reopened.dispose();
    }
    const actual = leesOvergangGegevens(saved),
      source = leesOvergangGegevens(
        await bytes(path.join(out, `source-${ext}.pptx`)),
      );
    assert.deepEqual(
      actual.overgangen.map((o) => [
        o.effect,
        o.richting,
        o.duur,
        o.na,
        o.klik,
      ]),
      dirs.map((d, i) => ["push", d, durations[i], times[i], false]),
    );
    if (ext !== "fodp")
      for (let i = 0; i < 4; i++) {
        const a = actual.geluiden[i],
          b = source.geluiden[i];
        assert(a && b && "bytes" in a && "bytes" in b);
        assert(Buffer.from(a.bytes).equals(Buffer.from(b.bytes)));
      }
    await writeFile(path.join(out, `engine-${ext}.pptx`), saved);
    await writeFile(
      path.join(out, `engine-${ext}.json`),
      JSON.stringify(
        {
          pass: true,
          transitions: actual.overgangen,
          sounds: actual.geluiden.map((g) =>
            g && "bytes" in g ? g.bytes.length : null,
          ),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `${ext}: exact timing, four directions, click policy and native save/reopen passed`,
    );
  } else throw new Error("Use prepare, export <ext> or import <ext>");
} finally {
  await loader.close();
}
