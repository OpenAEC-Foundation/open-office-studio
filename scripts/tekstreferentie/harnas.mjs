import { createServer } from "node:http";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
const root = resolve(process.env.OOS_DOCX_REFERENTIE_UIT),
  site = join(root, "site");
const profiel = join(root, "chromium-profiel");
await mkdir(profiel, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const pad = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const p = resolve(site, "." + (pad === "/" ? "/index.html" : pad));
    if (!p.startsWith(site + "/")) throw Error("Pad");
    const b = await readFile(p);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".wasm": "application/wasm",
      }[extname(p)] ?? "application/octet-stream",
    );
    res.end(b);
  } catch {
    res.statusCode = 404;
    res.end("Ontbreekt");
  }
});
await new Promise((r, j) => {
  server.once("error", j);
  server.listen(0, "127.0.0.1", r);
});
const chrome = process.env.OOS_CHROMIUM;
const b = spawn(
  chrome,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profiel,
    "--no-first-run",
    "--window-size=1440,1000",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const browserEinde = new Promise((r) => b.once("exit", r));
let stoppen = false;
process.on("SIGTERM", () => (stoppen = true));
try {
  for (let n = 0; n < 150; n++) {
    try {
      await access(join(profiel, "DevToolsActivePort"));
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const port = Number(
    (await readFile(join(profiel, "DevToolsActivePort"), "utf8")).split(
      "\n",
    )[0],
  );
  await writeFile(
    join(root, "browser.json"),
    JSON.stringify(
      {
        pid: process.pid,
        browserPid: b.pid,
        port,
        url: "http://127.0.0.1:" + server.address().port,
        profiel,
        versie: execFileSync(chrome, ["--version"], { encoding: "utf8" }).trim(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log("GEREED", server.address().port, port);
  while (!stoppen) {
    try {
      await access(join(root, "klaar"));
      break;
    } catch {}
    if (b.exitCode !== null || b.signalCode !== null) throw Error("Chromium is gestopt");
    await new Promise((r) => setTimeout(r, 500));
  }
} finally {
  if (b.exitCode === null && b.signalCode === null) {
    b.kill("SIGTERM");
    const timer = setTimeout(() => b.kill("SIGKILL"), 4000);
    try { await browserEinde; } finally { clearTimeout(timer); }
  }
  await new Promise(r => server.close(r));
  await writeFile(
    join(root, "cleanup.json"),
    JSON.stringify({
      chromiumAfgesloten: b.exitCode !== null || b.signalCode !== null,
      serverAfgesloten: true,
    }) + "\n",
  );
}
