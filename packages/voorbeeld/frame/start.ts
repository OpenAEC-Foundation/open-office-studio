import { herkenKantoor } from "../src/formaat";
import { PROTOCOL, type NaarFrame, type VanFrame } from "../src/protocol";
import "./stijl.css";

const sessie = new URLSearchParams(location.hash.slice(1)).get("sessie");
let aangesloten = false;
let stop: (() => void) | undefined;

// Een zelfstandig frame kent geen account, bijlage-URL of rechten van de host.
// De host geeft pas na deze aansluiting een eigen kopie van de bronbytes door.
window.addEventListener("message", function verbind(event: MessageEvent) {
  if (
    aangesloten ||
    !sessie ||
    event.source !== parent ||
    event.data?.soort !== PROTOCOL ||
    event.ports.length !== 1
  )
    return;
  aangesloten = true;
  window.removeEventListener("message", verbind);
  const poort = event.ports[0];
  const meld = (bericht: VanFrame) => poort.postMessage(bericht);
  let geopend = false;
  poort.onmessage = async ({ data }: MessageEvent<NaarFrame>) => {
    if (geopend || data?.soort !== "open") return;
    geopend = true;
    try {
      if (
        !(data.bytes instanceof Uint8Array) ||
        !Number.isFinite(data.maxBytes) ||
        data.maxBytes <= 0 ||
        data.bytes.byteLength > data.maxBytes
      )
        throw new Error("Ongeldige of te grote voorbeeldbron.");
      const herkenning = herkenKantoor(data.bytes);
      if (herkenning.soort !== "kantoor") {
        meld(herkenning);
        return;
      }
      // Geen engine, WASM of lettertype ophalen vóór de inhoud is herkend.
      const renderer =
        herkenning.formaat === "docx"
          ? await import("./tekst")
          : herkenning.formaat === "xlsx"
            ? await import("./rekenblad")
            : await import("./presentatie");
      stop = await renderer.toon(
        document.getElementById("voorbeeld")!,
        data.bytes,
        data.naam,
        {
          gereed: () => meld({ soort: "gereed", formaat: herkenning.formaat }),
          fout: (fout) => meld({ soort: "fout", bericht: fout.message }),
        },
      );
    } catch (fout) {
      meld({
        soort: "fout",
        bericht: fout instanceof Error ? fout.message : String(fout),
      });
    }
  };
  meld({ soort: "aansluiting", sessie });
  window.addEventListener(
    "pagehide",
    () => {
      stop?.();
      poort.close();
    },
    { once: true },
  );
});

// Een voorbeeld mag de bron niet vervangen of een opslagdialoog openen.
window.addEventListener(
  "keydown",
  (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      ["s", "o"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
// Koppelingen naar buiten behoren tot de expliciete acties van de aanroeper.
window.addEventListener(
  "click",
  (event) => {
    if ((event.target as Element | null)?.closest?.("a[href]"))
      event.preventDefault();
  },
  true,
);
