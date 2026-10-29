/**
 * Pure logica voor het scherm “Externe verwijzingen”: groeperen van
 * afhankelijkheden, filters, ketenweergave, padverkorting en export van het
 * resultaat van “Uitvoeren wat werkt”. Geen broncode, geen verbindingsreeksen.
 */
import i18next from "i18next";
import type {
  Afhankelijkheid,
  AfhankelijkheidSoort,
  Beschikbaarheid,
  ExterneAnalyse,
  GekoppeldeTabelInvoer,
  OntbrekendModus,
  ProcedureAnalyse,
  ProcedureReden,
  ProcedureStatus,
  Uitvoering,
  UitvoeringStatus,
  WatWerktSamenvatting,
} from "../../../vba/src/extern-typen.ts";
import { csv, type DatabaseObject } from "../model.ts";
import { formatGetal } from "../../../../src/i18n/opmaak";

// ---------------------------------------------------------------- teksten

const tr = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`database:externalRefs.${sleutel}`, opties);

/** Status met teken; de tekst wordt pas bij het lezen vertaald (taal kan wisselen). */
function status(sleutel: string, teken: string): { readonly tekst: string; teken: string } {
  return {
    get tekst() {
      return tr(sleutel);
    },
    teken,
  };
}

export const STATUS_BESCHIKBAAR: Record<Beschikbaarheid, { readonly tekst: string; teken: string }> = {
  ingebouwd: status("availability.builtIn", "✓"),
  deels: status("availability.partial", "◐"),
  ontbreekt: status("availability.missing", "✕"),
};

export const STATUS_PROCEDURE: Record<ProcedureStatus, { readonly tekst: string; teken: string }> = {
  uitvoerbaar: status("procedureStatus.runnable", "✓"),
  deels: status("procedureStatus.partial", "◐"),
  niet: status("procedureStatus.notRunnable", "✕"),
};

export const STATUS_UITVOERING: Record<UitvoeringStatus | "niet-uitgevoerd", { readonly tekst: string; teken: string }> = {
  geslaagd: status("runStatus.succeeded", "✓"),
  fout: status("runStatus.error", "✕"),
  tijdslimiet: status("runStatus.timeout", "⏱"),
  gestopt: status("runStatus.stopped", "■"),
  "niet-uitgevoerd": status("runStatus.notRun", "–"),
};

function modus(waarde: OntbrekendModus, sleutel: string): { waarde: OntbrekendModus; readonly naam: string; readonly uitleg: string } {
  return {
    waarde,
    get naam() {
      return tr(`modes.${sleutel}.name`);
    },
    get uitleg() {
      return tr(`modes.${sleutel}.description`);
    },
  };
}

export const MODI: { waarde: OntbrekendModus; readonly naam: string; readonly uitleg: string }[] = [
  modus("stoppen", "stop"),
  modus("fout", "error"),
  modus("overslaan", "skip"),
];

const SOORT_SLEUTEL: Record<AfhankelijkheidSoort, string> = {
  bibliotheek: "library",
  declare: "declare",
  createobject: "createObject",
  bestand: "file",
  proces: "process",
  toetsenbord: "keyboard",
  omgeving: "environment",
  register: "registry",
  pad: "path",
  "gekoppelde-tabel": "linkedTable",
  "externe-database": "externalDatabase",
  hyperlink: "hyperlink",
  export: "export",
  onbekend: "unknownName",
  syntaxis: "syntaxError",
};

/** Naam per soort afhankelijkheid; vertaald op het moment van lezen. */
export const SOORT_NAAM = Object.defineProperties(
  {} as Record<AfhankelijkheidSoort, string>,
  Object.fromEntries(
    Object.entries(SOORT_SLEUTEL).map(([soort, sleutel]) => [soort, { enumerable: true, get: () => tr(`kind.${sleutel}`) }]),
  ),
);

// ---------------------------------------------------------------- paden

/**
 * Kort een pad af tot de bestandsnaam, zodat een gebruikersnaam in het pad
 * (C:\Users\naam\…) niet in beeld staat. Het volledige pad gaat naar de tooltip.
 */
export function verkortPad(pad: string | undefined | null): { kort: string; volledig: string } | null {
  if (!pad) return null;
  const schoon = pad.trim().replace(/\0+$/, "");
  if (!schoon) return null;
  const delen = schoon.split(/[\\/]+/).filter(Boolean);
  const kort = delen[delen.length - 1] ?? schoon;
  return { kort, volledig: schoon };
}

// ---------------------------------------------------------------- ketens

/** `Module.Proc` → `Proc` (de module staat elders al). */
function procNaam(sleutel: string): string {
  const i = sleutel.lastIndexOf(".");
  return i >= 0 ? sleutel.slice(i + 1) : sleutel;
}

/** “Knop_Click → Exporteer → CreateObject(Excel.Application)”. */
export function ketenTekst(reden: Pick<ProcedureReden, "keten" | "oorzaak">, metModule = false): string {
  const stappen = reden.keten.map((s) => (metModule ? s : procNaam(s)));
  return [...stappen, reden.oorzaak].join(" → ");
}

// ---------------------------------------------------------------- groeperen

export type Groep = "bibliotheek" | "windows-api" | "com" | "bestanden" | "gekoppeld" | "overig";

export function groepVan(soort: AfhankelijkheidSoort): Groep {
  switch (soort) {
    case "bibliotheek":
      return "bibliotheek";
    case "declare":
      return "windows-api";
    case "createobject":
      return "com";
    case "bestand":
    case "pad":
      return "bestanden";
    case "gekoppelde-tabel":
      return "gekoppeld";
    default:
      return "overig";
  }
}

export interface Plek {
  module: string;
  procedure?: string;
  regel: number;
  omzeilbaar: boolean;
  foutnummer?: number;
}

export interface AfhankelijkheidRij {
  sleutel: string;
  soort: AfhankelijkheidSoort;
  naam: string;
  bibliotheek?: string;
  /** Slechtste status over alle plekken. */
  status: Beschikbaarheid;
  plekken: Plek[];
  /** Procedures (`Module.Proc`), uniek. */
  procedures: string[];
}

const ERNST: Record<Beschikbaarheid, number> = { ingebouwd: 0, deels: 1, ontbreekt: 2 };

/** Voegt afhankelijkheden met dezelfde soort, naam en bibliotheek samen; gesorteerd op status en naam. */
export function groepeerAfhankelijkheden(lijst: Afhankelijkheid[]): Record<Groep, AfhankelijkheidRij[]> {
  const uit: Record<Groep, AfhankelijkheidRij[]> = { bibliotheek: [], "windows-api": [], com: [], bestanden: [], gekoppeld: [], overig: [] };
  const index = new Map<string, AfhankelijkheidRij>();
  for (const a of lijst) {
    const sleutel = `${a.soort}|${a.naam.toLowerCase()}|${(a.bibliotheek ?? "").toLowerCase()}`;
    let rij = index.get(sleutel);
    if (!rij) {
      rij = { sleutel, soort: a.soort, naam: a.naam, bibliotheek: a.bibliotheek, status: a.status, plekken: [], procedures: [] };
      index.set(sleutel, rij);
      uit[groepVan(a.soort)].push(rij);
    }
    if (ERNST[a.status] > ERNST[rij.status]) rij.status = a.status;
    rij.plekken.push({
      module: a.module,
      ...(a.procedure ? { procedure: a.procedure } : {}),
      regel: a.regel,
      omzeilbaar: a.omzeilbaar,
      ...(a.foutnummer !== undefined ? { foutnummer: a.foutnummer } : {}),
    });
    const proc = a.procedure ? `${a.module}.${a.procedure}` : a.module;
    if (!rij.procedures.includes(proc)) rij.procedures.push(proc);
  }
  for (const groep of Object.values(uit)) {
    groep.sort((a, b) => ERNST[b.status] - ERNST[a.status] || a.naam.localeCompare(b.naam, "nl"));
    for (const r of groep) r.plekken.sort((a, b) => a.module.localeCompare(b.module, "nl") || a.regel - b.regel);
  }
  return uit;
}

// ---------------------------------------------------------------- overzicht

/** Belangrijkste oorzaken, aflopend op aantal procedures. */
export function belangrijksteOorzaken(analyse: Pick<ExterneAnalyse, "samenvatting">, aantal = 6): { oorzaak: string; procedures: number }[] {
  return Object.entries(analyse.samenvatting.perOorzaak)
    .map(([oorzaak, procedures]) => ({ oorzaak, procedures }))
    .filter((o) => o.procedures > 0)
    .sort((a, b) => b.procedures - a.procedures || a.oorzaak.localeCompare(b.oorzaak, "nl"))
    .slice(0, aantal);
}

// ---------------------------------------------------------------- procedures

export interface ProcedureFilter {
  status: ProcedureStatus | "alle";
  module: string | "alle";
  zoek: string;
}

export function filterProcedures(lijst: ProcedureAnalyse[], f: ProcedureFilter): ProcedureAnalyse[] {
  const zoek = f.zoek.trim().toLowerCase();
  return lijst.filter(
    (p) =>
      (f.status === "alle" || p.status === f.status) &&
      (f.module === "alle" || p.module === f.module) &&
      (!zoek ||
        p.sleutel.toLowerCase().includes(zoek) ||
        p.redenen.some((r) => r.oorzaak.toLowerCase().includes(zoek) || (r.bibliotheek ?? "").toLowerCase().includes(zoek))),
  );
}

/** Kan deze procedure los worden uitgevoerd (publieke parameterloze Sub/Function in een standaardmodule)? */
export function losUitvoerbaar(p: ProcedureAnalyse): boolean {
  return p.moduleSoort === "module" && (p.soort === "sub" || p.soort === "function") && p.publiek && p.zonderVerplichteParameters && !p.gebeurtenis;
}

/**
 * Splitst de procedures in kandidaten voor “Uitvoeren wat werkt” en
 * procedures die niet worden uitgevoerd (met reden), zoals `voerUitWatWerkt`
 * dat doet. Formulier- en rapportmodules vallen af: er is tijdens een reeks
 * geen geopend formulier.
 */
export function verdeelKandidaten(lijst: ProcedureAnalyse[], metDeels: boolean) {
  const kandidaten: ProcedureAnalyse[] = [];
  const nietUitgevoerd: WatWerktSamenvatting["nietUitgevoerd"] = [];
  for (const p of lijst) {
    const reden =
      p.soort !== "sub" && p.soort !== "function"
        ? tr("notRunReason.propertyProcedure")
        : p.moduleSoort === "klasse"
          ? tr("notRunReason.classModule")
          : p.gebeurtenis
            ? tr("notRunReason.eventProcedure")
            : p.moduleSoort === "formulier"
              ? tr("notRunReason.formModule")
              : !p.publiek
                ? tr("notRunReason.notPublic")
                : !p.zonderVerplichteParameters
                  ? tr("notRunReason.requiredParameters")
                  : p.status === "niet" || (p.status === "deels" && !metDeels)
                    ? tr("notRunReason.status", { status: STATUS_PROCEDURE[p.status].tekst.toLowerCase() })
                    : null;
    if (reden) nietUitgevoerd.push({ module: p.module, procedure: p.naam, reden });
    else kandidaten.push(p);
  }
  return { kandidaten, nietUitgevoerd };
}

// ---------------------------------------------------------------- gekoppelde tabellen

/** Gekoppelde tabellen uit de alleen-lezen-analyse: alleen naam en soort bron, nooit een verbindingsreeks. */
export function gekoppeldeTabellenUit(objecten: DatabaseObject[], inWerkkopie: string[] = []): GekoppeldeTabelInvoer[] {
  const aanwezig = new Set(inWerkkopie.map((n) => n.toLowerCase()));
  return objecten
    .filter((o) => o.soort === "Gekoppelde tabel")
    .map((o) => ({
      naam: o.naam,
      bron: o.eigenschappen?.find(([k]) => k === "Soort" || k === i18next.t("database:analysis.property.kind"))?.[1] ?? tr("kind.linkedTable"),
      inWerkkopie: aanwezig.has(o.naam.toLowerCase()),
    }));
}

// ---------------------------------------------------------------- resultaat

export interface Resultaatregel {
  module: string;
  procedure: string;
  status: UitvoeringStatus | "niet-uitgevoerd";
  uitvoering?: Uitvoering;
  reden?: string;
  /** Modus en proefmodus van deze uitvoering (losse uitvoeringen kunnen afwijken van de reeks). */
  ontbrekend?: OntbrekendModus;
  teruggedraaid?: boolean;
}

/** Naam van een oorzaak uit `samenvatting.perOorzaak` (soort of bibliotheek). */
export function oorzaakNaam(oorzaak: string): string {
  return (SOORT_NAAM as Record<string, string>)[oorzaak] ?? oorzaak;
}

/** Leesbare fouttekst: “Fout 429: ActiveX-onderdeel kan geen object maken (Module1, regel 12)”. */
export function uitvoeringFoutTekst(u: Uitvoering): string {
  const f = u.fout;
  if (!f) return "";
  const omschrijving = f.omschrijving.trim();
  const tekst = f.nummer ? tr("error.withNumber", { number: f.nummer, description: omschrijving }) : omschrijving;
  if (f.module && f.regel) return tr("error.atModuleLine", { text: tekst, module: f.module, line: f.regel });
  if (f.module) return tr("error.atModule", { text: tekst, module: f.module });
  if (f.regel) return tr("error.atLine", { text: tekst, line: f.regel });
  return tekst;
}

export function telResultaat(regels: Resultaatregel[]) {
  const tel = (s: Resultaatregel["status"]) => regels.filter((r) => r.status === s).length;
  return {
    geslaagd: tel("geslaagd"),
    fout: tel("fout"),
    tijdslimiet: tel("tijdslimiet"),
    gestopt: tel("gestopt"),
    nietUitgevoerd: tel("niet-uitgevoerd"),
    metOvergeslagen: regels.filter((r) => r.uitvoering?.overgeslagen.length).length,
  };
}

export interface ResultaatExport {
  database: string;
  datum: string;
  opties: { ontbrekend: OntbrekendModus; metDeels: boolean; terugdraaien: boolean; dialogenAutomatisch: boolean };
  teruggedraaid: boolean;
  regels: Resultaatregel[];
}

/** JSON-export: status, fouten, overgeslagen onderdelen en uitvoer — geen broncode. */
export function resultaatAlsJson(r: ResultaatExport): string {
  return JSON.stringify(
    {
      database: r.database,
      datum: r.datum,
      opties: r.opties,
      teruggedraaid: r.teruggedraaid,
      totalen: telResultaat(r.regels),
      procedures: r.regels.map((x) => ({
        module: x.module,
        procedure: x.procedure,
        status: x.status,
        ...(x.reden ? { reden: x.reden } : {}),
        ...(x.ontbrekend ? { ontbrekend: x.ontbrekend } : {}),
        ...(x.teruggedraaid !== undefined ? { teruggedraaid: x.teruggedraaid } : {}),
        ...(x.uitvoering
          ? {
              duurMs: x.uitvoering.duurMs,
              ...(x.uitvoering.stappen !== undefined ? { stappen: x.uitvoering.stappen } : {}),
              ...(x.uitvoering.fout ? { fout: x.uitvoering.fout } : {}),
              overgeslagen: x.uitvoering.overgeslagen,
              uitvoer: x.uitvoering.uitvoer,
              hostgebeurtenissen: x.uitvoering.hostgebeurtenissen,
            }
          : {}),
      })),
    },
    null,
    2,
  );
}

export function resultaatAlsCsv(r: ResultaatExport): string {
  const kolommen = [
    tr("csv.module"),
    tr("csv.procedure"),
    tr("csv.status"),
    tr("csv.errorNumber"),
    tr("csv.description"),
    tr("csv.line"),
    tr("csv.durationMs"),
    tr("csv.skipped"),
    tr("csv.skippedParts"),
    "Debug.Print",
    tr("csv.hostEvents"),
  ];
  const rijen = r.regels.map((x) => {
    const u = x.uitvoering;
    return [
      x.module,
      x.procedure,
      STATUS_UITVOERING[x.status].tekst,
      u?.fout?.nummer !== undefined ? String(u.fout.nummer) : "",
      u?.fout ? u.fout.omschrijving.trim() : (x.reden ?? ""),
      u?.fout?.regel !== undefined ? String(u.fout.regel) : "",
      u ? String(u.duurMs) : "",
      u ? String(u.overgeslagen.reduce((s, o) => s + o.aantal, 0)) : "",
      u ? u.overgeslagen.map((o) => o.melding).join(" | ") : "",
      u ? u.uitvoer.join(" | ") : "",
      u ? u.hostgebeurtenissen.map(hostgebeurtenisTekst).join(" | ") : "",
    ];
  });
  return csv(kolommen, rijen);
}

export function hostgebeurtenisTekst(h: Uitvoering["hostgebeurtenissen"][number]): string {
  const naam = h.soort === "msgBox" ? "MsgBox" : h.soort === "inputBox" ? "InputBox" : h.soort === "formulier" ? `${tr("hostEventForm")}.${h.naam ?? "?"}` : `DoCmd.${h.naam ?? "?"}`;
  return h.doel ? `${naam} (${h.doel})` : naam;
}

/** Duur leesbaar: “120 ms”, “2,4 s”. */
export function duurTekst(ms: number): string {
  return ms < 1000 ? tr("duration.ms", { value: formatGetal(Math.round(ms)) }) : tr("duration.s", { value: formatGetal(ms / 1000, { maximumFractionDigits: 1 }) });
}
