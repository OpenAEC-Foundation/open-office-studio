/** Gedeelde afhankelijkheden horen niet in een worker-ingang met sessiestaat. */
export function databaseWorkerDelen(id) {
  const pad = id.replaceAll("\\", "/").replace(/[?#].*$/, "");
  if (/\/packages\/database\/src\/(i18n-worker|access-analyse|database-parser|model)\.ts$/.test(pad))
    return "database-gedeeld";
}

/** Een terugimport kan de berichtafhandeling opnieuw installeren met lege staat. */
export function databaseWorkerIngangBewaken() {
  return {
    name: "database-worker-ingang-bewaken",
    generateBundle(_opties, bundel) {
      for (const deel of Object.values(bundel)) {
        if (deel.type !== "chunk") continue;
        for (const naam of [...deel.imports, ...deel.dynamicImports]) {
          const doel = bundel[naam];
          if (doel?.type === "chunk" && doel.isEntry
              && doel.facadeModuleId?.replaceAll("\\", "/").endsWith("/packages/database/src/database-worker.ts"))
            this.error(`Worker-ingang ${naam} mag niet door ${deel.fileName} als gedeelde module worden geïmporteerd.`);
        }
      }
    },
  };
}
