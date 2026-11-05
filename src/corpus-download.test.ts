import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/corpus-download.mjs", import.meta.url));
const bytes = Buffer.from("Eigen corpusproef met vaste inhoud.\n");
const gitSha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const sha256 = createHash("sha256").update(bytes).digest("hex");

async function proef(statussen: number[], opties: { cache?: boolean; verkeerdGit?: boolean; verkeerdSha?: boolean; gedeeltelijk?: boolean } = {}) {
  const map = await mkdtemp(join(tmpdir(), "office-corpusproef-"));
  let verzoeken = 0;
  const server = createServer((vraag, antwoord) => {
    verzoeken++;
    antwoord.statusCode = vraag.url === "/ontbrekend" ? 404 : statussen[Math.min(verzoeken - 1, statussen.length - 1)];
    antwoord.end(antwoord.statusCode === 200 ? bytes : "Tijdelijk of ontbrekend");
  });
  try {
    await new Promise<void>(klaar => server.listen(0, "127.0.0.1", klaar));
    const adres = server.address();
    if (!adres || typeof adres === "string") throw Error("Eigen proefserver ontbreekt");
    const bestand = { id: "eigen-proef", extensie: "docx", gitSha: opties.verkeerdGit ? "0".repeat(40) : gitSha,
      sha256: opties.verkeerdSha ? "0".repeat(64) : sha256, url: `http://127.0.0.1:${adres.port}/bron` };
    await writeFile(join(map, "manifest.json"), JSON.stringify({ bestanden: [bestand,
      ...(opties.gedeeltelijk ? [{ ...bestand, id: "ontbrekend", url: `http://127.0.0.1:${adres.port}/ontbrekend` }] : [])] }));
    if (opties.cache) {
      await mkdir(join(map, ".local/corpus/bestanden"), { recursive: true });
      await writeFile(join(map, ".local/corpus/bestanden/eigen-proef.docx"), bytes);
    }
    const uit = await new Promise<{ code: number | null; tekst: string }>((klaar, fout) => {
      const kind = spawn(process.execPath, [script, "manifest.json"], { cwd: map, stdio: ["ignore", "pipe", "pipe"], timeout: 10000, killSignal: "SIGKILL" });
      let tekst = "";
      kind.stdout.on("data", data => { tekst += data; });
      kind.stderr.on("data", data => { tekst += data; });
      kind.on("error", fout);
      kind.on("close", code => klaar({ code, tekst }));
    });
    const manifest = JSON.parse(await readFile(join(map, ".local/corpus/manifest.json"), "utf8"));
    let bewaard: Buffer | undefined;
    try { bewaard = await readFile(join(map, ".local/corpus/bestanden/eigen-proef.docx")); } catch {}
    return { ...uit, verzoeken, manifest, bewaard };
  } finally {
    await new Promise<void>((klaar, fout) => server.close(e => e ? fout(e) : klaar()));
    await rm(map, { recursive: true, force: true });
  }
}

describe("verplichte corpusdownload via de echte opdrachtregel", () => {
  it("herstelt twee tijdelijke netwerkfouten en bewaart alleen de gecontroleerde inhoud", async () => {
    const r = await proef([503, 503, 200]);
    expect(r.code).toBe(0);
    expect(r.verzoeken).toBe(3);
    expect(r.bewaard).toEqual(bytes);
    expect(r.manifest.bestanden[0]).toMatchObject({ status: "opgehaald", gitSha, sha256 });
  });
  it("keurt een ontbrekend verplicht bestand af zonder zinloze herhaling", async () => {
    const r = await proef([404]);
    expect(r.code).toBe(1);
    expect(r.verzoeken).toBe(1);
    expect(r.bewaard).toBeUndefined();
    expect(r.manifest.bestanden[0]).toMatchObject({ status: "downloadfout", fout: "Error: HTTP 404" });
  });
  it("begrenst drie tijdelijke afkeuringen en bewaart de fout in het manifest", async () => {
    const r = await proef([503]);
    expect(r.code).toBe(1);
    expect(r.verzoeken).toBe(3);
    expect(r.manifest.bestanden[0]).toMatchObject({ status: "downloadfout", fout: "Error: HTTP 503" });
  });
  it("bewaart een afwijkende bron niet en probeert een inhoudsfout niet opnieuw", async () => {
    const r = await proef([200], { verkeerdGit: true });
    expect(r.code).toBe(1);
    expect(r.verzoeken).toBe(1);
    expect(r.bewaard).toBeUndefined();
    expect(r.manifest.bestanden[0].status).toBe("downloadfout");
  });
  it("controleert ook de vastgelegde SHA-256 van een geldige lokale Git-bron", async () => {
    const r = await proef([200], { cache: true, verkeerdSha: true });
    expect(r.code).toBe(1);
    expect(r.verzoeken).toBe(0);
    expect(r.manifest.bestanden[0].fout).toContain("SHA-256");
  });
  it("accepteert een reeds gecontroleerd bestand zonder netwerkverzoek", async () => {
    const r = await proef([503], { cache: true });
    expect(r.code).toBe(0);
    expect(r.verzoeken).toBe(0);
    expect(r.bewaard).toEqual(bytes);
  });
  it("keurt ook een gedeeltelijk geslaagd verplicht manifest af", async () => {
    const r = await proef([200], { gedeeltelijk: true });
    expect(r.code).toBe(1);
    expect(r.manifest.bestanden.map((b: { status: string }) => b.status)).toEqual(["opgehaald", "downloadfout"]);
    expect(r.tekst).toContain("Het verplichte corpus is onvolledig");
  });
});
