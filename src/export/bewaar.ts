import type { Soort } from "../editors";
import type { BewaarUitkomst } from "../opslag";
import i18next from "../i18n/config";
import { HOST_SOORTEN, bewaarBijHost, officeHost } from "../host";
import { controleerPakket, risicoBeleid, type Risico } from "../pakketcontrole";
import { opslagRapport, type Rapport } from "../import/rapport";
import { MACROUITVOER, bereidOpslag, type Bronkenmerken } from "../import/bron";
import {
  converteer,
  kiesRoute,
  uitvoerformaat,
  type ConversieOpties,
  type Route,
  type Uitvoerformaat,
} from "../formaten";
import type { Codering, Scheidingsteken } from "./csv";
import type { AppPdfKeuze } from "./PdfOpties";

/** Wat de gebruiker in Opslaan als heeft gekozen. */
export interface OpslaanKeuze {
  /** Bestandsnaam zonder extensie. */
  naam: string;
  ext: string;
  route: Route;
  scheidingsteken?: Scheidingsteken;
  codering?: Codering;
  /** 0-gebaseerd blad. */
  blad?: number;
  /** 0-gebaseerde dia. */
  dia?: number;
  /** 0 = gewone PDF. */
  pdfa?: 0 | 1 | 2 | 3;
  bladwijzers?: boolean;
  bereik?: string;
  /**
   * Wachtwoord om het OOXML-bestand mee te versleutelen. Alleen in het
   * geheugen van deze sessie; wordt nooit bewaard of gelogd.
   */
  wachtwoord?: string;
  /** PDF uit de app zelf: kwaliteit en inhoud. */
  pdf?: AppPdfKeuze;
}

/** Kenmerken van het geopende document die bij opslaan meetellen. */
export interface Documentkenmerken {
  macros?: boolean;
  versleuteld?: boolean;
}

/** Het verliesrapport dat vóór het opslaan in dit formaat hoort, of null. */
export function verliesrapport(
  bytes: Uint8Array,
  soort: Soort,
  formaat: Uitvoerformaat,
  route: Route | null,
  kenmerken: Documentkenmerken & { wachtwoord?: boolean } = {},
): Rapport | null {
  let risicos: Risico[] = [];
  try {
    risicos = controleerPakket(bytes, soort).risicos;
  } catch {
    risicos = [];
  }
  return opslagRapport({
    soort,
    formaat,
    route,
    risicos,
    macros: kenmerken.macros,
    wordtOnversleuteld: kenmerken.versleuteld && !kenmerken.wachtwoord,
  });
}

/** Aangetoond verlies via de eigen engine blokkeert opslaan in het eigen formaat. */
export function blokkeerBijVerlies(
  bytes: Uint8Array,
  soort: Soort,
  eigen: boolean,
) {
  const beleid = risicoBeleid(
    controleerPakket(bytes, soort).risicos,
    soort,
    eigen ? "engine" : "conversie",
  );
  if (beleid.opslaanGeblokkeerd) throw new Error(beleid.waarschuwing!);
}

/** De verliesmelding als één zin, voor de toelichting na opslaan. */
export function verliesmelding(
  bytes: Uint8Array,
  soort: Soort,
  formaat: Uitvoerformaat,
  route: Route | null,
  kenmerken: Documentkenmerken & { wachtwoord?: boolean } = {},
) {
  const rapport = verliesrapport(bytes, soort, formaat, route, kenmerken);
  return rapport
    ? rapport.regels.map((r) => `${r.onderdeel}: ${r.gevolg}`).join(" ")
    : null;
}

function runtimeOpties(keuze: OpslaanKeuze): ConversieOpties | undefined {
  const opties: ConversieOpties = {};
  if (keuze.ext === "pdf") {
    if (keuze.pdfa) opties.pdfa = keuze.pdfa;
    if (keuze.bladwijzers !== undefined) opties.bladwijzers = keuze.bladwijzers;
    if (keuze.bereik?.trim()) opties.bereik = keuze.bereik.trim();
  }
  if (keuze.ext === "csv" || keuze.ext === "tsv") {
    if (keuze.scheidingsteken) opties.scheidingsteken = keuze.scheidingsteken;
    if (keuze.codering) opties.codering = keuze.codering;
    if (keuze.blad !== undefined) opties.blad = keuze.blad + 1;
  }
  return Object.keys(opties).length ? opties : undefined;
}

/**
 * Maakt het gekozen formaat (engine of runtime) en bewaart het: native
 * opslagdialoog in de desktopapp, download in de browser. Alleen het eigen
 * formaat telt als "opgeslagen"; al het andere is een export, zodat het
 * document als gewijzigd gemarkeerd blijft.
 */
export async function bewaarInFormaat(
  soort: Soort,
  bytes: Uint8Array,
  keuze: OpslaanKeuze,
  /** Huidig pad-token van het tabblad (desktop); vervalt als het eigen formaat elders wordt bewaard. */
  token?: string,
  /** Versleuteling en macro’s van het origineel. */
  bron?: Bronkenmerken | null,
): Promise<BewaarUitkomst> {
  const formaat = uitvoerformaat(soort, keuze.ext);
  if (!formaat) throw new Error("Dit formaat wordt niet ondersteund.");
  const desktop = "__TAURI_INTERNALS__" in window;
  // Een macroformaat is het eigen formaat met het VBA-project van het origineel.
  const macroformaat = MACROUITVOER.has(keuze.ext);
  const eigen = keuze.ext === soort || macroformaat;
  const toelichtingen: string[] = [];
  blokkeerBijVerlies(bytes, soort, eigen);
  const melding = verliesmelding(bytes, soort, formaat, keuze.route, {
    versleuteld: !!bron?.versleuteling,
    wachtwoord: !!keuze.wachtwoord,
    macros: !!bron?.macro?.heeftVba,
  });
  if (melding) toelichtingen.push(melding);

  let uitvoer: Uint8Array;
  let mime = "application/octet-stream";
  if (keuze.route === "runtime") {
    uitvoer = await converteer(
      bytes,
      soort,
      keuze.ext,
      soort,
      runtimeOpties(keuze),
    );
  } else if (keuze.route === "afdrukken") {
    throw new Error("PDF zonder kantoorruntime loopt via Afdrukken.");
  } else if (eigen) {
    // Het eigen formaat heeft geen exportmodule nodig: zo kan opslaan nooit
    // stranden op een onderdeel dat nog van de server moet komen.
    const klaar = await bereidOpslag({
      bytes,
      soort,
      ext: keuze.ext,
      bron,
      wachtwoord: keuze.wachtwoord,
    });
    uitvoer = klaar.bytes;
    if (klaar.toelichting) toelichtingen.push(klaar.toelichting);
    mime = macroformaat ? MACRO_MIME[soort] : EIGEN_MIME[soort];
  } else {
    const { maakExport } = await laadExport();
    const resultaat = await maakExport(soort, keuze.ext, bytes, keuze.naam, {
      blad: keuze.blad,
      dia: keuze.dia,
      scheidingsteken: keuze.scheidingsteken,
      codering: keuze.codering,
      pdf: keuze.pdf,
      bereik: keuze.bereik,
    });
    uitvoer = resultaat.bytes;
    mime = resultaat.mime;
    if (resultaat.toelichting) toelichtingen.push(resultaat.toelichting);
  }
  if (!eigen)
    toelichtingen.push(
      `Het document blijft als gewijzigd gemarkeerd tot je het als .${soort} bewaart.`,
    );
  const toelichting = toelichtingen.join(" ") || undefined;
  const bestandsnaam = `${keuze.naam.replace(/[\\/:*?"<>|]+/g, "_").trim() || "Naamloos"}.${keuze.ext}`;
  if (desktop) {
    const { invoke } = await laad(() => import("@tauri-apps/api/core"));
    // Opslaan als: in het eigen formaat wordt het gekozen pad het nieuwe werkbestand.
    const r = await invoke<
      | { status: "geannuleerd" }
      | {
          status: "opgeslagen";
          naam: string;
          pad: string;
          token: string | null;
        }
    >("bewaar_als", uitvoer, {
      headers: {
        "x-office-naam": encodeURIComponent(bestandsnaam),
        ...(token && { "x-office-token": token }),
      },
    });
    if (r.status !== "opgeslagen") return { status: "geannuleerd" };
    if (!eigen) return { status: "geëxporteerd", pad: r.pad, toelichting };
    return {
      status: "opgeslagen",
      pad: r.pad,
      toelichting,
      ...(r.token && { werkbestand: { token: r.token, naam: r.naam } }),
    };
  }
  // Gehoste bouw: de host bewaart het document zelf (src/host.ts, #109).
  const host = officeHost();
  if (host && HOST_SOORTEN.includes(keuze.ext)) {
    const uit = await bewaarBijHost(host, bestandsnaam, uitvoer);
    const conflict = uit.conflict
      ? i18next.t("shell:host.conflict", { name: uit.naam })
      : "";
    if (conflict) host.melding?.("waarschuwing", conflict);
    return {
      status: "opgeslagen",
      pad: uit.naam,
      toelichting: [conflict, toelichting].filter(Boolean).join(" ") || undefined,
    };
  }
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(uitvoer)], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { status: "download", toelichting };
}

const MACRO_MIME: Record<Soort, string> = {
  docx: "application/vnd.ms-word.document.macroEnabled.12",
  xlsx: "application/vnd.ms-excel.sheet.macroEnabled.12",
  pptx: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
};

/**
 * Bewaart bytes als bestand: in de desktopapp via de opslagdialoog (geeft het
 * pad, of null bij annuleren), in de browser als download (geeft "").
 */
export async function bewaarUitvoer(
  uitvoer: Uint8Array,
  bestandsnaam: string,
  mime: string,
): Promise<string | null> {
  const { bewaarBytes } = await laad(() => import("../afdrukken/bewaren"));
  return bewaarBytes(uitvoer, bestandsnaam, mime);
}

const EIGEN_MIME: Record<Soort, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Herkent een programmaonderdeel dat niet meer van de server te halen is. */
export function isNalaadfout(fout: unknown) {
  const tekst = fout instanceof Error ? fout.message : String(fout);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(
    tekst,
  );
}

async function laad<T>(ophalen: () => Promise<T>): Promise<T> {
  try {
    return await ophalen();
  } catch (fout) {
    if (!isNalaadfout(fout)) throw fout;
    throw new Error(
      "De app is intussen bijgewerkt en dit exportonderdeel is niet meer beschikbaar. Je document is niet verloren: sla het eerst op in het eigen formaat en laad daarna de pagina opnieuw.",
    );
  }
}

let exportModule: Promise<typeof import("./index")> | null = null;
function laadExport() {
  exportModule ??= laad(() => import("./index")).catch((fout) => {
    exportModule = null;
    throw fout;
  });
  return exportModule;
}

/** Laadt de exportonderdelen alvast, zodat Opslaan als later niets meer hoeft op te halen. */
export function voorlaadExport() {
  void laadExport().catch(() => {
    // Een mislukte voorlading meldt zich pas bij opslaan.
  });
  if ("__TAURI_INTERNALS__" in window)
    void import("@tauri-apps/api/core").catch(() => {});
}

/** Standaardkeuze voor Ctrl+S zonder eerder gekozen opties. */
export function standaardKeuze(
  soort: Soort,
  naam: string,
  ext: string,
): OpslaanKeuze {
  const formaat = uitvoerformaat(soort, ext) ?? uitvoerformaat(soort, soort)!;
  const desktop = "__TAURI_INTERNALS__" in window;
  return {
    naam: naam.replace(/\.[^.]+$/, ""),
    ext: formaat.ext,
    route: kiesRoute(formaat, desktop) ?? "engine",
  };
}
