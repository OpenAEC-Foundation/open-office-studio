/**
 * Laad de engine als import van een klein startscript. WebKit kan een
 * worker-ingang opnieuw uitvoeren wanneer de luie opslagmodule die ingang
 * importeert. Dan verdwijnen sessie en invoerafhandeling na de eerste opslag.
 * Als gewone import deelt de engine dezelfde modulecache met de opslagroute.
 */
const werkers = new Set<Worker>();
const taken = new WeakMap<Worker, { klaar: Promise<void>; stop: () => void }>();
let opslagVoorbereiden = false;

function bereidWorkerVoor(worker: Worker): Promise<void> {
  const bestaand = taken.get(worker);
  if (bestaand) return bestaand.klaar;
  const kanaal = new MessageChannel();
  let stop!: () => void;
  const klaar = new Promise<void>((resolve, reject) => {
    const einde = (fout?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("error", mis);
      kanaal.port1.close(); kanaal.port2.close();
      if (fout) reject(fout); else resolve();
    };
    const mis = () => einde(new Error("De tekstworker kon opslag niet voorbereiden."));
    const timer = setTimeout(mis, 15_000);
    stop = () => einde(new Error("De tekstworker is gesloten tijdens opslagvoorbereiding."));
    kanaal.port1.onmessage = (event) => event.data?.ok === true
      ? einde()
      : einde(new Error(String(event.data?.fout ?? "Opslagvoorbereiding mislukt.")));
    worker.addEventListener("error", mis, { once: true });
    try { worker.postMessage({ openaec: "prepare-save-v1" }, [kanaal.port2]); }
    catch (fout) { einde(fout instanceof Error ? fout : new Error(String(fout))); }
  });
  taken.set(worker, { klaar, stop });
  void klaar.catch(() => { if (taken.get(worker)?.klaar === klaar) taken.delete(worker); });
  return klaar;
}

/** Alleen de bewerkende app vraagt dit aan; de zelfstandige viewer blijft lui laden. */
export async function bereidTekstWerkersOpslagVoor(): Promise<void> {
  opslagVoorbereiden = true;
  await Promise.all([...werkers].map(bereidWorkerVoor));
}

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
  werkers.add(worker);
  if (opslagVoorbereiden) void bereidWorkerVoor(worker).catch(() => {});
  worker.addEventListener("message", opruimen, { once: true });
  worker.addEventListener("error", opruimen, { once: true });
  const stop = worker.terminate.bind(worker);
  worker.terminate = () => {
    werkers.delete(worker);
    taken.get(worker)?.stop();
    taken.delete(worker);
    opruimen();
    stop();
  };
  return worker;
}

// De engine roept deze fabriek met `new Worker(new URL(...))` aan. Die vorm
// blijft herkenbaar voor de bundelaar; het resultaat is een gewone Worker.
export const TekstWorker = startWorker as unknown as typeof Worker;
