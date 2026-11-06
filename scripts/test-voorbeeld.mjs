/** Werkelijke pakketproef: npm-tarball → losse host → statische HTTP → Chromium. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";

const uit = await mkdtemp(resolve(".local/voorbeeldproef-"));
const pakketMap = join(uit, "pakket");
const app = join(uit, "host");
await mkdir(pakketMap);
await mkdir(join(app, "public"), { recursive: true });
const env = {
  ...process.env,
  PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
};
function opdracht(naam, args, opties = {}) {
  const resultaat = spawnSync(naam, args, { encoding: "utf8", env, ...opties });
  assert.equal(
    resultaat.status,
    0,
    `${naam}: ${resultaat.error?.message ?? ""}\n${resultaat.stderr}\n${resultaat.stdout}`,
  );
  return resultaat.stdout;
}
const npmCli = process.env.NPM_CLI;
const tar = JSON.parse(
  opdracht(
    npmCli ? process.execPath : "npm",
    [
      ...(npmCli ? [npmCli] : []),
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      uit,
    ],
    { cwd: resolve("packages/voorbeeld") },
  ),
)[0];
opdracht("tar", ["-xf", join(uit, tar.filename), "-C", pakketMap]);
const pakket = join(pakketMap, "package");
const { kopieerVoorbeeldAssets } = await import(
  pathToFileURL(join(pakket, "kopieer-assets.mjs"))
);
await kopieerVoorbeeldAssets(join(app, "public", "openaec-voorbeeld"));

// Twee werkelijk bruikbare werkbladen: tweede tab heeft een onderscheidende cel.
const xlsx = unzipSync(
  new Uint8Array(await readFile("docs/voorbeelden/Materiaaloverzicht.xlsx")),
);
xlsx["xl/workbook.xml"] = strToU8(
  strFromU8(xlsx["xl/workbook.xml"]).replace(
    "</sheets>",
    '<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="Tweede blad" sheetId="2" r:id="rIdProef"/></sheets>',
  ),
);
xlsx["xl/_rels/workbook.xml.rels"] = strToU8(
  strFromU8(xlsx["xl/_rels/workbook.xml.rels"]).replace(
    "</Relationships>",
    '<Relationship Id="rIdProef" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  ),
);
xlsx["[Content_Types].xml"] = strToU8(
  strFromU8(xlsx["[Content_Types].xml"]).replace(
    "</Types>",
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  ),
);
xlsx["xl/worksheets/sheet2.xml"] = strToU8(
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Tweede werkblad zichtbaar</t></is></c></row></sheetData></worksheet>',
);
await writeFile(join(app, "public", "proef.xlsx"), zipSync(xlsx));
await cp(
  "docs/voorbeelden/Ontwerpnotitie.docx",
  join(app, "public", "proef.docx"),
);
await cp(
  "docs/voorbeelden/Ontwerpvisie.pptx",
  join(app, "public", "proef.pptx"),
);
await writeFile(
  join(app, "public", "proef.odt"),
  zipSync({ mimetype: strToU8("application/vnd.oasis.opendocument.text") }),
);
await writeFile(
  join(app, "public", "proef.doc"),
  new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
);
await writeFile(
  join(app, "public", "proef.onbekend"),
  strToU8("Een gewoon tekstbestand"),
);
await writeFile(
  join(app, "public", "proef.kapot"),
  zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8("<fout>"),
  }),
);
await writeFile(
  join(app, "index.html"),
  '<!doctype html><html><head><title>Losse pakketproef</title><style>.kantoorvoorbeeld,canvas{display:none}</style></head><body><div id="app"></div><script type="module" src="./main.tsx"></script></body></html>',
);
await writeFile(
  join(app, "main.tsx"),
  `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { KantoorVoorbeeld } from '@openaec/voorbeeld';
window.proef = { status: [], bronnen: [], afgebroken: 0 };
function Host() {
 const [props, zetProps] = useState(null);
 window.proef.open = (soort, opties={}) => {
  const bron = {bestandsnaam:'proef.'+soort, grootte:opties.grootte,
   laad: async (signal) => {
    if(opties.wacht) await new Promise((r,j)=> { const t=setTimeout(r,opties.wacht); if(!opties.negeerAbort)signal.addEventListener('abort',()=>{clearTimeout(t);window.proef.afgebroken++;j(new Error('afgebroken'));},{once:true}); });
    if(opties.fout) throw new Error('geweigerde bijlage');
    const r=await fetch((opties.prive?'./private/':'./')+'proef.'+soort, {signal:opties.negeerAbort?undefined:signal,credentials:'same-origin'}); if(!r.ok) throw new Error('bijlage niet beschikbaar');
    const bytes=new Uint8Array(await r.arrayBuffer()); window.proef.bronnen.push({bytes, origineel:bytes.slice()}); return bytes;
   }};
  window.proef.status=[]; window.proef.begonnen=performance.now();
  zetProps({bron,assetBasis:opties.assetBasis??'./openaec-voorbeeld/',laadTimeoutMs:opties.timeout??90000,maxBytes:opties.maxBytes??67108864});
 };
 window.proef.sluit=()=>zetProps(null);
 return <><h1>Zelfstandige kantoorvoorbeelden</h1><p id="host-sentinel">Host blijft bruikbaar</p>
  {['docx','xlsx','pptx'].map(s=><button key={s} onClick={()=>window.proef.open(s)}>{s.toUpperCase()}</button>)}
  {props&&<KantoorVoorbeeld {...props} style={{height:730}} onStatus={s=>window.proef.status.push({soort:s.soort,formaat:s.formaat,fout:s.fout?.message,ms:performance.now()-window.proef.begonnen})}/>}</>;
}
createRoot(document.getElementById('app')).render(<Host/>);
`,
);
await build({
  configFile: false,
  root: app,
  base: "./",
  logLevel: "warn",
  resolve: {
    alias: {
      "@openaec/voorbeeld": join(pakket, "dist", "index.js"),
    },
  },
  build: { outDir: join(uit, "site"), emptyOutDir: true },
});

const chromeBasis = join(homedir(), ".cache/ms-playwright");
let chrome = process.env.CHROME_PAD;
const browserMappen = chrome ? [] : await readdir(chromeBasis).catch(() => []);
for (const naam of browserMappen.sort().reverse()) {
  if (chrome) break;
  for (const relatief of [
    "chrome-linux64/chrome",
    "chrome-headless-shell-linux64/chrome-headless-shell",
  ]) {
    const p = join(chromeBasis, naam, relatief);
    try {
      await readFile(p);
      chrome = p;
      break;
    } catch {}
  }
}
assert(chrome, "Chromium ontbreekt; een browserproef is verplicht.");
const poort = Number(process.env.VOORBEELD_POORT ?? 1468),
  cdpPoort = poort + 1000;
const profiel = await mkdtemp(join(tmpdir(), "openaec-voorbeeld-"));
const verkeer = [];
const server = createServer(async (vraag, antwoord) => {
  const pad = decodeURIComponent(
    new URL(vraag.url, `http://127.0.0.1:${poort}`).pathname,
  );
  const log = { pad, bytes: 0, status: 200 };
  verkeer.push(log);
  try {
    const lokaal = pad.replace(/^\/y\//, "/");
    if (pad.startsWith("/omleiding/")) {
      log.status = 302;
      antwoord.writeHead(302, {
        Location: "/openaec-voorbeeld/frame/index.html",
      });
      antwoord.end();
      return;
    }
    if (
      lokaal.startsWith("/private/") &&
      !vraag.headers.cookie?.includes("proefrecht=ja")
    ) {
      log.status = 403;
      antwoord.writeHead(403);
      antwoord.end("Geen recht");
      return;
    }
    const relatief = lokaal.replace(/^\/private\//, "/");
    const bestand = resolve(
      join(uit, "site"),
      "." + (relatief.endsWith("/") ? relatief + "index.html" : relatief),
    );
    if (!bestand.startsWith(join(uit, "site") + "/"))
      throw new Error("Ongeldig pad");
    const bytes = await readFile(bestand);
    log.bytes = bytes.length;
    log.gzip = gzipSync(bytes).length;
    const ext = bestand.split(".").at(-1);
    antwoord.writeHead(200, {
      "Content-Type":
        {
          html: "text/html",
          js: "text/javascript",
          css: "text/css",
          wasm: "application/wasm",
          ttf: "font/ttf",
          otf: "font/otf",
        }[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    antwoord.end(bytes);
  } catch {
    log.status = 404;
    antwoord.writeHead(404);
    antwoord.end("Ontbreekt");
  }
});
await new Promise((r, j) => {
  server.once("error", j);
  server.listen(poort, "127.0.0.1", r);
});
const browser = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${cdpPoort}`,
    `--user-data-dir=${profiel}`,
    "--no-first-run",
    "--window-size=1440,1000",
    "about:blank",
  ],
  { stdio: "ignore", env },
);
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
const bewijs = {
  pakket: {
    naam: tar.filename,
    bytes: tar.size,
    uitgepakt: tar.unpackedSize,
    sha256: createHash("sha256")
      .update(await readFile(join(uit, tar.filename)))
      .digest("hex"),
  },
  uit,
  gevallen: [],
  verzoeken: [],
  fouten: [],
  verkeer,
};
try {
  async function bereikbaar(url) {
    for (let i = 0; i < 120; i++) {
      try {
        const r = await fetch(url);
        if (r.ok) return r;
      } catch {}
      await wacht(100);
    }
    throw new Error(`Geen antwoord: ${url}`);
  }
  await bereikbaar(`http://127.0.0.1:${poort}/`);
  await bereikbaar(`http://127.0.0.1:${cdpPoort}/json/version`);
  const doel = await (
    await fetch(`http://127.0.0.1:${cdpPoort}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  ws = new WebSocket(doel.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const lopend = new Map();
  ws.onmessage = (event) => {
    const b = JSON.parse(event.data);
    if (b.id && lopend.has(b.id)) {
      const { r, j, t } = lopend.get(b.id);
      clearTimeout(t);
      lopend.delete(b.id);
      b.error ? j(new Error(JSON.stringify(b.error))) : r(b.result);
    }
    if (b.method === "Network.requestWillBeSent")
      bewijs.verzoeken.push(b.params.request.url);
    if (b.method === "Runtime.exceptionThrown")
      bewijs.fouten.push(b.params.exceptionDetails);
  };
  const cdp = (method, params = {}) =>
    new Promise((r, j) => {
      const n = ++id;
      const t = setTimeout(() => {
        lopend.delete(n);
        j(new Error(`CDP-timeout ${method}`));
      }, 30000);
      lopend.set(n, { r, j, t });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const ev = async (expression) => {
    const r = await cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description ??
          JSON.stringify(r.exceptionDetails),
      );
    return r.result?.value;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__voorbeeldproef={getekend:[]};const vul=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...a){if(window.__voorbeeldproef.getekend.length<20000)window.__voorbeeldproef.getekend.push(String(t));return vul.call(this,t,...a);};`,
  });
  await cdp("Page.navigate", { url: `http://127.0.0.1:${poort}/` });
  for (
    let i = 0;
    i < 100 && !(await ev('typeof window.proef?.open==="function"'));
    i++
  )
    await wacht(100);
  assert(await ev('typeof window.proef?.open==="function"'));
  assert(
    !bewijs.verzoeken.some((u) => /\.wasm|\.ttf|\.otf|\/frame\//.test(u)),
    "Gesloten voorbeeld laadt zware assets.",
  );
  bewijs.parentGzip = gzipSync(
    await readFile(join(pakket, "dist/index.js")),
  ).length;
  assert(bewijs.parentGzip <= 8 * 1024, "Te grote hostcomponent.");
  async function open(soort, opties = {}, verwacht = "gereed") {
    const begin = bewijs.verzoeken.length;
    const beginHttp = verkeer.length;
    await ev(
      `window.proef.open(${JSON.stringify(soort)},${JSON.stringify(opties)})`,
    );
    let status;
    for (let i = 0; i < 1000; i++) {
      status = await ev("window.proef.status.at(-1)");
      if (status && status.soort !== "laden") break;
      await wacht(100);
    }
    bewijs.gevallen.push({
      soort,
      opties,
      status,
      verzoeken: bewijs.verzoeken.slice(begin),
      http: verkeer.slice(beginHttp),
    });
    console.log(JSON.stringify({ soort, opties, status }));
    assert.equal(status?.soort, verwacht, JSON.stringify(status));
    return status;
  }
  async function klikFrame(selector, tekst) {
    const punt = await ev(
      `(()=>{const f=document.querySelector('iframe'),d=f.contentDocument,e=[...d.querySelectorAll(${JSON.stringify(selector)})].find(e=>${tekst === undefined ? "true" : `e.textContent.trim()===${JSON.stringify(tekst)}`});if(!e)throw new Error('Bediening ontbreekt');const a=f.getBoundingClientRect(),b=e.getBoundingClientRect();return{x:a.x+b.x+b.width/2,y:a.y+b.y+b.height/2}})()`,
    );
    await cdp("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...punt,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...punt,
    });
  }
  for (const soort of ["docx", "xlsx", "pptx"]) {
    await open(soort);
    await wacht(1200);
    const inhoud = await ev(
      `(()=>{const f=document.querySelector('iframe'),d=f.contentDocument;return {tekst:d.body.innerText,canvas:[...d.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,zichtbaar:c.getBoundingClientRect().height>0})),inputs:[...d.querySelectorAll('input,textarea,[contenteditable=true]')].map(e=>({tag:e.tagName,type:e.type,ro:e.readOnly,disabled:e.disabled,role:e.getAttribute('role')})),getekend:f.contentWindow.__voorbeeldproef.getekend,knoppen:[...d.querySelectorAll('button')].map(e=>({tekst:e.innerText,titel:e.title,aria:e.getAttribute('aria-label')}))}})()`,
    );
    bewijs.gevallen.at(-1).inhoud = inhoud;
    const verkeerVanOpening = bewijs.gevallen
      .at(-1)
      .http.filter((r) => r.pad.includes("/openaec-voorbeeld/"));
    assert(
      verkeerVanOpening.reduce((n, r) => n + r.bytes, 0) <= 40 * 1024 * 1024,
      `${soort}: renderer overschrijdt het downloadbudget`,
    );
    const kernen = verkeerVanOpening
      .filter((r) => r.pad.endsWith(".wasm"))
      .map((r) => r.pad);
    const kernPatroon =
      soort === "docx"
        ? /docx_(edit|layout)_bg/
        : soort === "xlsx"
          ? /xlsx_wasm_bg/
          : /pptx_wasm_bg/;
    assert(
      kernen.length > 0 && kernen.every((p) => kernPatroon.test(p)),
      `${soort}: verkeerde of ontbrekende luie kern`,
    );
    assert(
      inhoud.canvas.some((c) => c.w > 300 && c.h > 100 && c.zichtbaar),
      `${soort}: geen zichtbaar documentcanvas`,
    );
    if (soort === "docx")
      assert(inhoud.tekst.replace(/\s/g, "").includes("Ruimtevoorideeën."));
    if (soort === "xlsx") {
      assert(inhoud.tekst.includes("Multiplex berken"));
      await klikFrame("button", "Tweede blad");
      await wacht(300);
      assert(
        await ev(
          `document.querySelector('iframe').contentDocument.body.innerText.includes('Tweede werkblad zichtbaar')`,
        ),
      );
      const tweede = await cdp("Page.captureScreenshot", { format: "png" });
      await writeFile(
        join(uit, "xlsx-tweede.png"),
        Buffer.from(tweede.data, "base64"),
      );
      await klikFrame("button", "Materialen");
      await wacht(300);
    }
    if (soort === "pptx") {
      assert(inhoud.getekend.includes("Samen ruimte"));
      await klikFrame("button", "2");
      await wacht(300);
      const tweede = await cdp("Page.captureScreenshot", { format: "png" });
      await writeFile(
        join(uit, "pptx-tweede.png"),
        Buffer.from(tweede.data, "base64"),
      );
      await klikFrame("button", "1");
      await wacht(300);
    }
    await klikFrame("canvas");
    await wacht(150);
    const voor = await ev(
      `document.querySelector('iframe').contentDocument.body.textContent`,
    );
    await cdp("Input.insertText", { text: "DIT_MAG_NIET_WIJZIGEN" });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Delete",
      code: "Delete",
      windowsVirtualKeyCode: 46,
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Delete",
      code: "Delete",
      windowsVirtualKeyCode: 46,
    });
    await wacht(300);
    const na = await ev(
      `document.querySelector('iframe').contentDocument.body.textContent`,
    );
    assert.equal(na, voor, `${soort}: documentinhoud veranderde na toetsen`);
    assert(
      !(await ev(
        `document.querySelector('iframe').contentWindow.__voorbeeldproef.getekend.some(t=>t.includes('DIT_MAG_NIET'))`,
      )),
    );
    bewijs.gevallen.at(-1).toetsenZonderWijziging = true;
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    await writeFile(
      join(uit, `${soort}.png`),
      Buffer.from(shot.data, "base64"),
    );
    assert(
      await ev(
        "window.proef.bronnen.every(({bytes,origineel})=>bytes.length===origineel.length&&bytes.every((b,i)=>b===origineel[i]))",
      ),
      "Bronbuffer gewijzigd of losgemaakt.",
    );
  }
  await open("odt", {}, "conversie");
  await open("doc", {}, "conversie");
  await open("onbekend", {}, "onbekend");
  await open("kapot", { timeout: 5000 }, "fout");
  await open("docx", { grootte: 100, maxBytes: 10 }, "teGroot");
  await open("docx", { maxBytes: 10 }, "teGroot");
  await open("docx", { fout: true }, "fout");
  await open("docx", { assetBasis: "./ontbreekt/", timeout: 750 }, "fout");
  await open("docx", { assetBasis: "./omleiding/", timeout: 750 }, "fout");
  await open("docx", { prive: true }, "fout");
  await ev(`document.cookie='proefrecht=ja; SameSite=Strict; path=/'`);
  await open("docx", { prive: true });
  await ev(`window.proef.open('docx',{wacht:3000})`);
  await wacht(100);
  await open("xlsx");
  assert.equal(await ev("window.proef.afgebroken"), 1);
  await ev(`window.proef.open('docx',{wacht:1200,negeerAbort:true})`);
  await wacht(100);
  await open("xlsx");
  await wacht(1400);
  assert.equal(
    await ev("window.proef.status.at(-1).formaat"),
    "xlsx",
    "Late bron vervangt huidige bijlage.",
  );
  await ev("window.proef.sluit()");
  await wacht(200);
  assert.equal(await ev('document.querySelectorAll("iframe").length'), 0);
  await cdp("Page.navigate", { url: `http://127.0.0.1:${poort}/y/` });
  for (
    let i = 0;
    i < 100 && !(await ev('typeof window.proef?.open==="function"'));
    i++
  )
    await wacht(100);
  await open("xlsx");
  assert(
    (await ev("document.querySelector('iframe').src")).includes(
      "/y/openaec-voorbeeld/frame/",
    ),
  );
  await ev("window.proef.sluit()");
  assert(
    !bewijs.verzoeken.some(
      (u) => /^https?:/.test(u) && !u.startsWith(`http://127.0.0.1:${poort}/`),
    ),
    "Voorbeeld haalt externe resources op.",
  );
  assert.equal(bewijs.fouten.length, 0, JSON.stringify(bewijs.fouten));
  bewijs.geslaagd = true;
} finally {
  await writeFile(join(uit, "controle.json"), JSON.stringify(bewijs, null, 2));
  console.log(`Bewijs: ${uit}`);
  ws?.close();
  server.closeAllConnections();
  server.close();
  browser.kill();
  await new Promise((r) =>
    browser.exitCode !== null ? r() : browser.once("exit", r),
  );
  await rm(profiel, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
