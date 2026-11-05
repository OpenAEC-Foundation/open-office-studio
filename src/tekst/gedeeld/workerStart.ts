/**
 * Laad de engine als import van een klein startscript. WebKit kan een
 * worker-ingang opnieuw uitvoeren wanneer de luie opslagmodule die ingang
 * importeert. Dan verdwijnen sessie en invoerafhandeling na de eerste opslag.
 * Als gewone import deelt de engine dezelfde modulecache met de opslagroute.
 */
function startWorker(bron: string | URL, opties?: WorkerOptions): Worker {
  const start = URL.createObjectURL(
    new Blob([`import ${JSON.stringify(String(bron))};`], {
      type: "text/javascript",
    }),
  );
  const opruimen = () => URL.revokeObjectURL(start);
  let worker: Worker;
  try {
    worker = new globalThis.Worker(start, opties);
  } catch (fout) {
    opruimen();
    throw fout;
  }
  worker.addEventListener("message", opruimen, { once: true });
  worker.addEventListener("error", opruimen, { once: true });
  const stop = worker.terminate.bind(worker);
  worker.terminate = () => {
    opruimen();
    stop();
  };
  return worker;
}

// De engine roept deze fabriek met `new Worker(new URL(...))` aan. Die vorm
// blijft herkenbaar voor de bundelaar; het resultaat is een gewone Worker.
export const TekstWorker = startWorker as unknown as typeof Worker;
