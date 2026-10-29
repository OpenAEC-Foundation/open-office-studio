import {
  TIJDSLIMIET,
  pakIn,
  pakUit,
  type Overdracht,
  type Vensterkanaal,
  venstertitel,
} from "./vensteroverdracht";

/**
 * Tauri: Rust bewaart het pakket onder een eenmalige sleutel
 * (`src-tauri/src/vensters.rs`). Het doelvenster neemt het op, opent het
 * tabblad en bevestigt; pas dan krijgt het bronvenster een gebeurtenis en
 * sluit het zijn tabblad. Weigeren of geen reactie laat het tabblad staan.
 */
export async function tauriKanaal(): Promise<Vensterkanaal> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const venster = getCurrentWindow();
  const startSleutel = new URLSearchParams(location.search).get("overdracht");
  const wachtend = new Map<string, (fout?: Error) => void>();
  // Een snelle bevestiging kan binnenkomen vóór de sleutel bekend is.
  const vroeg = new Map<string, Error | undefined>();
  const meld = (sleutel: string, fout?: Error) => {
    const klaar = wachtend.get(sleutel);
    if (klaar) klaar(fout);
    else vroeg.set(sleutel, fout);
  };
  let ontvanger: ((o: Overdracht) => boolean) | null = null;

  await listen<string>("office-overdracht-bevestigd", (event) =>
    meld(event.payload),
  );
  await listen<string>("office-overdracht-geweigerd", (event) =>
    meld(
      event.payload,
      new Error("Het andere venster kon het tabblad niet openen."),
    ),
  );

  /** Neemt een pakket op, opent het en bevestigt of weigert. */
  async function ontvang(sleutel: string, open: (o: Overdracht) => boolean) {
    let geopend = false;
    try {
      const pakket = await invoke<ArrayBuffer>("neem_overdracht", { sleutel });
      geopend = open(pakUit(new Uint8Array(pakket)));
    } catch {
      geopend = false;
    }
    await invoke(geopend ? "bevestig_overdracht" : "weiger_overdracht", {
      sleutel,
    }).catch(() => undefined);
    return geopend;
  }

  await listen<string>("office-overdracht", (event) => {
    if (ontvanger) void ontvang(event.payload, ontvanger);
    else void invoke("weiger_overdracht", { sleutel: event.payload });
  });

  return {
    hoofdvenster: venster.label === "main",
    async stuur(overdracht, doel, positie) {
      const sleutel = await invoke<string>(
        "bied_overdracht",
        pakIn(overdracht),
        {
          headers: {
            "x-office-doel":
              typeof doel === "object"
                ? doel.venster
                : doel === "hoofd"
                  ? "main"
                  : "nieuw",
            "x-office-titel": encodeURIComponent(venstertitel(overdracht)),
            ...(positie && {
              "x-office-x": String(Math.round(positie.x)),
              "x-office-y": String(Math.round(positie.y)),
            }),
          },
        },
      );
      await new Promise<void>((resolve, reject) => {
        let verlengd = false;
        const klaar = (fout?: Error) => {
          clearTimeout(timer);
          wachtend.delete(sleutel);
          if (fout) reject(fout);
          else resolve();
        };
        const wacht = (): ReturnType<typeof setTimeout> =>
          setTimeout(async () => {
            const stand = await invoke<string>("trek_overdracht_in", {
              sleutel,
            }).catch(() => "onbekend");
            // Opgenomen maar nog niet bevestigd: nog één termijn wachten.
            if (stand === "geclaimd" && !verlengd) {
              verlengd = true;
              timer = wacht();
              return;
            }
            klaar(
              new Error(
                "Het andere venster heeft het tabblad niet op tijd overgenomen. Het blijft hier open.",
              ),
            );
          }, TIJDSLIMIET);
        let timer = wacht();
        if (vroeg.has(sleutel)) {
          const fout = vroeg.get(sleutel);
          vroeg.delete(sleutel);
          klaar(fout);
          return;
        }
        wachtend.set(sleutel, klaar);
      });
    },
    async begin(open) {
      if (!startSleutel) return false;
      return ontvang(startSleutel, open);
    },
    luister(open) {
      ontvanger = open;
      return () => {
        if (ontvanger === open) ontvanger = null;
      };
    },
  };
}
