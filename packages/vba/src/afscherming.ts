/**
 * Afscherming: wat VBA-code buiten de werkkopie zou laten komen (processen,
 * bestanden, COM/ActiveX, de Windows-API, toetsaanslagen, omgevingsvariabelen,
 * het register, hyperlinks en export naar bestanden) wordt niet uitgevoerd.
 *
 * Twee lagen:
 * 1. Bij uitvoering: de interpreter weigert met een `VbaAfbreking` (reden
 *    "afgeschermd") vóórdat argumenten worden geëvalueerd. Die fout is niet
 *    met `On Error` af te vangen, zodat code niet stil verder loopt.
 * 2. Statisch: `scanAfscherming` meldt vooraf welke afgeschermde constructies
 *    een module bevat, zonder de code uit te voeren.
 */
import i18next from "i18next";
import type { Argument, Expr, ModuleAst, Statement } from "./ast.ts";
import { VbaAfbreking } from "./fouten.ts";

export type AfschermingCategorie =
  | "proces"
  | "bestand"
  | "com"
  | "windows-api"
  | "toetsenbord"
  | "omgeving"
  | "register"
  | "hyperlink"
  | "export"
  | "project";

export interface Afscherming {
  /** Zoals in VBA geschreven, bv. `Shell` of `DoCmd.TransferText`. */
  naam: string;
  categorie: AfschermingCategorie;
  reden: string;
  /**
   * Foutnummer dat VBA zelf zou geven als het onderdeel niet beschikbaar is;
   * wordt gebruikt in de modus `ontbrekend: "fout"` (vangbaar met On Error).
   */
  nummer: number;
  /** Levert een object (Set x = …): in de modus `overslaan` een plaatsvervangend object. */
  object?: boolean;
}

/** Sleutel van de reden per categorie (`vba:shield.reason.<sleutel>`). */
const REDENEN: Record<AfschermingCategorie, string> = {
  proces: "process",
  bestand: "file",
  com: "com",
  "windows-api": "windowsApi",
  toetsenbord: "keyboard",
  omgeving: "environment",
  register: "registry",
  hyperlink: "hyperlink",
  export: "export",
  project: "project",
};

/** Waarom een categorie is afgeschermd, in de actieve taal. */
export const afschermingsreden = (categorie: AfschermingCategorie) => i18next.t(`vba:shield.reason.${REDENEN[categorie]}`);

/** Voegt `reden` toe als getter, zodat de tekst pas bij het tonen wordt vertaald. */
function metReden(a: Omit<Afscherming, "reden">): Afscherming {
  return Object.defineProperty(a, "reden", {
    get: () => afschermingsreden(a.categorie),
    enumerable: true,
  }) as Afscherming;
}

/** Standaardfoutnummer per categorie (zoals VBA zelf zou melden). */
const NUMMERS: Record<AfschermingCategorie, number> = {
  proces: 5,
  bestand: 75,
  com: 429,
  "windows-api": 453,
  toetsenbord: 70,
  omgeving: 70,
  register: 70,
  hyperlink: 490,
  export: 2302,
  project: 438,
};

const f = (naam: string, categorie: AfschermingCategorie, nummer = NUMMERS[categorie], object = false): [string, Afscherming] => [
  naam.toLowerCase(),
  metReden({ naam, categorie, nummer, ...(object ? { object } : {}) }),
];

/** Ingebouwde functies en statements die worden geweigerd. */
export const GEWEIGERDE_FUNCTIES = new Map<string, Afscherming>([
  f("Shell", "proces"),
  f("AppActivate", "proces"),
  f("Kill", "bestand"),
  f("FileCopy", "bestand"),
  f("Dir", "bestand"),
  f("MkDir", "bestand"),
  f("RmDir", "bestand"),
  f("ChDir", "bestand", 76),
  f("ChDrive", "bestand", 68),
  f("CurDir", "bestand"),
  f("FileLen", "bestand", 53),
  f("FileDateTime", "bestand", 53),
  f("GetAttr", "bestand", 53),
  f("SetAttr", "bestand"),
  f("FreeFile", "bestand"),
  f("LOF", "bestand", 52),
  f("Loc", "bestand", 52),
  f("LoadPicture", "bestand", 53, true),
  f("SavePicture", "bestand"),
  f("CreateObject", "com", 429, true),
  f("GetObject", "com", 429, true),
  f("SendKeys", "toetsenbord"),
  f("Environ", "omgeving"),
  f("GetSetting", "register"),
  f("SaveSetting", "register"),
  f("DeleteSetting", "register"),
  f("GetAllSettings", "register"),
]);

/** Leden van Access-objecten die worden geweigerd (object.lid, kleine letters). */
export const GEWEIGERDE_LEDEN = new Map<string, Afscherming>([
  f("DoCmd.TransferText", "export"),
  f("DoCmd.TransferSpreadsheet", "export"),
  f("DoCmd.TransferDatabase", "export"),
  f("DoCmd.TransferSQLDatabase", "export"),
  f("DoCmd.OutputTo", "export"),
  f("DoCmd.SendObject", "export", 2293),
  f("DoCmd.RunApp", "proces"),
  f("DoCmd.CopyDatabaseFile", "bestand"),
  f("DoCmd.FollowHyperlink", "hyperlink"),
  f("Application.FollowHyperlink", "hyperlink"),
  f("Application.ExportXML", "export"),
  f("Application.ImportXML", "export"),
  f("Application.SaveAsText", "export"),
  f("Application.LoadFromText", "export"),
  f("Application.Shell", "proces"),
  f("CurrentProject.Path", "bestand"),
  f("CurrentProject.FullName", "bestand"),
  f("CodeProject.Path", "bestand"),
  f("CodeProject.FullName", "bestand"),
  f("Database.Name", "bestand"),
  f("CurrentDb.Name", "bestand"),
  f("Application.References", "project", 438, true),
  f("Application.VBE", "project", 438, true),
  f("SysCmd.AccessDir", "bestand"),
  f("SysCmd.GetWorkgroupFile", "bestand"),
  f("Application.FileDialog", "bestand", 75, true),
  f("CurrentProject.Connection", "com", 429, true),
  f("CurrentProject.AccessConnection", "com", 429, true),
  f("CodeProject.Connection", "com", 429, true),
  f("CodeProject.AccessConnection", "com", 429, true),
  f("Workspace.OpenDatabase", "bestand", 3024, true),
  f("DBEngine.OpenDatabase", "bestand", 3024, true),
  f("DBEngine.CompactDatabase", "bestand", 3024),
  f("DBEngine.RepairDatabase", "bestand", 3024),
]);

/** Bestands-I/O-statements (Open … For, Print #, Close # …): foutnummer per statement. */
export function bestandsstatement(wat: string): Afscherming {
  const nummer = /^(open|name)/i.test(wat) ? 75 : 52;
  return metReden({ naam: wat, categorie: "bestand", nummer });
}

/** Een met Declare uit een DLL gehaalde functie. */
export function declareAfscherming(naam: string): Afscherming {
  return metReden({ naam: `Declare ${naam}`, categorie: "windows-api", nummer: 453 });
}

/** AddressOf (terugroepfunctie voor de Windows-API). */
export const ADDRESSOF: Afscherming = metReden({ naam: "AddressOf", categorie: "windows-api", nummer: 453 });

export function afschermingsmelding(a: Afscherming) {
  return i18next.t("vba:shield.blocked", { name: a.naam, reason: a.reden });
}

/** De weigering zelf: een niet-vangbare afbreking die weet wát er geweigerd is. */
export function weigering(a: Afscherming, melding = afschermingsmelding(a)): VbaAfbreking {
  const e = new VbaAfbreking("afgeschermd", melding);
  e.afscherming = { naam: a.naam, categorie: a.categorie, nummer: a.nummer, ...(a.object ? { object: true } : {}) };
  return e;
}

export function weiger(a: Afscherming): never {
  throw weigering(a);
}

export function weigerLid(object: string, lid: string): never {
  const a = GEWEIGERDE_LEDEN.get(`${object}.${lid}`.toLowerCase()) ?? metReden({
    naam: `${object}.${lid}`,
    categorie: "bestand",
    nummer: NUMMERS.bestand,
  });
  return weiger(a);
}

// ---------- statische scan ----------

export interface Bevinding {
  module: string;
  regel: number;
  kolom: number;
  naam: string;
  categorie: AfschermingCategorie;
}

function* expressies(e: Expr | null | undefined): Generator<Expr> {
  if (!e) return;
  yield e;
  switch (e.k) {
    case "lid":
    case "bang":
      yield* expressies(e.obj);
      break;
    case "aanroep":
      yield* expressies(e.doel);
      for (const a of e.args) yield* expressies(a.waarde);
      break;
    case "bin":
      yield* expressies(e.l);
      yield* expressies(e.r);
      break;
    case "un":
    case "haakjes":
      yield* expressies(e.e);
      break;
    case "typeof":
      yield* expressies(e.e);
      break;
  }
}

/** Alle statements, recursief door blokken heen. */
export function* statements(lijst: Statement[]): Generator<Statement> {
  for (const s of lijst) {
    yield s;
    switch (s.k) {
      case "if":
        for (const t of s.takken) yield* statements(t.body);
        if (s.anders) yield* statements(s.anders);
        break;
      case "select":
        for (const g of s.gevallen) yield* statements(g.body);
        if (s.anders) yield* statements(s.anders);
        break;
      case "for":
      case "foreach":
      case "do":
      case "with":
        yield* statements(s.body);
        break;
    }
  }
}

/** Alle expressies in een statement (niet recursief in blokken). */
export function* expressiesVan(s: Statement): Generator<Expr> {
  const args = (a: Argument[]) => a.map((x) => x.waarde);
  const lijst: (Expr | null | undefined)[] = [];
  switch (s.k) {
    case "let":
    case "set":
      lijst.push(s.doel, s.waarde);
      break;
    case "call":
      lijst.push(s.doel, ...args(s.args));
      break;
    case "print":
      lijst.push(...s.delen.map((d) => d.e));
      break;
    case "if":
      lijst.push(...s.takken.map((t) => t.voorwaarde));
      break;
    case "select":
      lijst.push(s.test, ...s.gevallen.flatMap((g) => g.tests.flatMap((t) => [t.van, t.tot])));
      break;
    case "for":
      lijst.push(s.teller, s.van, s.tot, s.stap);
      break;
    case "foreach":
      lijst.push(s.teller, s.reeks);
      break;
    case "do":
      lijst.push(s.voorTest?.e, s.naTest?.e);
      break;
    case "with":
      lijst.push(s.obj);
      break;
    case "error":
      lijst.push(s.nummer);
      break;
    case "redim":
      lijst.push(...s.variabelen.flatMap((v) => [v.doel, ...v.grenzen.flatMap((g) => [g.onder, g.boven])]));
      break;
    case "const":
      lijst.push(...s.constanten.map((c) => c.waarde));
      break;
  }
  for (const e of lijst) yield* expressies(e);
}

function kwalificatie(e: Expr): string | null {
  if (e.k === "id") return e.naam;
  if (e.k === "lid" && e.obj) {
    const o = kwalificatie(e.obj);
    return o ? `${o}.${e.naam}` : null;
  }
  if (e.k === "aanroep") return kwalificatie(e.doel);
  return null;
}

/** Zoekt afgeschermde constructies in een geparste module, zonder iets uit te voeren. */
export function scanAfscherming(m: ModuleAst): Bevinding[] {
  const uit: Bevinding[] = [];
  const voeg = (regel: number, kolom: number, naam: string, categorie: AfschermingCategorie) =>
    uit.push({ module: m.naam, regel, kolom, naam, categorie });
  for (const d of m.declares) voeg(d.regel, d.kolom, "Declare", "windows-api");
  const api = new Set(m.declares.map((d) => d.naam.toLowerCase()));
  for (const p of m.procedures)
    for (const s of statements(p.body)) {
      if (s.k === "geweigerd") voeg(s.regel, s.kolom, s.wat, "bestand");
      for (const e of expressiesVan(s)) {
        if (e.k === "addressof") voeg(e.regel, e.kolom, "AddressOf", "windows-api");
        if (e.k === "id") {
          const a = GEWEIGERDE_FUNCTIES.get(e.naam.toLowerCase());
          if (a) voeg(e.regel, e.kolom, a.naam, a.categorie);
          if (api.has(e.naam.toLowerCase())) voeg(e.regel, e.kolom, "Declare-aanroep", "windows-api");
        }
        if (e.k === "lid") {
          const q = kwalificatie(e);
          if (!q) continue;
          const delen = q.toLowerCase().split(".");
          const laatste2 = delen.slice(-2).join(".");
          const a =
            GEWEIGERDE_LEDEN.get(laatste2) ??
            (delen[0] === "vba" ? GEWEIGERDE_FUNCTIES.get(delen[1]) : undefined) ??
            (delen.length >= 2 && delen[delen.length - 1] === "path" && delen.includes("currentproject")
              ? GEWEIGERDE_LEDEN.get("currentproject.path")
              : undefined);
          if (a) voeg(e.regel, e.kolom, a.naam, a.categorie);
        }
      }
    }
  // Dubbele meldingen (zelfde plek) samenvoegen
  const gezien = new Set<string>();
  return uit.filter((b) => {
    const k = `${b.regel}:${b.kolom}:${b.naam}`;
    if (gezien.has(k)) return false;
    gezien.add(k);
    return true;
  });
}
