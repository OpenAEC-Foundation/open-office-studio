import { spawn, execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

/** Match the native app's safe profile, size limit and process-tree timeout. */
export async function converteerProef(
  programma,
  bron,
  ext,
  soort,
  filter,
  verslagmap,
) {
  if (!bron.length || bron.length > 100 * 1024 * 1024)
    throw new Error("Invalid input size");
  const tempBase = resolve(tmpdir());
  const map = mkdtempSync(join(tempBase, "oos-dekking-"));
  const profiel = join(map, "profiel");
  mkdirSync(join(profiel, "user"), { recursive: true });
  mkdirSync(join(map, "uit"));
  mkdirSync(verslagmap, { recursive: true });
  copyFileSync(
    "src-tauri/src/conversieprofiel.xcu",
    join(profiel, "user/registrymodifications.xcu"),
  );
  writeFileSync(join(map, `bron.${ext}`), bron);
  const begin = Date.now();
  let uitvoer = "",
    timedOut = false;
  try {
    await new Promise((done, fail) => {
      const child = spawn(
        programma,
        [
          `-env:UserInstallation=${pathToFileURL(profiel).href}`,
          "--headless",
          "--nologo",
          "--nodefault",
          "--norestore",
          "--nolockcheck",
          "--convert-to",
          `${soort}:${filter}`,
          "--outdir",
          join(map, "uit"),
          join(map, `bron.${ext}`),
        ],
        {
          windowsHide: true,
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            SAL_DISABLE_DEFAULTPRINTER: "1",
            SAL_DISABLE_PRINTERLIST: "1",
          },
        },
      );
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (b) => {
          // Logs are diagnostics, never an unbounded document-content buffer.
          if (uitvoer.length < 16_384)
            uitvoer += String(b).slice(0, 16_384 - uitvoer.length);
        });
      const timer = setTimeout(() => {
        timedOut = true;
        if (!child.pid) return;
        try {
          if (process.platform === "win32")
            execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
              timeout: 10_000,
            });
          else process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, 45_000);
      child.once("error", (e) => {
        clearTimeout(timer);
        fail(e);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (timedOut) fail(new Error("Conversion exceeded 45 seconds"));
        else if (code !== 0)
          fail(new Error(`Conversion exited with ${code}: ${uitvoer}`));
        else done();
      });
    });
    const pad = join(map, "uit", `bron.${soort}`);
    if (statSync(pad).size > 100 * 1024 * 1024)
      throw new Error("Output exceeds 100 MB");
    const bytes = new Uint8Array(readFileSync(pad));
    writeFileSync(join(verslagmap, `omgezet.${soort}`), bytes);
    return { bytes, ms: Date.now() - begin };
  } finally {
    writeFileSync(
      join(verslagmap, "conversie.json"),
      JSON.stringify(
        { ms: Date.now() - begin, timedOut, log: uitvoer },
        null,
        2,
      ),
    );
    // Validate the resolved absolute target before recursive deletion on Windows.
    if (
      dirname(resolve(map)) !== tempBase ||
      !basename(map).startsWith("oos-dekking-")
    )
      throw new Error("Unexpected temporary conversion directory");
    rmSync(map, { recursive: true, force: true });
  }
}
