import { verbind } from "./bediening.mjs";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const i = await verbind(),
  root = resolve(process.env.OOS_DOCX_REFERENTIE_UIT),
  out = join(root, "matrix");
await mkdir(join(root, "downloads"), { recursive: true });
await mkdir(join(out, "bron"), { recursive: true });
await mkdir(join(out, "uitvoer"), { recursive: true });
const manifest = JSON.parse(
  await readFile(join(out, "bron/manifest.json"), "utf8"),
);

const sha = (b) => createHash("sha256").update(b).digest("hex");
const staat = () =>
  i.ev(
    "JSON.parse(document.querySelector('[data-testid=toestand]').textContent)",
  );
async function laad(pad) {
  await i.bestand(pad);
  await i.wacht(
    "JSON.parse(document.querySelector('[data-testid=toestand]').textContent).gereed===1",
    60000,
  );
  await i.ev("(async()=>{await document.fonts.ready;return true})()");
  await i.pause(350);
  const s = await staat();
  assert.equal(s.fout, "");
  return s;
}
async function download(actie, naam) {
  const start = i.events.length;
  await actie();
  let e;
  const einde = Date.now() + 40000;
  while (Date.now() < einde) {
    e = i.events
      .slice(start)
      .find(
        (x) =>
          x.method === "Browser.downloadProgress" &&
          x.params.state === "completed",
      );
    if (e) break;
    await i.pause(100);
  }
  assert(e, "Geen voltooide browserdownload");
  const pad = join(out, "uitvoer", naam + ".docx");
  await copyFile(join(root, "downloads", e.params.guid), pad);
  return pad;
}
async function vervang(oud, nieuw) {
  const p = await i.ev(
    `(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),a=[];while(w.nextNode()){const n=w.currentNode,j=n.textContent.indexOf(${JSON.stringify(oud)});if(j<0)continue;const r=document.createRange();r.setStart(n,j);r.setEnd(n,j+${oud.length});const b=r.getBoundingClientRect();if(b.x>=0&&b.y>=52&&b.bottom<=1000)a.push({x:b.x+0.2,y:b.y+b.height/2,eind:b.right-0.2})}if(a.length!==1)throw Error('Aantal zichtbare tekstdoelen '+a.length);return a[0]})()`,
  );
  await i.call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    buttons: 1,
    clickCount: 1,
    x: p.x,
    y: p.y,
  });
  for (let n = 1; n <= 12; n++)
    await i.call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      button: "left",
      buttons: 1,
      x: p.x + ((p.eind - p.x) * n) / 12,
      y: p.y,
    });
  await i.call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    clickCount: 1,
    x: p.eind,
    y: p.y,
  });
  await i.call("Input.insertText", { text: nieuw });
  await i.wacht(`document.body.innerText.includes(${JSON.stringify(nieuw)})`);
  await i.wacht(
    "JSON.parse(document.querySelector('[data-testid=toestand]').textContent).wijzigingen>0",
  );
  assert(
    (await staat()).wijzigingen > 0,
    "Geen wijzigingssignaal na echte invoer",
  );
}
const resultaten = [],
  bediening = [];
try {
  await i.call("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: join(root, "downloads"),
    eventsEnabled: true,
  });
  await i.call("Page.navigate", { url: i.meta.url });
  await i.wacht("!!document.querySelector('input[type=file]')");
  for (const geval of ["D1", "D2", "D3"]) {
    const info = manifest[geval],
      bron = join(out, "bron", geval + ".docx"),
      bytes = await readFile(bron);
    const begin = await laad(bron);
    assert.equal(
      begin.wijzigingen,
      0,
      "Openen geeft een vals wijzigingssignaal",
    );
    const noop = await download(
      () => i.klik("button", "Proefkopie opslaan"),
      geval + "-folio-noop",
    );
    const naNoop = await staat();
    assert.equal(
      naNoop.opslagverzoeken,
      0,
      "Serialiseren roept de hostopslag opnieuw aan",
    );
    assert.equal(
      naNoop.wijzigingen,
      0,
      "Opslaan zonder bewerking geeft een vals wijzigingssignaal",
    );
    await laad(noop);
    await i.scherm(geval + "-folio-noop.png");
    resultaten.push({
      geval,
      route: "folio-browser (oorspronkelijke Y-app-adapter)",
      engine: "folio-react0.26.0/core0.58.5/docx-core0.36.2",
      actie: "noop",
      bronhash: sha(bytes),
      resulthash: sha(await readFile(noop)),
      uitvoer: "uitvoer/" + geval + "-folio-noop.docx",
      heropend: true,
    });
    await vervang(info.bewerking.oud, info.bewerking.nieuw);
    const voorOpslaan = await staat();
    const bewerkt = await download(
      () => i.klik("button", "Proefkopie opslaan"),
      geval + "-folio-bewerking",
    );
    const naOpslaan = await staat();
    assert.equal(
      naOpslaan.opslagverzoeken,
      0,
      "Serialiseren roept de hostopslag opnieuw aan",
    );
    assert.equal(
      naOpslaan.wijzigingen,
      voorOpslaan.wijzigingen,
      "De opslag voegt een vals wijzigingssignaal toe",
    );
    await laad(bewerkt);
    await i.wacht(
      `document.body.innerText.includes(${JSON.stringify(info.bewerking.nieuw)})`,
    );
    await i.scherm(geval + "-folio-heropend.png");
    resultaten.push({
      geval,
      route: "folio-browser (oorspronkelijke Y-app-adapter)",
      engine: "folio-react0.26.0/core0.58.5/docx-core0.36.2",
      actie: "bewerking",
      bronhash: sha(bytes),
      resulthash: sha(await readFile(bewerkt)),
      uitvoer: "uitvoer/" + geval + "-folio-bewerking.docx",
      heropend: true,
    });
    bediening.push({
      geval,
      begin,
      naNoop,
      voorOpslaan,
      naOpslaan,
      heropend: await staat(),
    });
    await writeFile(
      join(out, "resultaten.json"),
      JSON.stringify(resultaten, null, 2) + "\n",
    );
    await writeFile(
      join(out, "bediening.json"),
      JSON.stringify(bediening, null, 2) + "\n",
    );
    console.log(geval, "GESLAAGD");
  }
  const extern = i.events
    .filter(
      (x) =>
        x.method === "Fetch.requestPaused" &&
        !x.params.request.url.startsWith(i.meta.url + "/"),
    )
    .map((x) => x.params.request.url);
  const fouten = i.events
    .filter((x) => x.method === "Runtime.exceptionThrown")
    .map((x) => x.params.exceptionDetails);
  await writeFile(
    join(out, "browser.json"),
    JSON.stringify({ extern, fouten }, null, 2) + "\n",
  );
  assert.deepEqual(extern, []);
  assert.deepEqual(fouten, []);
} catch (e) {
  await i.scherm("fout.png");
  await writeFile(
    join(out, "deelresultaten.json"),
    JSON.stringify({ resultaten, bediening, fout: String(e) }, null, 2) + "\n",
  );
  throw e;
} finally {
  i.sluit();
}
