interface NeerzetOpties {
  open: (bestanden: File[]) => void | Promise<void>;
  uit: boolean;
}

function heeftBestanden(e: DragEvent) {
  return !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
}

/** Browserdrops: voorkom navigatie en verwerk ook opeenvolgende drops op volgorde. */
export function luisterNaarNeerzetten(
  doel: Pick<Window, "addEventListener" | "removeEventListener">,
  opties: () => NeerzetOpties,
  toon: (zichtbaar: boolean) => void,
) {
  let diepte = 0;
  let actief = true;
  let wachtrij = Promise.resolve();
  const binnen = (e: DragEvent) => {
    if (!heeftBestanden(e) || e.defaultPrevented || opties().uit) return;
    diepte++;
    toon(true);
  };
  const boven = (e: DragEvent) => {
    if (!heeftBestanden(e) || e.defaultPrevented) return;
    // Ook bij een dialoog mag de browser het bestand niet zelf openen.
    e.preventDefault();
    e.dataTransfer!.dropEffect = opties().uit ? "none" : "copy";
  };
  const weg = (e: DragEvent) => {
    if (!heeftBestanden(e)) return;
    diepte = Math.max(0, diepte - 1);
    if (!diepte) toon(false);
  };
  const los = (e: DragEvent) => {
    diepte = 0;
    toon(false);
    // Een eigen neerzetplek (bijv. e-mailbijlagen of de editor) gaat voor.
    if (!heeftBestanden(e) || e.defaultPrevented) return;
    e.preventDefault();
    if (opties().uit) return;
    // DataTransfer is na deze gebeurtenis niet meer uitleesbaar.
    const bestanden = [...(e.dataTransfer?.files ?? [])];
    if (!bestanden.length) return;
    wachtrij = wachtrij
      .then(() => {
        if (actief) return opties().open(bestanden);
      })
      // De opener meldt fouten; een volgende drop moet blijven werken.
      .catch(() => undefined);
  };
  doel.addEventListener("dragenter", binnen);
  doel.addEventListener("dragover", boven);
  doel.addEventListener("dragleave", weg);
  doel.addEventListener("drop", los);
  return () => {
    actief = false;
    doel.removeEventListener("dragenter", binnen);
    doel.removeEventListener("dragover", boven);
    doel.removeEventListener("dragleave", weg);
    doel.removeEventListener("drop", los);
  };
}
