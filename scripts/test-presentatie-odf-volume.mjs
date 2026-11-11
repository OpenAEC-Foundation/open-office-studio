/** Echte ODP/OTP-volumerondreis; aparte variant van de bestaande native matrix. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { createServer } from "vite";
const out = path.resolve(
    process.env.OOS_PRESENTATIE_ODF_UIT ?? ".local/presentatie-odf-volume",
  ),
  [mode, ext] = process.argv.slice(2);
const loader = await createServer({
  configFile: false,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, watch: null },
});
const hash = (b) => createHash("sha256").update(b).digest("hex"),
  bytes = async (p) => new Uint8Array(await readFile(p));
try {
  const { behoudOdfMediavolume } = await loader.ssrLoadModule(
      "/src/presentatie/odf-mediavolume.ts",
    ),
    { naPresentatieConversie } = await loader.ssrLoadModule(
      "/src/presentatie/odf-overgangen.ts",
    ),
    { herstelOdfMedianamen } = await loader.ssrLoadModule(
      "/src/presentatie/odf-medianamen.ts",
    ),
    { voegMediaToe, leesAlleMedia, STANDAARD_MEDIA } =
      await loader.ssrLoadModule("/src/presentatie/media.ts");
  const levels = [0, 0.35, 0.9, 1],
    note = "ODF media volume notes preserved 2026",
    names = { audio: 'Narration & "日本語".wav', video: "Clip <Paris> 🎬.mp4" };
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
      h.setSlideNotes(h.snapshot().slides[3].id, note);
      source = h.save();
    } finally {
      h.dispose();
    }
    const video = await bytes(
        "src/presentatie/testbestanden/synthetic-volume.mp4",
      ),
      poster = await bytes(
        "src/presentatie/testbestanden/synthetic-volume.png",
      );
    const audio = new Uint8Array(32044),
      v = new DataView(audio.buffer),
      text = (s) => new TextEncoder().encode(s);
    audio.set(text("RIFF"));
    v.setUint32(4, audio.length - 8, true);
    audio.set(text("WAVEfmt "), 8);
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    audio.set(text("data"), 36);
    v.setUint32(40, 32000, true);
    for (let n = 0; n < 16000; n++)
      v.setInt16(
        44 + n * 2,
        Math.round(Math.sin((n / 8000) * Math.PI * 440) * 3000),
        true,
      );
    for (let i = 0; i < 4; i++) {
      source = voegMediaToe(source, i, names.audio, audio, poster, {
        ...STANDAARD_MEDIA,
        volume: levels[i],
      });
      source = voegMediaToe(source, i, names.video, video, poster, {
        ...STANDAARD_MEDIA,
        volume: levels[3 - i],
      });
    }
    for (const e of ["odp", "otp"])
      await writeFile(path.join(out, `source-${e}.pptx`), source);
    await writeFile(
      path.join(out, "expected.json"),
      JSON.stringify(
        {
          levels,
          names,
          notes: note,
          hashes: { audio: hash(audio), video: hash(video) },
        },
        null,
        2,
      ) + "\n",
    );
  } else if (mode === "export") {
    const source = await bytes(path.join(out, `source-${ext}.pptx`)),
      native = await bytes(path.join(out, `raw-${ext}/source-${ext}.${ext}`));
    const result = await behoudOdfMediavolume(
      source,
      "pptx",
      ext,
      naPresentatieConversie(source, "pptx", ext, native),
    );
    await mkdir(path.join(out, `corrected-${ext}`), { recursive: true });
    await writeFile(
      path.join(out, `corrected-${ext}/source-${ext}.${ext}`),
      result,
    );
  } else if (mode === "import") {
    const source = await bytes(
        path.join(out, `corrected-${ext}/source-${ext}.${ext}`),
      ),
      native = await bytes(
        path.join(out, `returned-${ext}/source-${ext}.pptx`),
      );
    const withVolume = await behoudOdfMediavolume(
      source,
      ext,
      "pptx",
      naPresentatieConversie(source, ext, "pptx", native),
    );
    const result = await herstelOdfMedianamen(source, ext, "pptx", withVolume);
    await initWasm(
      await readFile(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
    const h = openPresentation(result);
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
    const actual = leesAlleMedia(saved),
      expected = JSON.parse(
        await readFile(path.join(out, "expected.json"), "utf8"),
      ),
      before = leesAlleMedia(native);
    for (let i = 0; i < 4; i++)
      for (const kind of ["audio", "video"]) {
        const m = actual[i].filter((m) => m.soort === kind),
          n = before[i].filter((m) => m.soort === kind);
        assert.equal(m.length, 1);
        assert.equal(n.length, 1);
        const a = m[0];
        assert.equal(a.volume, kind === "audio" ? levels[i] : levels[3 - i]);
        assert.equal(
          a.naam,
          n[0].naam.trim() ? n[0].naam : expected.names[kind],
        );
        assert.equal(hash(a.bytes), expected.hashes[kind]);
        assert.deepEqual(
          [a.x, a.y, a.breedte, a.hoogte],
          [n[0].x, n[0].y, n[0].breedte, n[0].hoogte],
        );
        assert.equal(a.automatisch, n[0].automatisch);
        assert.equal(a.herhalen, n[0].herhalen);
      }
    await writeFile(path.join(out, `engine-${ext}.pptx`), saved);
    await writeFile(
      path.join(out, `engine-${ext}.json`),
      JSON.stringify(
        {
          pass: true,
          media: actual.map((a) =>
            a.map(({ naam, soort, volume, automatisch, herhalen }) => ({
              naam,
              soort,
              volume,
              automatisch,
              herhalen,
            })),
          ),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `${ext}: eight media names/volumes, bytes, geometry and engine save/reopen passed`,
    );
  } else throw new Error("Use prepare, export <ext> or import <ext>");
} finally {
  await loader.close();
}
