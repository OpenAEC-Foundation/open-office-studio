/** Real converter + production Writer engine; each conversion has its own profile. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { openTekstkernProef } from "./tekstkern-proef";
import { bereidOpenen } from "../src/import/openen";
import { werkEigenschappenBij } from "../src/tekst/info/opslaan";

const converter = process.env.OPENAEC_CONVERSIE_PROGRAMMA;
if (!converter)
  throw new Error("Set OPENAEC_CONVERSIE_PROGRAMMA to the real converter");
const python =
  process.env.OOS_WRITER_PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
const root = resolve(
  process.env.OOS_WRITER_UIT || ".local/writer-formaten",
  randomUUID(),
);
mkdirSync(root, { recursive: true });
const manifest = JSON.parse(
  readFileSync(
    "docs/tests/documentmatrix-2026-11-06/bron/manifest.json",
    "utf8",
  ),
);
const catalogus = JSON.parse(readFileSync("src/formaten.json", "utf8"));
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
let kern: Awaited<ReturnType<typeof openTekstkernProef>>;
let nummer = 0;

beforeAll(async () => {
  kern = await openTekstkernProef();
  writeFileSync(
    join(root, "engine.json"),
    JSON.stringify(
      {
        editSha256: hash(readFileSync("vendor/tekstengine/docx_edit_bg.wasm")),
        layoutSha256: hash(
          readFileSync("vendor/tekstengine/docx_layout_bg.wasm"),
        ),
        aansluiting: kern.aansluiting,
        converter,
        profileSha256: hash(readFileSync("src-tauri/src/conversieprofiel.xcu")),
      },
      null,
      2,
    ),
  );
}, 30_000);
afterAll(() => kern?.sluit());

async function converteer(bytes: Uint8Array, van: string, naar: string) {
  const reportMap = join(root, `conversie-${++nummer}`);
  // Windows filter registration fails silently under very deep profiles.
  // Match the native app's short temporary directory, then retain its files.
  const tempBase = resolve(tmpdir());
  const temporary = process.platform === "win32";
  const map = temporary
    ? mkdtempSync(join(tempBase, "oos-writer-"))
    : reportMap;
  mkdirSync(join(map, "profiel/user"), { recursive: true });
  mkdirSync(join(map, "uit"));
  copyFileSync(
    "src-tauri/src/conversieprofiel.xcu",
    join(map, "profiel/user/registrymodifications.xcu"),
  );
  const bron = join(map, `bron.${van}`);
  writeFileSync(bron, bytes);
  const filter = catalogus.docx.uitvoer[naar]?.filter;
  if (!filter) throw new Error(`No runtime filter for ${naar}`);
  const started = Date.now();
  let timedOut = false;
  let output = "";
  try {
    await new Promise<void>((done, fail) => {
      const child = spawn(
        converter!,
        [
          `-env:UserInstallation=${pathToFileURL(join(map, "profiel")).href}`,
          "--headless",
          "--nologo",
          "--nodefault",
          "--norestore",
          "--nolockcheck",
          "--convert-to",
          `${naar}:${filter}`,
          "--outdir",
          join(map, "uit"),
          bron,
        ],
        {
          windowsHide: true,
          detached: process.platform !== "win32",
          env: {
            ...process.env,
            SAL_DISABLE_DEFAULTPRINTER: "1",
            SAL_DISABLE_PRINTERLIST: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout.on("data", (b) => {
        output += String(b);
      });
      child.stderr.on("data", (b) => {
        output += String(b);
      });
      const timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === "win32") {
          try {
            execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
              timeout: 10_000,
            });
          } catch {
            child.kill();
          }
        } else {
          try {
            process.kill(-child.pid!, "SIGKILL");
          } catch {
            child.kill();
          }
        }
      }, 45_000);
      child.once("error", (e) => {
        clearTimeout(timer);
        fail(e);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (timedOut)
          fail(new Error("Conversion exceeded the unchanged 45-second limit"));
        else if (code !== 0)
          fail(new Error(`Converter exited with ${code}: ${output}`));
        else done();
      });
    });
    const target = join(map, "uit", `bron.${naar}`);
    if (!existsSync(target)) throw new Error(`No ${naar} output: ${output}`);
    return {
      bytes: new Uint8Array(readFileSync(target)),
      pad: join(reportMap, "uit", `bron.${naar}`),
    };
  } finally {
    writeFileSync(join(map, "converter.log"), output);
    writeFileSync(
      join(map, "timing.json"),
      JSON.stringify({ van, naar, ms: Date.now() - started, timedOut }),
    );
    if (temporary) {
      cpSync(map, reportMap, { recursive: true });
      if (
        dirname(resolve(map)) !== tempBase ||
        !basename(map).startsWith("oos-writer-")
      )
        throw new Error("Unexpected temporary conversion directory");
      rmSync(map, { recursive: true });
    }
  }
}

function kenmerken(pad: string): {
  texts: string[];
  features: Record<string, number>;
} {
  return JSON.parse(
    execFileSync(python, ["scripts/writer-formaatkenmerken.py", pad], {
      encoding: "utf8",
      windowsHide: true,
    }),
  );
}

describe("real Writer format round trips", () => {
  for (const ext of (process.env.OOS_WRITER_FORMATEN || "odt,doc").split(",")) {
    for (const naam of (process.env.OOS_WRITER_GEVALLEN || "D1,D2,D3").split(
      ",",
    )) {
      it(`${naam}: ${ext} → edit → ${ext}`, async () => {
        const report: Record<string, unknown> = {
          naam,
          ext,
          pass: false,
          controles: [],
        };
        const controles: unknown[] = report.controles as unknown[];
        try {
          const original = new Uint8Array(
            readFileSync(
              `docs/tests/documentmatrix-2026-11-06/bron/${naam}.docx`,
            ),
          );
          report.inputSha256 = hash(original);
          const seed = await converteer(original, "docx", ext);
          const sourceHash = hash(seed.bytes);
          const opened = (await bereidOpenen(`${naam}.${ext}`, seed.bytes, {
            runtimeBeschikbaar: async () => true,
            converteer: async (b, van, naar) =>
              (await converteer(b, van, naar)).bytes,
          }))!;
          report.sourceSha256 = sourceHash;
          report.rapport = opened.rapport;
          report.exportFormaat = opened.exportFormaat;
          expect(opened.exportFormaat).toBe(
            ext === "doc" ? undefined : ext === "dot" || ext === "ott" ? "docx" : ext,
          );
          expect(opened.alsNieuw).toBe(ext === "dot" || ext === "ott" ? true : undefined);
          const openedPath = join(root, `${naam}-${ext}-geopend.docx`);
          writeFileSync(openedPath, opened.bytes);
          const isOdf = ["odt", "ott", "fodt"].includes(ext);
          const baseline = kenmerken(isOdf ? seed.pad : openedPath);
          const edit = manifest[naam].bewerking;
          for (const edited of [false, true]) {
            const session = await kern.sdk.createYrsSession();
            let saved: Uint8Array;
            try {
              session.openDocx(opened.bytes, true);
              if (edited) {
                const matches = session.searchText(edit.oud, {
                  caseSensitive: true,
                });
                expect(matches).toHaveLength(1);
                const m = matches[0];
                session.replaceRange(
                  {
                    story: m.story,
                    start: { paraId: m.paraId, offset: m.start },
                    end: { paraId: m.paraId, offset: m.end },
                  },
                  edit.nieuw,
                );
              }
              saved = await werkEigenschappenBij(
                {},
                null,
                (await kern.sdk.saveYrsDocx(session)).bytes,
                true,
              );
            } finally {
              session.destroy();
            }
            const exported = await converteer(saved!, "docx", ext);
            const back = await converteer(exported.bytes, ext, "docx");
            const actual = kenmerken(isOdf ? exported.pad : back.pad);
            const expected = baseline.texts
              .map((t) => (edited ? t.replace(edit.oud, edit.nieuw) : t))
              .sort();
            controles.push({
              edited,
              outputSha256: hash(exported.bytes),
              backSha256: hash(back.bytes),
              features: actual.features,
              textPreserved:
                JSON.stringify(actual.texts) === JSON.stringify(expected),
            });
            expect(actual.texts, "paragraph text preservation").toEqual(
              expected,
            );
            expect(actual.features, "feature counts").toEqual(
              baseline.features,
            );
            const reopened = await kern.sdk.createYrsSession();
            try {
              reopened.openDocx(back.bytes, true);
              expect(
                reopened.searchText(edited ? edit.nieuw : edit.oud, {
                  caseSensitive: true,
                }),
              ).toHaveLength(1);
            } finally {
              reopened.destroy();
            }
          }
          expect(hash(seed.bytes)).toBe(sourceHash);
          report.pass = true;
        } catch (e) {
          report.error = String(e);
          throw e;
        } finally {
          writeFileSync(
            join(root, `${naam}-${ext}-rapport.json`),
            JSON.stringify(report, null, 2),
          );
        }
      });
    }
  }
});
