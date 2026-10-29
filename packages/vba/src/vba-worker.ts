/**
 * Dedicated Worker voor de VBA-runtime. Geen DOM: de interpreter praat via
 * berichten met de client (MsgBox, InputBox, DoCmd, formulieren) en via een
 * MessagePort rechtstreeks met de werkkopie (werkkopie-brug).
 *
 * Starten (doet VbaClient): new Worker(new URL("./vba-worker.ts", import.meta.url), { type: "module" })
 */
import { zetWorkerTaal } from "../../database/src/i18n-worker.ts";
import { werkkopieViaPoort } from "../../database/src/werkkopie/werkkopie-brug.ts";
import { startVbaWorker, type WorkerPoort } from "./worker-kern.ts";

startVbaWorker(self as unknown as WorkerPoort, async (poort) => {
  poort.start?.();
  return werkkopieViaPoort(poort);
}, { zetTaal: zetWorkerTaal });
