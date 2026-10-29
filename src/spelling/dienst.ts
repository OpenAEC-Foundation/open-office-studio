/**
 * Eén gedeelde spellingcontrole voor de hele app (één worker, één cache),
 * pas gestart bij het eerste gebruik.
 */
import { Controleur } from "./controleur";
import { WorkerMotor } from "./motor";
import spellingWorkerUrl from "./worker.ts?worker&url";
import { startWorker } from "../startWorker";

let controleur: Controleur | null = null;

function basis() {
  const b = (import.meta.env?.BASE_URL ?? "/").replace(/\/?$/, "/");
  return new URL(b, typeof location === "undefined" ? "http://localhost/" : location.href).href;
}

export function spellingControleur(): Controleur {
  if (!controleur) {
    const motor = new WorkerMotor(
      () => startWorker(spellingWorkerUrl, { name: "spelling" }),
      new URL("spelling/oos_spelling.wasm", basis()).href,
      new URL("woordenboeken/", basis()).href,
    );
    controleur = new Controleur(motor);
  }
  return controleur;
}
