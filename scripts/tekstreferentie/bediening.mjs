import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
export async function verbind() {
  const meta = JSON.parse(
    await readFile(
      process.env.OOS_DOCX_REFERENTIE_UIT + "/browser.json",
      "utf8",
    ),
  );
  const doelen = await (
    await fetch(`http://127.0.0.1:${meta.port}/json/list`)
  ).json();
  const d = doelen.find((x) => x.type === "page");
  assert(d);
  const ws = new WebSocket(d.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let nummer = 0;
  const lopend = new Map(),
    events = [];
  const call = (method, params = {}) =>
    new Promise((r, j) => {
      const id = ++nummer;
      const t = setTimeout(() => {
        lopend.delete(id);
        j(Error("CDP timeout " + method));
      }, 20000);
      lopend.set(id, { r, j, t });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.onmessage = (e) => {
    const b = JSON.parse(e.data);
    if (b.id && lopend.has(b.id)) {
      const { r, j, t } = lopend.get(b.id);
      clearTimeout(t);
      lopend.delete(b.id);
      b.error ? j(Error(JSON.stringify(b.error))) : r(b.result);
    }
    if (b.method) {
      events.push(b);
      if (b.method === "Fetch.requestPaused") {
        const p = b.params;
        void call(
          p.request.url.startsWith(meta.url + "/")
            ? "Fetch.continueRequest"
            : "Fetch.failRequest",
          p.request.url.startsWith(meta.url + "/")
            ? { requestId: p.requestId }
            : { requestId: p.requestId, errorReason: "BlockedByClient" },
        );
      }
    }
  };
  const ev = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description ??
          JSON.stringify(r.exceptionDetails),
      );
    return r.result?.value;
  };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const wacht = async (e, ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(e)) return;
      await pause(100);
    }
    throw Error("Niet gereed: " + e);
  };
  const klik = async (sel, tekst) => {
    const p = await ev(
      `(()=>{const a=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0${tekst === undefined ? "" : `&&e.textContent.trim()===${JSON.stringify(tekst)}`});if(a.length!==1)throw Error('Aantal doelen '+a.length+' '+${JSON.stringify(sel)});const r=a[0].getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...p,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...p,
    });
    await pause(100);
  };
  const key = async (key, code = key, modifiers = 0) => {
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      modifiers,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      modifiers,
    });
    await pause(100);
  };
  const veld = async (sel, v) => {
    await klik(sel);
    await key("a", "KeyA", 2);
    await call("Input.insertText", { text: v });
    await wacht(
      `document.querySelector(${JSON.stringify(sel)}).value===${JSON.stringify(v)}`,
    );
  };
  const scherm = async (naam) => {
    const r = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(
      process.env.OOS_DOCX_REFERENTIE_UIT + "/" + naam,
      Buffer.from(r.data, "base64"),
    );
  };
  const bestand = async (pad) => {
    const { root } = await call("DOM.getDocument");
    const { nodeId } = await call("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: "input[type=file]",
    });
    assert(nodeId);
    await call("DOM.setFileInputFiles", { nodeId, files: [pad] });
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Fetch.enable", { patterns: [{ urlPattern: "http*" }] });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return {
    meta,
    call,
    ev,
    pause,
    wacht,
    klik,
    key,
    veld,
    scherm,
    bestand,
    events,
    sluit: () => ws.close(),
  };
}
