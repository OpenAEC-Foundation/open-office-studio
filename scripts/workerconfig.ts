/** Houd de worker-ingang buiten de gedeelde modules (WebKit #324459). */
import type { Plugin, UserConfig } from "vite";

export function controleerWorkerIngang(): Plugin {
  return {
    name: "controleer-worker-ingang",
    options(opties) {
      // Vite 7 overschrijft deze instelling in worker.rollupOptions. De
      // Rollup-optiehook draait daarna en bewaart de oorspronkelijke exports.
      // Gedeelde helpers komen daardoor in een module achter een dunne ingang.
      return { ...opties, preserveEntrySignatures: "strict" };
    },
    generateBundle(_, bundel) {
      const delen = Object.values(bundel).filter(d => d.type === "chunk");
      const ingangen = new Set(delen.filter(d => d.isEntry).map(d => d.fileName));
      for (const deel of delen) {
        for (const doel of [...deel.imports, ...deel.dynamicImports]) {
          if (ingangen.has(doel)) this.error(`Worker-ingang ${doel} wordt opnieuw geïmporteerd door ${deel.fileName}.`);
        }
      }
    },
  };
}

export function maakWorkerConfig(): NonNullable<UserConfig["worker"]> {
  return {
    format: "es",
    plugins: () => [controleerWorkerIngang()],
  };
}
