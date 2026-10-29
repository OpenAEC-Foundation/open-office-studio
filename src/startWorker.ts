/**
 * Start een module-worker. In de SuperCloud-werkplek draait de app in een opaque sandbox (oorsprong "null"); daar mag
 * `new Worker(url)` geen script van de server laden. Dan start de worker via een data-URL die het script importeert
 * (de server levert de bundel met `Access-Control-Allow-Origin`, zoals de werkplek voor modulescripts al vereist).
 *
 * `url` komt uit een import met `?worker&url`, zodat Vite de worker bouwt.
 */
export function startWorker(url: string, opties: WorkerOptions = {}): Worker {
  const absoluut = new URL(url, import.meta.url).href;
  try {
    return new Worker(absoluut, { ...opties, type: "module" });
  } catch (fout) {
    if (!(fout instanceof DOMException) || fout.name !== "SecurityError") throw fout;
    // Een blob-worker uit een opaque oorsprong start niet; een data-URL wel.
    const bron = `import ${JSON.stringify(absoluut)};`;
    return new Worker(`data:text/javascript;charset=utf-8,${encodeURIComponent(bron)}`, {
      ...opties,
      type: "module",
    });
  }
}
