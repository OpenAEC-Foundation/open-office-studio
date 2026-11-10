/** #93: native API capability probe, without starting a browser or changing app code. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { initWasm, openPresentation } from "@betteroffice/pptx";

const output = resolve(
  process.argv[2] ?? ".local/proef-tekenmodule-connectors",
);
const wasm = await readFile(
  "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
);
await initWasm(wasm);
const loader = await createServer({
  configFile: false,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, watch: null },
});
const handles = [];
const open = (bytes) => {
  const h = openPresentation(bytes);
  handles.push(h);
  return h;
};
try {
  const { voegDiagramToe } = await loader.ssrLoadModule(
    "/src/presentatie/diagrammen.ts",
  );
  const { hefGroepOp } = await loader.ssrLoadModule(
    "/src/presentatie/groepen.ts",
  );
  const { Pakket } = await loader.ssrLoadModule("/src/grafieken/pakket.ts");
  const { attr, leesXml, zoekAlle } = await loader.ssrLoadModule(
    "/src/grafieken/xml.ts",
  );
  const grouped = voegDiagramToe(
    new Uint8Array(await readFile("public/templates/nieuw.pptx")),
    0,
    "process",
    "First\nSecond\nThird",
    "Reuse probe",
  );
  const group = open(grouped)
    .snapshot()
    .slides[0].shapes.find((s) => s.name === "Reuse probe");
  const ungrouped = hefGroepOp(grouped, 0, String(group.sourceId));
  const flatten = (shapes) =>
    shapes.flatMap((s) => [s, ...flatten(s.children)]);
  const rect = (s) => ({ x: s.x, y: s.y, width: s.width, height: s.height });
  const capture = (h) => {
    const slide = h.snapshot().slides[0],
      shapes = flatten(slide.shapes);
    const node = shapes.find((s) => s.name === "First");
    const primitives = h.layoutSlide(0).primitives;
    const edges = shapes.filter((s) => s.name.startsWith("Reuse probe —"));
    assert.equal(edges.length, 2);
    const edgeGeometry = edges.map((e) => {
      const display = primitives.filter((p) => p.shapeId === e.id);
      assert.ok(display.length > 0);
      return { sourceId: e.sourceId, ...rect(e), display };
    });
    return { node: { sourceId: node.sourceId, ...rect(node) }, edgeGeometry };
  };
  const refs = (bytes) => {
    const root = leesXml(new Pakket(bytes).lees("ppt/slides/slide1.xml"));
    const ids = new Set(zoekAlle(root, "cNvPr").map((n) => attr(n, "id")));
    const references = [
      ...zoekAlle(root, "stCxn"),
      ...zoekAlle(root, "endCxn"),
    ].map((n) => ({ id: attr(n, "id"), site: attr(n, "idx") }));
    assert.equal(references.length, 4);
    assert.ok(references.every((r) => ids.has(r.id)));
    return references;
  };
  const observations = [];
  await mkdir(output, { recursive: true });
  for (const [name, bytes, targetName] of [
    ["whole-group-control", grouped, "Reuse probe"],
    ["ungrouped-node", ungrouped, "First"],
  ]) {
    const h = open(bytes),
      slide = h.snapshot().slides[0];
    const target = flatten(slide.shapes).find((s) => s.name === targetName);
    const originalRect = rect(target),
      before = capture(h);
    const result = h.applyEdits({
      expectVersion: h.version(),
      history: "separate",
      steps: [
        {
          op: "setShapeRect",
          target: { slideId: slide.id, shapeId: target.id },
          rect: { ...originalRect, y: originalRect.y + 200000 },
          expect: { rect: originalRect },
        },
      ],
    });
    assert.equal(result.ok, true);
    const movedTarget = flatten(h.snapshot().slides[0].shapes).find(
      (s) => s.sourceId === target.sourceId,
    );
    assert.equal(movedTarget.y, originalRect.y + 200000);
    const moved = capture(h),
      saved = h.save(),
      reopened = capture(open(saved));
    assert.deepEqual(refs(saved), refs(bytes));
    assert.deepEqual(reopened, moved);
    h.undo();
    const undo = capture(h);
    assert.deepEqual(undo, before);
    h.redo();
    const redo = capture(h);
    assert.deepEqual(redo, moved);
    const edgesChanged =
      JSON.stringify(before.edgeGeometry) !==
      JSON.stringify(moved.edgeGeometry);
    if (name === "whole-group-control")
      assert.equal(
        edgesChanged,
        true,
        "The renderer control must observe translation of the complete group",
      );
    const fixtureSha256 = createHash("sha256").update(bytes).digest("hex");
    const savedSha256 = createHash("sha256").update(saved).digest("hex");
    observations.push({
      name,
      targetName,
      deltaYEmu: 200000,
      before,
      moved,
      reopened,
      undo,
      redo,
      refsBefore: refs(bytes),
      refsAfter: refs(saved),
      edgesChanged,
      fixtureSha256,
      savedSha256,
    });
    await writeFile(resolve(output, `${name}-before.pptx`), bytes);
    await writeFile(resolve(output, `${name}-after.pptx`), saved);
  }
  const report = {
    method:
      "Existing diagram generator, native applyEdits(setShapeRect), layout, save/reopen and Undo/Redo. Native API only; no browser or installed native-app interaction.",
    wasmSha256: createHash("sha256").update(wasm).digest("hex"),
    probeScriptSha256: createHash("sha256")
      .update(await readFile(new URL(import.meta.url)))
      .digest("hex"),
    observations,
  };
  await writeFile(
    resolve(output, "observations.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      observations.map(({ name, edgesChanged }) => ({
        name,
        edgesChanged,
        saveReopenAndUndoRedo: "passed",
      })),
    ),
  );
} finally {
  handles.forEach((h) => h.dispose());
  await loader.close();
}
