import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { Soort } from "../editors";
import { zichtbaarElement } from "../lint/editorApi";
import { registreerKoppeling, type EditorKoppeling } from "./koppeling";
import type { Herladen } from "../lint/editorApi";
import type { AfdrukBron } from "../afdrukken/bron";
import { vraagAfdrukvoorbeeld } from "../afdrukken/openen";
import { werkboekBytes } from "../lint/rekenblad-filter";

/** 0-gebaseerde index van de dia die het diapaneel als huidige toont. */
function huidigeDia() {
  const knoppen = [
    ...(zichtbaarElement<HTMLElement>(
      ".office-presentatie",
    )?.querySelectorAll<HTMLElement>("aside > button") ?? []),
  ];
  return Math.max(
    0,
    knoppen.findIndex((knop) => knop.getAttribute("aria-current") === "page"),
  );
}

async function diaPng(api: PptxEditorApi, index: number, schaal = 2) {
  const { slideToPng, decodePresentationImage } = await import(
    "@betteroffice/pptx"
  );
  await api.flushPendingInput();
  const cache = new Map<string, Promise<CanvasImageSource | null>>();
  const blob = await slideToPng(api.handle.layoutSlide(index), {
    scale: schaal,
    resolveImage: (id) => {
      if (!cache.has(id)) {
        const bytes = api.handle.mediaBytes(id);
        cache.set(
          id,
          bytes
            ? decodePresentationImage(
                bytes,
                "Afbeelding kon niet worden gelezen.",
              )
            : Promise.resolve(null),
        );
      }
      return cache.get(id)!;
    },
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Huidige selectie van het rekenblad, of null als die niet te lezen is. */
async function rekenbladSelectie(api: XlsxEditorApi) {
  try {
    const { leesSelectie } = await import("../lint/rekenblad-opdrachten");
    const { blad, bereik } = leesSelectie(api);
    if (bereik.top === bereik.bottom && bereik.left === bereik.right) return null;
    return {
      blad,
      bereik: {
        rij1: bereik.top,
        kol1: bereik.left,
        rij2: bereik.bottom,
        kol2: bereik.right,
      },
    };
  } catch {
    return null;
  }
}

function rekenbladBron(
  api: XlsxEditorApi,
  naam: string,
  herlaad: Herladen | null | undefined,
): AfdrukBron {
  const info = api.handle.sheetInfo();
  const titel = naam.replace(/\.[^.]+$/, "");
  let selectie: Awaited<ReturnType<typeof rekenbladSelectie>> = null;
  const bytes = async () => {
    await api.version();
    return werkboekBytes(api);
  };
  const context = async () => ({
    api,
    titel,
    bestandsnaam: naam,
    bytes: await bytes(),
    selectie,
  });
  const bron: AfdrukBron = {
    soort: "xlsx",
    titel,
    bladen: info.sheetNames,
    actief: info.activeSheet,
    selectie: null,
    leesInstellingen: async () => {
      const { leesAfdrukInstellingen } = await import(
        "../afdrukken/rekenbladInstellingen"
      );
      selectie = await rekenbladSelectie(api);
      if (bron.soort === "xlsx" && selectie) {
        const { bereikA1 } = await import("../afdrukken/rekenbladInstellingen");
        bron.selectie = bereikA1(selectie.bereik);
      }
      return leesAfdrukInstellingen(await bytes());
    },
    maak: async (keuze) => {
      const { rekenbladPaginas } = await import("../afdrukken/bronRekenblad");
      return rekenbladPaginas(await context(), keuze);
    },
    indeling: async (blad, keuze) => {
      const { bladIndeling } = await import("../afdrukken/bronRekenblad");
      return bladIndeling(await context(), keuze, blad);
    },
    bewaarInstellingen: herlaad
      ? async (wijzigingen) => {
          const { schrijfAfdrukInstellingen } = await import(
            "../afdrukken/rekenbladInstellingen"
          );
          const nieuw = schrijfAfdrukInstellingen(await bytes(), wijzigingen);
          herlaad.vervang(nieuw, { blad: api.handle.sheetInfo().activeSheet });
        }
      : undefined,
  };
  return bron;
}

/** Koppelt de live editor aan Opslaan als en afdrukken; geeft de ontkoppelfunctie terug. */
export function koppelEditor(
  soort: Soort,
  apis: {
    tekst: DocxEditorRef | null;
    rekenblad: XlsxEditorApi | null;
    presentatie: PptxEditorApi | null;
    herlaad?: Herladen | null;
  },
  naam = "Document",
) {
  const koppeling: EditorKoppeling = { soort };
  const titel = naam.replace(/\.[^.]+$/, "");
  koppeling.afdrukken = () => vraagAfdrukvoorbeeld();
  if (soort === "docx" && apis.tekst) {
    const ref = apis.tekst;
    koppeling.afdrukbron = () => ({
      soort: "docx",
      titel,
      maak: async () => {
        const { tekstPaginas } = await import("../afdrukken/bronTekst");
        return tekstPaginas(ref, titel);
      },
    });
  }
  if (soort === "xlsx" && apis.rekenblad) {
    const api = apis.rekenblad;
    koppeling.bladen = () => {
      const info = api.handle.sheetInfo();
      return { namen: info.sheetNames, actief: info.activeSheet };
    };
    koppeling.afdrukbron = () => rekenbladBron(api, naam, apis.herlaad);
  }
  if (soort === "pptx" && apis.presentatie) {
    const api = apis.presentatie;
    koppeling.dias = () => ({
      aantal: api.handle.snapshot().slides.length,
      huidig: huidigeDia(),
    });
    koppeling.diaPng = (index, schaal) => diaPng(api, index, schaal);
    koppeling.afdrukbron = () => ({
      soort: "pptx",
      titel,
      maak: async (instellingen) => {
        const { presentatiePaginas } = await import(
          "../afdrukken/bronPresentatie"
        );
        return presentatiePaginas(api, titel, instellingen);
      },
    });
  }
  return registreerKoppeling(koppeling);
}
