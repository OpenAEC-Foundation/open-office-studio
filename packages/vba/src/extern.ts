/**
 * Statische analyse van externe afhankelijkheden van een VBA-project, zonder
 * iets uit te voeren: verwijzingen (typebibliotheken), Declare, CreateObject,
 * bestanden, Shell, omgeving, register, hyperlinks, gekoppelde tabellen en
 * namen uit ontbrekende bibliotheken. Daarna een aanroepgraaf over alle
 * modules en per procedure een status: uitvoerbaar, deels of niet.
 *
 * De uitkomst bevat geen broncode en geen verbindingsreeksen.
 */
import i18next from "i18next";
import type { Argument, Expr, ModuleAst, Procedure, Statement } from "./ast.ts";
import { scanAfscherming, statements, expressiesVan, type AfschermingCategorie } from "./afscherming.ts";
import { isFormulierLid } from "./access.ts";
import type {
  Afhankelijkheid,
  AfhankelijkheidSoort,
  Beschikbaarheid,
  ExterneAnalyse,
  GekoppeldeTabelAnalyse,
  GekoppeldeTabelInvoer,
  ProcedureAnalyse,
  ProcedureReden,
  ProcedureStatus,
  VerwijzingAnalyse,
  VerwijzingInvoer,
} from "./extern-typen.ts";
import { VbaRuntime, type ModuleBron } from "./interpreter.ts";
import { parseerModule } from "./parser.ts";
import { NAGEBOOTSTE_PROGIDS } from "./ontbrekend.ts";

// ---------- kennis over bibliotheken ----------

interface Bibliotheek {
  sleutel: string;
  status: Beschikbaarheid;
  namen: string[];
  guids: string[];
  /** Ongekwalificeerde typenamen die (vrijwel) alleen in deze bibliotheek voorkomen. */
  typen: string[];
  /** Constanten/enums (op voorvoegsel). */
  constanten?: RegExp;
  progids?: RegExp;
  /** Sleutel van de toelichting (`vba:extern.library.<sleutel>`); vertaald bij het opbouwen van het resultaat. */
  toelichting: string;
}

const BIBLIOTHEKEN: Bibliotheek[] = [
  {
    sleutel: "VBA",
    status: "ingebouwd",
    namen: ["vba"],
    guids: ["000204ef-0000-0000-c000-000000000046"],
    typen: ["collection", "errobject"],
    toelichting: "vba",
  },
  {
    sleutel: "Access",
    status: "ingebouwd",
    namen: ["access"],
    guids: ["4affc9a0-5f99-101b-af4e-00aa003f0f07"],
    typen: [
      "form", "report", "control", "controls", "textbox", "combobox", "listbox", "label", "commandbutton", "checkbox",
      "optiongroup", "optionbutton", "togglebutton", "subform", "subreport", "image", "section", "accessobject",
      "currentproject", "codeproject", "docmd", "screen", "tabcontrol", "page", "pages", "rectangle", "line",
      "boundobjectframe", "objectframe", "attachment", "forms", "reports", "module", "modules", "reference", "references",
      "allforms", "allreports", "accessfield", "groupLevel", "printer", "webbrowsercontrol", "navigationcontrol", "navigationbutton",
      "customcontrol", "chart", "pagebreak", "emptycell", "formatcondition", "formatconditions", "hyperlink", "tempvar", "tempvars",
    ].map((t) => t.toLowerCase()),
    progids: /^access\.application/i,
    toelichting: "access",
  },
  {
    sleutel: "DAO",
    status: "ingebouwd",
    namen: ["dao"],
    guids: ["00025e01-0000-0000-c000-000000000046", "4ac9e1da-5bad-4ac7-86e3-24f4cdceca28"],
    typen: [
      "database", "recordset", "recordset2", "querydef", "querydefs", "tabledef", "tabledefs", "field", "field2", "fields",
      "index", "indexes", "relation", "relations", "workspace", "workspaces", "dbengine", "parameter", "parameters",
      "property", "properties", "container", "containers", "document", "documents", "recordsets", "databases", "group", "user",
    ],
    toelichting: "dao",
  },
  {
    sleutel: "stdole",
    status: "ingebouwd",
    namen: ["stdole"],
    guids: ["00020430-0000-0000-c000-000000000046"],
    typen: [],
    toelichting: "stdole",
  },
  {
    sleutel: "Scripting",
    status: "deels",
    namen: ["scripting"],
    guids: ["420b2830-e718-11cf-893d-00a0c9054228"],
    typen: ["filesystemobject", "textstream", "file", "folder", "drive", "files", "folders", "drives"],
    progids: /^scripting\./i,
    toelichting: "scripting",
  },
  {
    sleutel: "Office",
    status: "ontbreekt",
    namen: ["office"],
    guids: ["2df8d04c-5bfa-101b-bde5-00aa0044de52"],
    typen: ["commandbar", "commandbars", "commandbarcontrol", "commandbarcontrols", "commandbarbutton", "commandbarpopup", "commandbarcombobox", "filedialog", "filedialogfilters", "filedialogselecteditems", "iribbonui", "iribboncontrol"],
    constanten: /^mso[A-Z]/,
    toelichting: "office",
  },
  {
    sleutel: "Excel",
    status: "ontbreekt",
    namen: ["excel"],
    guids: ["00020813-0000-0000-c000-000000000046"],
    typen: ["workbook", "workbooks", "worksheet", "worksheets", "range", "sheets", "worksheetfunction", "pivottable", "chartobject", "listobject"],
    constanten: /^xl[A-Z]/,
    progids: /^excel\./i,
    toelichting: "excel",
  },
  {
    sleutel: "Word",
    status: "ontbreekt",
    namen: ["word"],
    guids: ["00020905-0000-0000-c000-000000000046"],
    typen: ["paragraph", "paragraphs", "bookmarks", "contentcontrol"],
    constanten: /^wd[A-Z]/,
    progids: /^word\./i,
    toelichting: "word",
  },
  {
    sleutel: "Outlook",
    status: "ontbreekt",
    namen: ["outlook"],
    guids: ["00062fff-0000-0000-c000-000000000046"],
    typen: ["mailitem", "appointmentitem", "contactitem", "taskitem", "mapifolder", "recipient", "recipients", "inspector", "explorer", "olkitem"],
    constanten: /^ol[A-Z]/,
    progids: /^outlook\./i,
    toelichting: "outlook",
  },
  {
    sleutel: "PowerPoint",
    status: "ontbreekt",
    namen: ["powerpoint"],
    guids: ["91493440-5a91-11cf-8700-00aa0060263b"],
    typen: ["presentation", "slide", "slides"],
    constanten: /^pp[A-Z]/,
    progids: /^powerpoint\./i,
    toelichting: "powerPoint",
  },
  {
    sleutel: "ADODB",
    status: "ontbreekt",
    namen: ["adodb", "ado"],
    guids: ["2a75196c-d9eb-4129-b803-931327f72d5c", "00000200-0000-0010-8000-00aa006d2ea4", "00000201-0000-0010-8000-00aa006d2ea4", "00000205-0000-0010-8000-00aa006d2ea4", "00000206-0000-0010-8000-00aa006d2ea4", "ef53050b-882e-4776-b643-eda472e8e3f2", "b691e011-1797-432e-907a-4d8c69339129"],
    typen: ["command", "stream", "adoconnection", "adorecordset"],
    constanten: /^ad[A-Z]/,
    progids: /^adodb\./i,
    toelichting: "adodb",
  },
  {
    sleutel: "ADOX",
    status: "ontbreekt",
    namen: ["adox"],
    guids: ["00000600-0000-0010-8000-00aa006d2ea4"],
    typen: ["catalog"],
    progids: /^adox\./i,
    toelichting: "adox",
  },
  {
    sleutel: "MSXML",
    status: "ontbreekt",
    namen: ["msxml2", "msxml", "msxml6", "msxml3"],
    guids: ["f5078f18-c551-11d3-89b9-0000f81fe221", "f5078f1b-c551-11d3-89b9-0000f81fe221", "d63e0ce2-a0a2-11d0-9c02-00c04fc99c8e"],
    typen: ["domdocument", "domdocument60", "domdocument40", "domdocument30", "xmlhttp", "xmlhttp60", "serverxmlhttp", "serverxmlhttp60", "ixmldomnode", "ixmldomelement", "ixmldomnodelist", "ixmldomdocument", "ixmldomattribute"],
    progids: /^(msxml2?\.|microsoft\.xml)/i,
    toelichting: "msxml",
  },
  {
    sleutel: "Windows Script Host",
    status: "ontbreekt",
    namen: ["iwshruntimelibrary", "wshom"],
    guids: ["f935dc20-1cf0-11d0-adb9-00c04fd58a0b"],
    typen: ["wshshell", "iwshshell", "wshnetwork", "iwshshortcut", "wshshortcut"],
    progids: /^wscript\./i,
    toelichting: "windowsScriptHost",
  },
  {
    sleutel: "VBIDE",
    status: "ontbreekt",
    namen: ["vbide"],
    guids: ["0002e157-0000-0000-c000-000000000046"],
    typen: ["vbcomponent", "vbcomponents", "vbproject", "codemodule"],
    constanten: /^vbext_/,
    toelichting: "vbide",
  },
  {
    sleutel: "Shell32",
    status: "ontbreekt",
    namen: ["shell32", "shell"],
    guids: ["50a7e9b0-70ef-11d1-b75a-00a0c90564fe"],
    typen: ["shell32", "folder2", "folderitem", "folderitems"],
    progids: /^shell\.application/i,
    toelichting: "shell32",
  },
  {
    sleutel: "VBScript RegExp",
    status: "ontbreekt",
    namen: ["vbscript_regexp_55", "vbscript_regexp_10", "vbscript"],
    guids: ["3f4daca7-160d-11d2-a8e9-00104b365c9f", "3f4daca0-160d-11d2-a8e9-00104b365c9f"],
    typen: ["regexp", "matchcollection", "match", "submatches"],
    progids: /^vbscript\.regexp/i,
    toelichting: "vbscriptRegExp",
  },
  {
    sleutel: "CDO",
    status: "ontbreekt",
    namen: ["cdo"],
    guids: ["cd000000-8b95-11d1-82db-00c04fb1625d"],
    typen: [],
    progids: /^cdo\./i,
    toelichting: "cdo",
  },
  {
    sleutel: "WinHTTP",
    status: "ontbreekt",
    namen: ["winhttp"],
    guids: ["662901fc-6951-4854-9eb2-d9a2570f2b2e"],
    typen: ["winhttprequest"],
    progids: /^winhttp\./i,
    toelichting: "winHttp",
  },
  {
    sleutel: "MSForms",
    status: "ontbreekt",
    namen: ["msforms"],
    guids: ["0d452ee1-e08f-101a-852e-02608c4d0bb4"],
    typen: ["dataobject", "userform"],
    toelichting: "msForms",
  },
  {
    sleutel: "Common Controls (OCX)",
    status: "ontbreekt",
    namen: ["mscomctllib", "mscomctl", "comctllib", "mscomdlg", "mscomct2", "mscomctl2"],
    guids: ["831fdd16-0c5c-11d2-a9fc-0000f8754da1", "f9043c88-f6f2-101a-a3c9-08002b2f49fb", "86cf1d34-0c5f-11d2-a9fc-0000f8754da1", "6b7e6392-850a-101b-afc0-4210102a8da7"],
    typen: ["listitem", "listitems", "treeview", "listview", "imagelist", "progressbar", "statusbar", "commondialog", "columnheader", "node", "nodes", "slider", "dtpicker", "monthview"],
    toelichting: "commonControls",
  },
];

const PER_NAAM = new Map<string, Bibliotheek>();
const PER_GUID = new Map<string, Bibliotheek>();
for (const b of BIBLIOTHEKEN) {
  for (const n of b.namen) PER_NAAM.set(n, b);
  for (const g of b.guids) PER_GUID.set(g, b);
}

/** Leest een libid (`*\G{GUID}#versie#lcid#pad#omschrijving`). */
export function leesLibid(libid: string) {
  const guid = /\{([0-9a-f-]{36})\}/i.exec(libid)?.[1]?.toLowerCase();
  const delen = libid.split("#");
  const versie = delen.length >= 2 && /^[0-9a-f.]+$/i.test(delen[1]) ? delen[1] : undefined;
  const pad = delen.length >= 4 ? delen[3] || undefined : /^\*\\[CDH]/i.test(libid) ? libid.replace(/^\*\\[A-Z]/i, "") : undefined;
  const omschrijving = delen.length >= 5 ? delen.slice(4).join("#") || undefined : undefined;
  return { guid, versie, pad, omschrijving };
}

function bibliotheekVanVerwijzing(v: VerwijzingInvoer): Bibliotheek | undefined {
  const guid = (v.guid ?? (v.libid ? leesLibid(v.libid).guid : undefined))?.toLowerCase().replace(/[{}]/g, "");
  return (guid ? PER_GUID.get(guid) : undefined) ?? PER_NAAM.get(v.naam.toLowerCase());
}

/** Bibliotheek bij een (gekwalificeerde) typenaam, of undefined als het een VBA-/projecttype is. */
function bibliotheekVanType(type: string, metAdo: boolean, metDao: boolean): Bibliotheek | undefined {
  const delen = type.toLowerCase().split(".");
  if (delen.length > 1) return PER_NAAM.get(delen[0]) ?? (PER_NAAM.get(delen[0]) === undefined ? onbekendeBibliotheek(type.split(".")[0]) : undefined);
  const t = delen[0];
  // Ongekwalificeerd: ADODB alleen als er geen DAO-verwijzing is (Recordset, Connection, Field …).
  if (metAdo && !metDao && ["recordset", "connection", "field", "fields", "parameter", "parameters", "property", "properties"].includes(t))
    return PER_NAAM.get("adodb");
  if (t === "connection") return metAdo ? PER_NAAM.get("adodb") : undefined;
  for (const b of BIBLIOTHEKEN) if (b.typen.includes(t)) return b;
  return undefined;
}

const ONBEKEND_CACHE = new Map<string, Bibliotheek>();
function onbekendeBibliotheek(naam: string): Bibliotheek {
  const k = naam.toLowerCase();
  let b = ONBEKEND_CACHE.get(k);
  if (!b) {
    b = { sleutel: naam, status: "ontbreekt", namen: [k], guids: [], typen: [], toelichting: "unknownLibrary" };
    ONBEKEND_CACHE.set(k, b);
  }
  return b;
}

function bibliotheekVanProgId(progid: string): Bibliotheek | undefined {
  for (const b of BIBLIOTHEKEN) if (b.progids?.test(progid)) return b;
  return undefined;
}

export { NAGEBOOTSTE_PROGIDS };

const VBA_TYPEN = new Set([
  "byte", "integer", "long", "longptr", "longlong", "single", "double", "currency", "decimal", "string", "boolean",
  "date", "variant", "object", "any", "collection", "errobject", "vba.collection",
]);

// ---------- AST-hulpmiddelen ----------

interface Context {
  /** Binnen If/Select-tak. */
  voorwaarde: boolean;
}

/** Statements met hun context (voorwaardelijk of niet). */
function* metContext(lijst: Statement[], ctx: Context): Generator<[Statement, Context]> {
  for (const s of lijst) {
    yield [s, ctx];
    switch (s.k) {
      case "if":
        for (const t of s.takken) yield* metContext(t.body, { voorwaarde: true });
        if (s.anders) yield* metContext(s.anders, { voorwaarde: true });
        break;
      case "select":
        for (const g of s.gevallen) yield* metContext(g.body, { voorwaarde: true });
        if (s.anders) yield* metContext(s.anders, { voorwaarde: true });
        break;
      case "for":
      case "foreach":
      case "do":
      case "with":
        yield* metContext(s.body, ctx);
        break;
    }
  }
}

function* alleExpressies(e: Expr | null | undefined): Generator<Expr> {
  if (!e) return;
  yield e;
  switch (e.k) {
    case "lid":
    case "bang":
      yield* alleExpressies(e.obj);
      break;
    case "aanroep":
      yield* alleExpressies(e.doel);
      for (const a of e.args) yield* alleExpressies(a.waarde);
      break;
    case "bin":
      yield* alleExpressies(e.l);
      yield* alleExpressies(e.r);
      break;
    case "un":
    case "haakjes":
    case "typeof":
      yield* alleExpressies(e.e);
      break;
  }
}

function kwalificatie(e: Expr | null): string | null {
  if (!e) return null;
  if (e.k === "id") return e.naam;
  if (e.k === "lid") {
    const o = kwalificatie(e.obj);
    return o ? `${o}.${e.naam}` : null;
  }
  if (e.k === "aanroep") return kwalificatie(e.doel);
  return null;
}

const letterlijk = (a: Argument | undefined) => (a?.waarde?.k === "lit" && a.waarde.w.t === "tekst" ? a.waarde.w.v : null);

// ---------- invoer ----------

export interface GeparsteModule {
  naam: string;
  soort: "module" | "klasse" | "formulier";
  ast: ModuleAst;
  parseerfout: boolean;
}

export interface ExternOpties {
  verwijzingen?: VerwijzingInvoer[];
  gekoppeldeTabellen?: GekoppeldeTabelInvoer[];
}

/** Parset de modules en analyseert ze. */
export function analyseerExtern(modules: ModuleBron[], opties: ExternOpties = {}): ExterneAnalyse {
  return analyseerExternGeparst(
    modules.map((m) => {
      const { module, fouten } = parseerModule(m.bron, m.naam, m.soort);
      return { naam: m.naam, soort: m.soort, ast: module, parseerfout: fouten.length > 0 };
    }),
    opties,
  );
}

let BEKEND: VbaRuntime | null = null;
const isIngebouwd = (naam: string) => (BEKEND ??= new VbaRuntime({})).isBekend(naam);

const CATEGORIE_SOORT: Record<AfschermingCategorie, AfhankelijkheidSoort> = {
  proces: "proces",
  bestand: "bestand",
  com: "createobject",
  "windows-api": "declare",
  toetsenbord: "toetsenbord",
  omgeving: "omgeving",
  register: "register",
  hyperlink: "hyperlink",
  export: "export",
  project: "bibliotheek",
};

const ERNST: Record<ProcedureStatus, number> = { uitvoerbaar: 0, deels: 1, niet: 2 };

export function analyseerExternGeparst(modules: GeparsteModule[], opties: ExternOpties = {}): ExterneAnalyse {
  const verwijzingen: VerwijzingAnalyse[] = (opties.verwijzingen ?? []).map((v) => {
    const b = bibliotheekVanVerwijzing(v);
    const l = v.libid ? leesLibid(v.libid) : { guid: undefined, versie: undefined, pad: undefined, omschrijving: undefined };
    const soort = v.soort ?? "Onbekend";
    const status: Beschikbaarheid = b?.status ?? "ontbreekt";
    return {
      naam: v.naam,
      soort,
      ...((v.guid ?? l.guid) ? { guid: (v.guid ?? l.guid)!.replace(/[{}]/g, "").toLowerCase() } : {}),
      ...((v.versie ?? l.versie) ? { versie: v.versie ?? l.versie } : {}),
      ...((v.pad ?? l.pad) ? { pad: v.pad ?? l.pad } : {}),
      ...((v.omschrijving ?? l.omschrijving) ? { omschrijving: v.omschrijving ?? l.omschrijving } : {}),
      bibliotheek: b?.sleutel ?? v.naam,
      status,
      toelichting:
        i18next.t(
          `vba:extern.library.${
            b?.toelichting ??
            (soort === "Projectverwijzing"
              ? "projectReference"
              : soort === "ActiveX-besturingselement"
                ? "activeXControl"
                : "unknownTypeLibrary")
          }`,
        ),
      gebruiktDoor: [],
    };
  });
  const verwezen = new Set(verwijzingen.map((v) => v.bibliotheek.toLowerCase()));
  const metAdo = verwezen.has("adodb");
  const metDao = verwezen.has("dao") || !opties.verwijzingen?.length;

  // Projectnamen
  const moduleNamen = new Map(modules.map((m) => [m.naam.toLowerCase(), m]));
  const klassen = new Set(modules.filter((m) => m.soort === "klasse").map((m) => m.naam.toLowerCase()));
  const gedefinieerd = new Set<string>(moduleNamen.keys());
  const typenInProject = new Set<string>(moduleNamen.keys());
  const declares = new Map<string, { bibliotheek: string; naam: string; module: string; publiek: boolean }>();
  for (const m of modules) {
    const ast = m.ast;
    for (const t of ast.typen) typenInProject.add(t.naam.toLowerCase());
    for (const e of ast.enums) {
      typenInProject.add(e.naam.toLowerCase());
      gedefinieerd.add(e.naam.toLowerCase());
      for (const l of e.leden) gedefinieerd.add(l.naam.toLowerCase());
    }
    for (const v of ast.variabelen) gedefinieerd.add(v.naam.toLowerCase());
    for (const c of ast.constanten) gedefinieerd.add(c.naam.toLowerCase());
    for (const d of ast.declares) {
      gedefinieerd.add(d.naam.toLowerCase());
      declares.set(`${m.naam.toLowerCase()}.${d.naam.toLowerCase()}`, {
        bibliotheek: d.bibliotheek.replace(/^"|"$/g, ""),
        naam: (d.alias ?? d.naam).replace(/^"|"$/g, ""),
        module: m.naam,
        publiek: true,
      });
    }
    for (const p of ast.procedures) {
      gedefinieerd.add(p.naam.toLowerCase());
      for (const x of p.parameters) gedefinieerd.add(x.naam.toLowerCase());
      for (const s of statements(p.body)) {
        if (s.k === "dim") for (const v of s.variabelen) gedefinieerd.add(v.naam.toLowerCase());
        if (s.k === "const") for (const c of s.constanten) gedefinieerd.add(c.naam.toLowerCase());
        if (s.k === "redim") for (const v of s.variabelen) if (v.doel.k === "id") gedefinieerd.add(v.doel.naam.toLowerCase());
        if ((s.k === "let" || s.k === "set") && s.doel.k === "id") gedefinieerd.add(s.doel.naam.toLowerCase());
        if ((s.k === "for" || s.k === "foreach") && s.teller.k === "id") gedefinieerd.add(s.teller.naam.toLowerCase());
        if (s.k === "label") gedefinieerd.add(s.naam.toLowerCase());
      }
    }
  }
  const zoekDeclare = (m: GeparsteModule, naam: string) => {
    const k = naam.toLowerCase();
    return declares.get(`${m.naam.toLowerCase()}.${k}`) ?? [...declares.entries()].find(([sl]) => sl.endsWith(`.${k}`))?.[1];
  };

  // Procedures en index voor de aanroepgraaf
  const procedures: ProcedureAnalyse[] = [];
  const perSleutel = new Map<string, ProcedureAnalyse>();
  const procIndex = new Map<string, Map<string, string>>(); // module → naam → sleutel
  const publiek = new Map<string, string>(); // naam → sleutel (standaardmodules)
  for (const m of modules) {
    const idx = new Map<string, string>();
    procIndex.set(m.naam.toLowerCase(), idx);
    for (const p of m.ast.procedures) {
      const sleutel = `${m.naam}.${p.naam}`;
      if (!idx.has(p.naam.toLowerCase())) idx.set(p.naam.toLowerCase(), sleutel);
      if (m.soort === "module" && p.zichtbaarheid !== "private" && !publiek.has(p.naam.toLowerCase())) publiek.set(p.naam.toLowerCase(), sleutel);
      if (perSleutel.has(sleutel)) continue; // Property Get/Let/Set: één knoop
      const a: ProcedureAnalyse = {
        sleutel,
        module: m.naam,
        moduleSoort: m.soort,
        naam: p.naam,
        soort: p.soort,
        publiek: p.zichtbaarheid !== "private",
        zonderVerplichteParameters: p.parameters.every((x) => x.optioneel || x.paramArray),
        gebeurtenis: m.soort === "formulier" && /^[A-Za-z0-9]+_[A-Za-z]+$/.test(p.naam),
        regel: p.regel,
        status: "uitvoerbaar",
        redenen: [],
        roeptAan: [],
        aangeroepenDoor: [],
        foutafhandeling: statementsZijn(p.body, (s) => s.k === "onerror" && s.soort !== "uit"),
      };
      procedures.push(a);
      perSleutel.set(sleutel, a);
    }
  }

  const afhankelijkheden: Afhankelijkheid[] = [];
  const gekoppeld = new Map<string, GekoppeldeTabelAnalyse>();
  for (const t of opties.gekoppeldeTabellen ?? [])
    gekoppeld.set(t.naam.toLowerCase(), { naam: t.naam, bron: t.bron ?? "gekoppeld", status: t.inWerkkopie ? "ingebouwd" : "ontbreekt", gebruiktDoor: [] });
  const gekoppeldePatronen = [...gekoppeld.values()].map((t) => ({
    t,
    re: new RegExp(`(^|[^\\p{L}\\p{N}_])${t.naam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}_])`, "iu"),
  }));

  // Directe redenen en aanroepen per procedure
  const directe = new Map<string, { reden: ProcedureReden; afh: Afhankelijkheid }[]>();
  const aanroepen = new Map<string, Map<string, boolean>>(); // sleutel → doel → omzeilbaar (alle aanroepplekken)
  const bibGebruik = new Map<string, Set<string>>(); // bibliotheek → procedures

  for (const m of modules) {
    // Moduleniveau: objecttypen van moduleniveauvariabelen (geen procedure)
    for (const v of m.ast.variabelen) {
      const t = v.type?.naam;
      if (!t) continue;
      const b = typeBibliotheek(t);
      if (b && b.status !== "ingebouwd")
        afhankelijkheden.push({ soort: "bibliotheek", naam: t, bibliotheek: b.sleutel, status: b.status, module: m.naam, regel: v.regel, omzeilbaar: true });
    }
    const bevindingen = scanAfscherming(m.ast);
    const klasseVars = new Map<string, string>();
    for (const v of m.ast.variabelen) if (v.type && klassen.has(v.type.naam.toLowerCase())) klasseVars.set(v.naam.toLowerCase(), v.type.naam.toLowerCase());

    const verwerkt = new Set<Procedure>();
    for (const p of m.ast.procedures) {
      const sleutel = `${m.naam}.${p.naam}`;
      const lijst = directe.get(sleutel) ?? [];
      directe.set(sleutel, lijst);
      const naar = aanroepen.get(sleutel) ?? new Map<string, boolean>();
      aanroepen.set(sleutel, naar);
      if (verwerkt.has(p)) continue;
      verwerkt.add(p);
      if (m.parseerfout) continue;
      const foutRegels = [...statements(p.body)].filter((s) => s.k === "onerror" && s.soort !== "uit").map((s) => s.regel);
      const beschermd = (regel: number) => foutRegels.some((r) => r <= regel);
      const lokaleKlassen = new Map(klasseVars);
      const voeg = (a: Omit<Afhankelijkheid, "module" | "procedure" | "omzeilbaar">, ctx: Context, oorzaak: string) => {
        const omzeilbaar = ctx.voorwaarde || beschermd(a.regel);
        const afh: Afhankelijkheid = { ...a, module: m.naam, procedure: p.naam, omzeilbaar };
        afhankelijkheden.push(afh);
        if (a.bibliotheek) {
          const s = bibGebruik.get(a.bibliotheek.toLowerCase()) ?? new Set();
          s.add(sleutel);
          bibGebruik.set(a.bibliotheek.toLowerCase(), s);
        }
        if (a.status === "ingebouwd") return;
        if (lijst.some((x) => x.reden.oorzaak === oorzaak && x.reden.omzeilbaar === omzeilbaar)) return;
        lijst.push({ reden: { oorzaak, soort: a.soort, ...(a.bibliotheek ? { bibliotheek: a.bibliotheek } : {}), status: a.status, omzeilbaar, keten: [sleutel] }, afh });
      };
      const voegType = (t: string, regel: number, ctx: Context, wat: string) => {
        const b = typeBibliotheek(t);
        if (b) voeg({ soort: "bibliotheek", naam: t, bibliotheek: b.sleutel, status: b.status, regel }, ctx, `${wat} ${t} (${b.sleutel})`);
      };
      const voegAanroep = (doel: string | undefined, ctx: Context, regel: number) => {
        if (!doel || doel === sleutel) return;
        const omz = ctx.voorwaarde || beschermd(regel);
        naar.set(doel, (naar.get(doel) ?? true) && omz);
      };
      // Parameters en resultaattype
      for (const x of p.parameters) if (x.type) voegType(x.type.naam, x.regel, { voorwaarde: false }, i18next.t("vba:extern.cause.parameterAs"));
      if (p.type) voegType(p.type.naam, p.regel, { voorwaarde: false }, i18next.t("vba:extern.cause.returnAs"));
      // Bevindingen van de afscherming binnen deze procedure
      const ctxPerRegel = new Map<number, Context>();
      for (const [s, ctx] of metContext(p.body, { voorwaarde: false })) if (!ctxPerRegel.has(s.regel) || !ctx.voorwaarde) ctxPerRegel.set(s.regel, ctx);
      for (const b of bevindingen) {
        if (b.regel < p.regel || b.regel > p.eindRegel) continue;
        if (b.naam === "Declare" || b.naam === "Declare-aanroep" || b.naam === "CreateObject" || b.naam === "GetObject") continue;
        const soort = /currentproject\.path|codeproject\.path|fullname|\.name$/i.test(b.naam) ? "pad" : CATEGORIE_SOORT[b.categorie];
        const ctx = ctxPerRegel.get(b.regel) ?? { voorwaarde: false };
        const isAdo = /connection$/i.test(b.naam);
        if (b.categorie === "project") {
          voeg({ soort: "bibliotheek", naam: b.naam, bibliotheek: "VBIDE", status: "ontbreekt", regel: b.regel }, ctx, `${b.naam} (VBIDE)`);
          continue;
        }
        if (/filedialog$/i.test(b.naam)) continue; // hieronder als Office
        voeg(
          { soort: isAdo ? "bibliotheek" : soort, naam: b.naam, ...(isAdo ? { bibliotheek: "ADODB" } : {}), status: "ontbreekt", regel: b.regel },
          ctx,
          isAdo ? `${b.naam} (ADODB)` : b.naam,
        );
      }
      for (const [s, ctx] of metContext(p.body, { voorwaarde: false })) {
        if (s.k === "dim")
          for (const v of s.variabelen) {
            if (!v.type) continue;
            if (klassen.has(v.type.naam.toLowerCase())) {
              lokaleKlassen.set(v.naam.toLowerCase(), v.type.naam.toLowerCase());
              if (v.type.nieuw) voegAanroep(procIndex.get(v.type.naam.toLowerCase())?.get("class_initialize"), ctx, s.regel);
              continue;
            }
            voegType(v.type.naam, v.regel, ctx, v.type.nieuw ? "Dim As New" : "Dim As");
          }
        if (s.k === "redim") for (const v of s.variabelen) if (v.type) voegType(v.type.naam, s.regel, ctx, "ReDim As");
        // Aanroepen als statement zonder haakjes: `Proc` of `Module.Proc`
        if (s.k === "call") {
          if (s.doel.k === "id") behandelNaam(s.doel.naam, s.args, true, s.regel, ctx);
        }
        if (s.k === "set" && s.doel.k === "id" && s.waarde.k === "nieuw" && klassen.has(s.waarde.type.toLowerCase()))
          lokaleKlassen.set(s.doel.naam.toLowerCase(), s.waarde.type.toLowerCase());
        const doelen = new Set<Expr>();
        if (s.k === "call") doelen.add(s.doel);
        for (const top of expressiesVanTop(s))
          for (const e of alleExpressies(top)) if (e.k === "aanroep") doelen.add(e.doel);
        for (const top of expressiesVanTop(s))
          for (const e of alleExpressies(top)) {
            const regel = e.regel || s.regel;
            if (e.k === "nieuw") {
              const k = e.type.toLowerCase();
              if (klassen.has(k)) voegAanroep(procIndex.get(k)?.get("class_initialize"), ctx, regel);
              else if (!typenInProject.has(k)) {
                const b = typeBibliotheek(e.type) ?? (VBA_TYPEN.has(k) || k === "dictionary" || k === "scripting.dictionary" ? undefined : onbekendeBibliotheek(e.type.split(".")[0]));
                if (b) voeg({ soort: "bibliotheek", naam: e.type, bibliotheek: b.sleutel, status: b.status, regel }, ctx, `New ${e.type} (${b.sleutel})`);
              }
            }
            if (e.k === "typeof") voegType(e.type, regel, ctx, "TypeOf Is");
            if (e.k === "aanroep" && e.doel.k === "id") behandelNaam(e.doel.naam, e.args, true, regel, ctx);
            if (e.k === "id" && !doelen.has(e)) behandelNaam(e.naam, [], false, regel, ctx);
            if (e.k === "lid") {
              const q = kwalificatie(e);
              const ql = q?.toLowerCase();
              // Module.Proc
              if (e.obj?.k === "id") {
                const objK = e.obj.naam.toLowerCase();
                const doelMod = procIndex.get(objK);
                if (doelMod && moduleNamen.get(objK)?.soort !== "klasse") voegAanroep(doelMod.get(e.naam.toLowerCase()), ctx, regel);
                const klasse = lokaleKlassen.get(objK);
                if (klasse) voegAanroep(procIndex.get(klasse)?.get(e.naam.toLowerCase()), ctx, regel);
                // Enum of constante uit een bibliotheek: xlUp via Excel.XlDirection.xlUp of Excel.xlUp
                const b = PER_NAAM.get(objK);
                if (b && !gedefinieerd.has(objK) && b.status !== "ingebouwd")
                  voeg({ soort: "bibliotheek", naam: `${e.obj.naam}.${e.naam}`, bibliotheek: b.sleutel, status: b.status, regel }, ctx, `${e.obj.naam}.${e.naam} (${b.sleutel})`);
              }
              if (ql && /(^|\.)application\.filedialog$/.test(ql))
                voeg({ soort: "bibliotheek", naam: "Application.FileDialog", bibliotheek: "Office", status: "ontbreekt", regel }, ctx, "Application.FileDialog (Office)");
              if (ql && /(^|\.)(application\.)?commandbars$/.test(ql))
                voeg({ soort: "bibliotheek", naam: "CommandBars", bibliotheek: "Office", status: "ontbreekt", regel }, ctx, "CommandBars (Office)");
              if (ql && /^(application\.)?vbe\./.test(ql) && e.obj?.k === "id")
                voeg({ soort: "bibliotheek", naam: "VBE", bibliotheek: "VBIDE", status: "ontbreekt", regel }, ctx, "VBE (VBIDE)");
              if (/^(connect|refreshlink)$/i.test(e.naam))
                voeg({ soort: "gekoppelde-tabel", naam: `TableDef.${e.naam}`, status: "ontbreekt", regel }, ctx, i18next.t("vba:extern.cause.tableDefLink", { member: `TableDef.${e.naam}` }));
              if (/^opendatabase$/i.test(e.naam))
                voeg({ soort: "externe-database", naam: "OpenDatabase", status: "ontbreekt", regel, foutnummer: 3024 }, ctx, i18next.t("vba:extern.cause.openDatabase"));
            }
            if (e.k === "aanroep" && e.doel.k === "lid" && /^run$/i.test(e.doel.naam)) {
              const naam = letterlijk(e.args[0]);
              if (naam) voegAanroep(zoekProc(naam), ctx, regel);
            }
            if (e.k === "lit" && e.w.t === "tekst" && gekoppeldePatronen.length)
              for (const { t, re } of gekoppeldePatronen)
                if (re.test(e.w.v)) {
                  if (!t.gebruiktDoor.includes(sleutel)) t.gebruiktDoor.push(sleutel);
                  voeg({ soort: "gekoppelde-tabel", naam: t.naam, status: t.status, regel }, ctx, i18next.t("vba:extern.cause.linkedTable", { name: t.naam }));
                }
          }
        if (s.k === "call" && s.doel.k === "lid" && /^run$/i.test(s.doel.naam)) {
          const naam = letterlijk(s.args[0]);
          if (naam) voegAanroep(zoekProc(naam), ctx, s.regel);
        }
      }

      function behandelNaam(naam: string, args: Argument[], alsAanroep: boolean, regel: number, ctx: Context) {
        const k = naam.toLowerCase();
        // Eigen of publieke procedure
        const doel = procIndex.get(m.naam.toLowerCase())?.get(k) ?? publiek.get(k);
        if (doel) {
          voegAanroep(doel, ctx, regel);
          return;
        }
        const d = zoekDeclare(m, naam);
        if (d) {
          voeg({ soort: "declare", naam: `${d.bibliotheek}!${d.naam}`, bibliotheek: d.bibliotheek, status: "ontbreekt", regel, foutnummer: 453 }, ctx, `Declare ${d.bibliotheek}!${d.naam}`);
          return;
        }
        if (k === "createobject" || k === "getobject") {
          const progid = letterlijk(args[0]) ?? (k === "getobject" ? letterlijk(args[1]) : null);
          const label = progid ?? i18next.t("vba:extern.cause.dynamic");
          if (k === "createobject" && progid && NAGEBOOTSTE_PROGIDS.has(progid.toLowerCase())) {
            voeg({ soort: "createobject", naam: progid, bibliotheek: "Scripting", status: "ingebouwd", regel }, ctx, `CreateObject("${progid}")`);
            return;
          }
          const b = progid ? bibliotheekVanProgId(progid) : undefined;
          voeg(
            { soort: "createobject", naam: label, ...(b ? { bibliotheek: b.sleutel } : {}), status: "ontbreekt", regel, foutnummer: 429 },
            ctx,
            `${naam}(${progid ? `"${progid}"` : "…"})`,
          );
          return;
        }
        if (gedefinieerd.has(k) || isIngebouwd(k) || PER_NAAM.has(k)) return;
        if (m.soort === "formulier" && (isFormulierLid(k) || !alsAanroep)) return;
        for (const b of BIBLIOTHEKEN)
          if (b.constanten?.test(naam) && b.status !== "ingebouwd") {
            voeg({ soort: "bibliotheek", naam, bibliotheek: b.sleutel, status: b.status, regel }, ctx, i18next.t("vba:extern.cause.constant", { name: naam, library: b.sleutel }));
            return;
          }
        if (alsAanroep || m.ast.opties.expliciet)
          voeg(
            { soort: "onbekend", naam, status: "ontbreekt", regel, foutnummer: alsAanroep ? 35 : 5 },
            ctx,
            alsAanroep ? i18next.t("vba:extern.cause.unknownFunction", { name: naam }) : i18next.t("vba:extern.cause.unknownName", { name: naam }),
          );
      }
    }
  }

  function typeBibliotheek(t: string): Bibliotheek | undefined {
    const k = t.toLowerCase();
    if (VBA_TYPEN.has(k) || typenInProject.has(k) || typenInProject.has(k.split(".").pop()!)) return undefined;
    if (k === "dictionary" || k === "scripting.dictionary") return undefined;
    return bibliotheekVanType(t, metAdo, metDao);
  }

  function zoekProc(naam: string): string | undefined {
    const [a, b] = naam.includes(".") ? naam.split(".") : [null, naam];
    if (a) return procIndex.get(a.toLowerCase())?.get(b.toLowerCase());
    return publiek.get(b.toLowerCase());
  }

  // Aanroepgraaf
  for (const [van, naar] of aanroepen) {
    const p = perSleutel.get(van);
    if (!p) continue;
    for (const doel of naar.keys()) {
      if (!perSleutel.has(doel)) continue;
      if (!p.roeptAan.includes(doel)) p.roeptAan.push(doel);
      const d = perSleutel.get(doel)!;
      if (!d.aangeroepenDoor.includes(van)) d.aangeroepenDoor.push(van);
    }
  }

  // Redenen: direct, en via de aanroepgraaf tot een vast punt
  const ernst = (r: ProcedureReden): ProcedureStatus => (r.status === "ingebouwd" ? "uitvoerbaar" : r.status === "ontbreekt" && !r.omzeilbaar ? "niet" : "deels");
  const MAX_REDENEN = 25;
  for (const p of procedures) {
    const m = moduleNamen.get(p.module.toLowerCase())!;
    if (m.parseerfout) p.redenen.push({ oorzaak: i18next.t("vba:extern.cause.moduleSyntaxError"), soort: "syntaxis", status: "ontbreekt", omzeilbaar: false, keten: [p.sleutel] });
    for (const { reden } of directe.get(p.sleutel) ?? []) p.redenen.push(reden);
  }
  for (let ronde = 0, veranderd = true; veranderd && ronde < 100; ronde++) {
    veranderd = false;
    for (const p of procedures) {
      const naar = aanroepen.get(p.sleutel);
      if (!naar) continue;
      for (const [doel, omz] of naar) {
        const d = perSleutel.get(doel);
        if (!d || d === p) continue;
        for (const r of d.redenen) {
          if (p.redenen.length >= MAX_REDENEN) break;
          if (r.keten.includes(p.sleutel)) continue;
          const omzeilbaar = omz || r.omzeilbaar;
          const bestaand = p.redenen.find((x) => x.oorzaak === r.oorzaak);
          if (bestaand && (bestaand.omzeilbaar === omzeilbaar || !bestaand.omzeilbaar)) continue;
          if (bestaand) {
            Object.assign(bestaand, { omzeilbaar, keten: [p.sleutel, ...r.keten] });
          } else p.redenen.push({ ...r, omzeilbaar, keten: [p.sleutel, ...r.keten] });
          veranderd = true;
        }
      }
    }
  }
  for (const p of procedures) {
    let s: ProcedureStatus = "uitvoerbaar";
    for (const r of p.redenen) if (ERNST[ernst(r)] > ERNST[s]) s = ernst(r);
    p.status = s;
  }

  // Verwijzingen: welke procedures gebruiken ze werkelijk
  for (const v of verwijzingen) {
    const gebruik = bibGebruik.get(v.bibliotheek.toLowerCase());
    if (gebruik) v.gebruiktDoor = [...gebruik].sort();
  }

  const perStatus: Record<ProcedureStatus, number> = { uitvoerbaar: 0, deels: 0, niet: 0 };
  const perOorzaak: Record<string, number> = {};
  for (const p of procedures) {
    perStatus[p.status]++;
    const groepen = new Set(p.redenen.filter((r) => ernst(r) !== "uitvoerbaar").map(oorzaakGroep));
    for (const g of groepen) perOorzaak[g] = (perOorzaak[g] ?? 0) + 1;
  }

  return {
    verwijzingen,
    procedures,
    afhankelijkheden,
    gekoppeldeTabellen: [...gekoppeld.values()],
    modulesMetParseerfout: modules.filter((m) => m.parseerfout).map((m) => m.naam),
    samenvatting: { procedures: procedures.length, perStatus, perOorzaak: Object.fromEntries(Object.entries(perOorzaak).sort((a, b) => b[1] - a[1])) },
  };
}

/** Groep voor statistieken: bibliotheeknaam, `Declare`, `bestand`, `onbekende functie` … */
export function oorzaakGroep(r: ProcedureReden): string {
  switch (r.soort) {
    case "bibliotheek":
      return r.bibliotheek ?? "bibliotheek";
    case "createobject":
      return r.bibliotheek ? `${r.bibliotheek} (CreateObject)` : i18next.t("vba:extern.group.createObjectOther");
    case "declare":
      return i18next.t("vba:extern.group.declare");
    case "onbekend":
      return i18next.t("vba:extern.group.unknown");
    case "syntaxis":
      return i18next.t("vba:extern.group.syntax");
    default:
      return r.soort;
  }
}

function statementsZijn(lijst: Statement[], f: (s: Statement) => boolean) {
  for (const s of statements(lijst)) if (f(s)) return true;
  return false;
}

/** Topniveau-expressies van een statement (zoals expressiesVan, maar zonder recursie). */
function* expressiesVanTop(s: Statement): Generator<Expr> {
  // expressiesVan levert al alle subexpressies; neem alleen de wortels om dubbeltellingen te voorkomen.
  const alle = [...expressiesVan(s)];
  const kinderen = new Set<Expr>();
  for (const e of alle) for (const k of alleExpressies(e)) if (k !== e) kinderen.add(k);
  for (const e of alle) if (!kinderen.has(e)) yield e;
}
