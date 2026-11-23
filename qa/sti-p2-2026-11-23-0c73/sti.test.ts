import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { bereidOpenen } from "../../src/import/openen";
import { converteer, bestandssoort, uitvoerformaat, kiesRoute } from "../../src/formaten";
import { isSjabloon } from "../../src/import/sjabloon";

const application = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b";
const qa = "qa/sti-p2-2026-11-23-0c73";
const output = path.resolve(process.env.OOS_STI_OUTPUT ?? ".local/qa-sti-p2-0c73");
const sourcePath = path.join(output, "prs-strategy.sti");
const source = new Uint8Array(readFileSync(sourcePath));
const oracleBytes = readFileSync(path.join(output, "source-oracle.json"));
const goldenBytes = readFileSync(path.join(qa, "source-oracle.json"));
const oracle = JSON.parse(oracleBytes.toString("utf8"));
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim();
const marker = "STI_P2_EDIT_2026_48_1 ";
const report: Record<string, unknown> = {
  applicationCommit: application,
  applicationTree: "5a644e397ecc6af5452a49b6404edf953687d1b2",
  harnessCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  platform: process.platform,
  fixtureSha256: sha(source), oracleSha256: sha(oracleBytes),
  browserGuiStarted: false, nativeGuiStarted: false,
  nativeRoute: process.env.OOS_STI_BINDING ? "pending" : "not run: verified runtime binding unavailable",
};

beforeAll(async () => {
  expect(sha(source)).toBe(oracle.fixture.sha256);
  expect(sha(oracleBytes)).toBe(sha(goldenBytes));
  const changed = execFileSync("git", ["diff", "--name-only", application], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  expect(changed.every(p => p.startsWith(qa + "/") || p === ".github/workflows/qa-sti-p2-0c73.yml")).toBe(true);
  expect(JSON.parse(readFileSync("package.json", "utf8")).version).toBe("2026.48.1");
  await initWasm(readFileSync("node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm"));
  report.engineWasmSha256 = sha(readFileSync("node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm"));
});

afterEach(() => vi.unstubAllGlobals());
afterAll(() => {
  expect(sha(new Uint8Array(readFileSync(sourcePath)))).toBe(oracle.fixture.sha256);
  expect(sha(readFileSync(path.join(output, "source-oracle.json")))).toBe(sha(goldenBytes));
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, "engine-report.json"), JSON.stringify(report, null, 2) + "\n");
});

it("records the unchanged P2 template and modern-save policy", () => {
  expect(bestandssoort("sti")).toBe("pptx");
  expect(isSjabloon("prs-strategy.sti")).toBe(true);
  expect(uitvoerformaat("pptx", "sti")).toBe(null);
  expect(kiesRoute(uitvoerformaat("pptx", "pptx")!, false)).toBe("engine");
  report.policy = { input: "runtime", template: true, recommendedModernSave: "pptx", stiExportOffered: false };
});

it("the real production open route refuses STI without a desktop bridge and gives PPTX guidance", async () => {
  // Model the browser's absent Tauri bridge; no browser/capture client is started.
  vi.stubGlobal("window", {});
  let message = "";
  try {
    await bereidOpenen("prs-strategy.sti", source, { runtimeBeschikbaar: async () => false, converteer });
  } catch (error) { message = String(error); }
  expect(message).toMatch(/STI/);
  expect(message).toMatch(/desktop/i);
  expect(message).toMatch(/PPTX/);
  report.browserLimit = { status: "expected refusal", message, scope: "production route logic in Node; no GUI browser and no native converter" };
});

it("the actual PPTX engine does not directly accept the legacy STI container", () => {
  expect(() => { const handle = openPresentation(source); handle.dispose(); }).toThrow();
  report.directEngineLimit = "legacy STI correctly requires conversion; raw engine open rejected";
});

it.skipIf(!process.env.OOS_STI_BINDING)("converts the authentic STI using the verified private Linux runtime, edits, saves and reopens PPTX", async () => {
  expect(process.platform).toBe("linux");
  expect(process.env.GITHUB_ACTIONS).toBe("true");
  const calls: unknown[] = [];
  const opened = await bereidOpenen("prs-strategy.sti", source, {
    runtimeBeschikbaar: async () => true,
    converteer: async (bytes, from, to, kind) => {
      expect(sha(bytes)).toBe(oracle.fixture.sha256);
      expect([from, to, kind]).toEqual(["sti", "pptx", "pptx"]);
      calls.push({ from, to, kind, sourceSha256: sha(bytes) });
      execFileSync("python3", [path.join(qa, "convert_linux.py"), "--binding", process.env.OOS_STI_BINDING!, "--out", output], { stdio: "inherit", timeout: 110_000 });
      return new Uint8Array(readFileSync(path.join(output, "converted/prs-strategy.pptx")));
    },
  });
  expect(calls).toHaveLength(1);
  expect(opened?.soort).toBe("pptx");
  expect(opened?.alsNieuw).toBe(true);
  expect(opened?.exportFormaat).toBe("pptx");
  expect(opened?.naam).toBe("prs-strategy.pptx");
  report.route = { calls, name: opened!.naam, asNew: opened!.alsNieuw, modernSave: opened!.exportFormaat,
    transportQualification: "actual production open route with a private-CLI transport; not a native Tauri dispatcher or GUI test" };
  const paragraphs = (shapes: readonly any[]): string[] => shapes.flatMap(s => [
    ...s.textStories.flatMap((story: any) => story.paragraphs.map((p: any) => normalize(p.runs.map((r: any) => r.text).join("")))),
    ...paragraphs(s.children ?? []),
  ]).filter(Boolean);
  function verify(handle: ReturnType<typeof openPresentation>, edited: boolean) {
    const snapshot = handle.snapshot();
    expect(snapshot.slides).toHaveLength(oracle.slideCount);
    expect(snapshot.widthEmu).toBe(oracle.pageSize.widthEmu);
    expect(snapshot.heightEmu).toBe(oracle.pageSize.heightEmu);
    for (let i = 0; i < oracle.slideCount; i++) {
      const expected = oracle.slides[i].paragraphs.map(normalize);
      if (edited && i === 0) expected[0] = normalize(marker + expected[0]);
      expect(paragraphs(snapshot.slides[i].shapes), `source-derived paragraphs on slide ${i + 1}`).toEqual(expected);
    }
  }
  const handle = openPresentation(opened!.bytes);
  let saved: Uint8Array;
  try {
    verify(handle, false);
    const stories = (shapes: readonly any[]): any[] => shapes.flatMap(s => [...s.textStories, ...stories(s.children ?? [])]);
    const title = stories(handle.snapshot().slides[0].shapes).find(s => normalize(s.paragraphs[0]?.runs.map((r: any) => r.text).join("") ?? "") === normalize(oracle.slides[0].paragraphs[0]));
    expect(title).toBeDefined();
    handle.insertText(title.id, 0, marker);
    verify(handle, true);
    saved = handle.save();
    writeFileSync(path.join(output, "edited.pptx"), saved);
  } finally { handle.dispose(); }
  const reopened = openPresentation(saved!);
  try {
    verify(reopened, true);
    writeFileSync(path.join(output, "reopened.pptx"), reopened.save());
  } finally { reopened.dispose(); }
  report.nativeRoute = "pass";
  report.engine = { slides: 7, sourceParagraphs: 24, pageSizePreserved: true, appropriateEdit: "prefix first slide title", marker,
    editSavedAndReopened: true, sourceUnchanged: sha(source) === oracle.fixture.sha256,
    relevantMediaQualification: oracle.media.qualification, visualFidelity: "not tested; no GUI/screen capture" };
});
