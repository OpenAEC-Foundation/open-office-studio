/**
 * Verliesvrije Writer-referentie uit een afzonderlijke webbundel en browser.
 * Gebruikt uitsluitend een eigen tijdelijk profiel en eigen luisterpoorten.
 * Bedieningshandelingen sluiten meldingen; geen DOM- of beeldinhoud wordt weggehaald.
 * De opgegeven bundelversie wordt gecontroleerd; een versie is geen buildattest.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, extname, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const [webmap, browserpad, uitvoermap] = process.argv.slice(2);
if (!webmap || !browserpad || !uitvoermap) {
    throw new Error('Gebruik: node native/scripts/maak-webreferentie.mjs <webbundel> <Chromium> <uitvoermap>; vereist Node 24 met WebSocket.');
}
const repo = fileURLToPath(new URL('../../', import.meta.url));
const basis = resolve(webmap), uit = resolve(uitvoermap);
await mkdir(uit, { recursive: true });
const bron = join(repo, 'docs/voorbeelden/Ontwerpnotitie.docx');
const referentie = JSON.parse(await readFile(join(repo, 'native/docs/migratie.json'), 'utf8')).referentie;
const index = await readFile(join(basis, 'index.html'), 'utf8');
const bundelbestanden = {};
for (const pad of ['index.html', ...Array.from(index.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g), m => m[1].slice(2))]) {
    const bytes = await readFile(join(basis, pad));
    bundelbestanden[pad] = createHash('sha256').update(bytes).digest('hex');
    if (pad.endsWith('.js') && !bytes.toString().includes(referentie.versie))
        throw new Error('Webbundel vermeldt niet de vastgelegde referentieversie');
}
const profiel = await mkdtemp(join(tmpdir(), 'office-pixelreferentie-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => { try {
    let pad = resolve(basis, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const relatief = relative(basis, pad);
    if (relatief === '..' || relatief.startsWith('..' + sep) || isAbsolute(relatief)) {
        res.writeHead(403); res.end(); return;
    }
    if (relatief === '') pad = join(basis, 'index.html');
    if ((await stat(pad)).isDirectory())
        pad = join(pad, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[extname(pad)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
    res.end(await readFile(pad));
}
catch {
    res.writeHead(404);
    res.end();
} });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = spawn(resolve(browserpad), ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profiel}`, '--no-first-run', '--no-default-browser-check', '--lang=nl-NL', 'about:blank'], { stdio: 'ignore' });
const wacht = ms => new Promise(r => setTimeout(r, ms));
let ws;
const fouten = [];
try {
    let poort;
    for (let i = 0; i < 120; i++) {
        try {
            poort = Number((await readFile(join(profiel, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
            break;
        }
        catch {
            await wacht(100);
        }
    }
    if (!poort)
        throw new Error('Eigen testbrowser niet gestart');
    const tab = await (await fetch(`http://127.0.0.1:${poort}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, f) => { ws.onopen = r; ws.onerror = f; });
    const taken = new Map();
    let n = 0;
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.method === 'Runtime.exceptionThrown')
        fouten.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); if (d.id) {
        const t = taken.get(d.id);
        if (t) {
            taken.delete(d.id);
            clearTimeout(t.timer);
            d.error ? t.f(new Error(JSON.stringify(d.error))) : t.r(d.result);
        }
    } };
    const cdp = (method, params = {}) => new Promise((r, f) => { const id = ++n; const timer = setTimeout(() => { taken.delete(id); f(new Error('Tijdslimiet ' + method)); }, 60000); taken.set(id, { r, f, timer }); ws.send(JSON.stringify({ id, method, params })); });
    const js = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails)
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Animation.enable');
    await cdp('Animation.setPlaybackRate', { playbackRate: 0 });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1058, height: 892, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.setItem("openaec-office-instellingen", JSON.stringify({taal:"nl",thema:"forge"}));' });
    await cdp('Page.navigate', { url });
    for (let i = 0; i < 160; i++) {
        if (await js('!!document.querySelector("input[type=file]")'))
            break;
        await wacht(200);
    }
    const { root } = await cdp('DOM.getDocument');
    const { nodeIds } = await cdp('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type="file"]' });
    if (!nodeIds.length)
        throw new Error('Bestandsinvoer ontbreekt: ' + JSON.stringify({ fouten, dom: await js('({tekst:document.body.innerText,html:document.documentElement.outerHTML.slice(0,1200)})') }));
    await cdp('DOM.setFileInputFiles', { nodeId: nodeIds[0], files: [bron] });
    for (let i = 0; i < 180; i++) {
        if (await js('document.body.textContent.replace(/\\s/g, "").includes("Ruimtevooridee")'))
            break;
        if (i === 179)
            throw new Error('Writer-document niet zichtbaar: ' + await js('document.body.innerText.slice(-700)'));
        await wacht(250);
    }
    await js('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    await wacht(1500);
    await js('document.querySelectorAll(".office-melding-sluiten").forEach(b=>b.click()); document.activeElement?.blur();');
    await wacht(400);
    const scherm = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const bytes = Buffer.from(scherm.data, 'base64');
    await writeFile(join(uit, 'writer-web-referentie-verliesvrij.png'), bytes);
    await wacht(750);
    const tweede = Buffer.from((await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })).data, 'base64');
    await writeFile(join(uit, 'writer-web-referentie-herhaald.png'), tweede);
    const gegevens = { referentieversie: referentie.versie, referentiecommit: referentie.commit, bundelbestanden, methode: 'Chromium Page.captureScreenshot format png, geen JPEG-conversie', animaties: 'Animation.setPlaybackRate 0 vóór navigatie; vaste knipperfase, geen beeldbewerking', viewport: { breedte: 1058, hoogte: 892, schaal: 1 }, thema: 'forge', taal: 'nl', bron: 'docs/voorbeelden/Ontwerpnotitie.docx', bron_sha256: createHash('sha256').update(await readFile(bron)).digest('hex'), beeld_sha256: createHash('sha256').update(bytes).digest('hex'), herhaalde_png_bytes_gelijk: bytes.equals(tweede), browser: await cdp('Browser.getVersion'), fouten, dom: await js('({titel:document.title,tekst:document.body.innerText.slice(0,550),breedte:innerWidth,hoogte:innerHeight,scroll:[scrollX,scrollY],thema:document.querySelector(".office")?.getAttribute("data-office-thema"),actief:document.activeElement?.tagName})') };
    await writeFile(join(uit, 'writer-web-referentie-verliesvrij.json'), JSON.stringify(gegevens, null, 2) + '\n');
    console.log(JSON.stringify(gegevens, null, 2));
}
finally {
    ws?.close();
    if (browser.exitCode === null) {
        const gestopt = new Promise(r => browser.once('exit', r));
        browser.kill();
        await gestopt;
    }
    await new Promise(r => server.close(r));
    await rm(profiel, { recursive: true, force: true });
}
