/** Explicit diagnostic-only source overlay. Never imported by the product build. */
import { createHash } from "node:crypto";

import { runtimePrelude } from "./writer359-observer-runtime.mjs";
export { runtimePrelude, readObserver, stopObserver, requestWorkerTrace } from "./writer359-observer-runtime.mjs";

export const SDK_PARTS = Object.freeze({
  "docx/dist/chunk-Y4JOXYWH.mjs": "023a22289860ebd27b14c10960930d60320977a1ba882d0da5f62227cbb9fa5a",
  "docx-react/dist/chunk-LZ2DPBZ6.mjs": "ae345c30d181b0a038a12a8057efb2351e86907bc448aff407d7ffc61c7284bd",
  "docx-react/dist/index.mjs": "d17b7a630163623e99d73b8c4b3678397ec0598e332237df1e4737767799e58d",
  "docx/dist/chunk-EOFVNRML.mjs": "3c42f4720e6911e2e51988318eecf7d3771c1b453b7fc05de52c54c2720e2fb9",
});

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("#359 SDK boundary changed; inspect before instrumenting");
  return source.replace(before, after);
}

/** Returns text only; never writes node_modules or enables itself in Vite. */
export function instrumentSdkSource(part, source, { enabled = false } = {}) {
  if (!enabled) return source;
  if (!Object.hasOwn(SDK_PARTS, part)) throw new Error("#359 unknown SDK source part");
  if (createHash("sha256").update(source).digest("hex") !== SDK_PARTS[part])
    throw new Error("#359 SDK source hash changed; no diagnostic rewrite applied");
  let result = source;
  if (part === "docx/dist/chunk-Y4JOXYWH.mjs") {
    result = replaceOnce(result, 'c=new FontFace(t,await d(),', 'oos359Trace("font-bytes-start");const oos359Bytes=await d();oos359Trace("font-bytes-ready",{bytes:oos359Bytes.byteLength});c=new FontFace(t,oos359Bytes,');
    result = replaceOnce(result, 'document.fonts.add(c),await c.load(),f&&x.push(c),!0', 'document.fonts.add(c),oos359Trace("font-registered",{alreadyLoaded:f}),await c.load(),oos359Trace("font-loaded"),f&&x.push(c),!0');
    result = replaceOnce(result, '}catch(f){return c&&document.fonts.delete(c),', '}catch(f){return oos359Trace("font-failed"),c&&document.fonts.delete(c),');
    result = replaceOnce(result, 'let e=x;x=[],document.fonts.dispatchEvent', 'let e=x;x=[],oos359Trace("font-loadingdone-dispatch",{count:e.length}),document.fonts.dispatchEvent');
  } else if (part === "docx-react/dist/chunk-LZ2DPBZ6.mjs") {
    result = replaceOnce(result, 'function Pi(e,t,o){hs.set(e,t);', 'function Pi(e,t,o){oos359Trace("frame-published",{pages:t?.pages?.length,worker:o?.worker===true});hs.set(e,t);');
    result = replaceOnce(result, 'c.attach(Re,Le,ee,i,Oe).then(Ne=>{', '(oos359Trace("worker-attach-start",{surfaces:Re.length,pages:Le.length,dpr:ee,zoom:i}),c.attach(Re,Le,ee,i,Oe)).then(Ne=>{oos359Trace("worker-attach-return",{accepted:Ne===true});');
  } else if (part === "docx-react/dist/index.mjs") {
    result = replaceOnce(result, 'sr=()=>{if($n===Ve.current)try{ir?.();}', 'sr=()=>{if($n===Ve.current)try{oos359Trace("first-page-callback");ir?.();}');
  } else {
    result = replaceOnce(result, 'function ni(e,n,t){let i=c(n),', 'function ni(e,n,t){oos359Trace("glyph-run-enter",{glyphs:n.glyphs.length,cache:!!t,fontId:n.fontId});let i=c(n),');
    result = replaceOnce(result, 'r&&e.restore();return}catch(o){Zt(o);}ti(e,n),r&&e.restore();', 'r&&e.restore();oos359Trace("glyph-outlines-return");return}catch(o){Zt(o);}oos359Trace("glyph-fallback",{cache:!!t}),ti(e,n),r&&e.restore();');
  }
  return runtimePrelude() + result;
}

/** A future isolated CI config must register this BEFORE existing SDK adapters. */
export function writer359DiagnosticPlugin({ enabled = false } = {}) {
  return {
    name: "writer359-diagnostic-only",
    enforce: "pre",
    transform(source, id) {
      if (!enabled) return;
      const path = id.replaceAll("\\", "/").split("?")[0];
      const part = Object.keys(SDK_PARTS).find(p => path.endsWith(`/@betteroffice/${p}`));
      if (part) return { code: instrumentSdkSource(part, source, { enabled: true }), map: null };
    },
  };
}
