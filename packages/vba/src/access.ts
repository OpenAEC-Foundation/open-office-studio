/**
 * Access-objectmodel: DoCmd, Application, Forms/Reports, Me en
 * besturingselementen, Screen, CurrentProject en SysCmd. Alles wat de
 * interface raakt gaat naar de host (VbaHost/FormulierHost); zonder host volgt
 * een concrete melding in plaats van stil niets te doen.
 */
import i18next from "i18next";
import { weigerLid } from "./afscherming.ts";
import { naarHost, vanHost } from "./conversie.ts";
import { huidigeDatabase, openRecordset, voerSqlUit, werkkopieVan } from "./dao.ts";
import { fout, VbaAfbreking } from "./fouten.ts";
import type { FormulierDoel, HostGebeurtenisSoort, HostWaarde } from "./host.ts";
import type { Ingebouwd, ModuleInfo, VbaRuntime } from "./interpreter.ts";
import {
  Getal,
  LEEG,
  Ontbrekend,
  VbaObject,
  bankAfronden,
  int,
  lng,
  naarGetal,
  naarTekst,
  type VbaWaarde,
} from "./waarden.ts";

const ontbreekt = (w: VbaWaarde | undefined): w is undefined | Ontbrekend => w === undefined || w instanceof Ontbrekend;

export const ACCESS_CONSTANTEN: Record<string, VbaWaarde> = {
  actable: int(0),
  acquery: int(1),
  acform: int(2),
  acreport: int(3),
  acmacro: int(4),
  acmodule: int(5),
  acdefault: int(-1),
  acnormal: int(0),
  acdesign: int(1),
  acpreview: int(2),
  acformds: int(3),
  acviewnormal: int(0),
  acviewdesign: int(1),
  acviewpreview: int(2),
  acviewreport: int(5),
  acviewlayout: int(6),
  acformadd: int(0),
  acformedit: int(1),
  acformreadonly: int(2),
  acformpropertysettings: int(-1),
  acwindownormal: int(0),
  achidden: int(1),
  acicon: int(2),
  acdialog: int(3),
  acsaveprompt: int(0),
  acsaveyes: int(1),
  acsaveno: int(2),
  acprevious: int(0),
  acnext: int(1),
  acfirst: int(2),
  aclast: int(3),
  acgoto: int(4),
  acnewrec: int(5),
  acdataerrcontinue: int(0),
  acdataerrdisplay: int(1),
  acdataerradded: int(2),
  acsyscmdinitmeter: int(1),
  acsyscmdupdatemeter: int(2),
  acsyscmdremovemeter: int(3),
  acsyscmdsetstatus: int(4),
  acsyscmdclearstatus: int(5),
  acsyscmdaccessver: int(7),
  acsyscmdruntime: int(6),
  acsyscmdprofile: int(8),
  acsyscmdaccessdir: int(9),
  acsyscmdclearhelptopic: int(11),
  acsyscmdinifile: int(12),
  acsyscmdgetworkgroupfile: int(13),
  acsyscmdgetobjectstate: int(10),
  acobjstateopen: int(1),
  acobjstatedirty: int(2),
  acobjstatenew: int(4),
  accmdsaverecord: int(97),
  accmdundo: int(292),
  accmddeleterecord: int(223),
  accmdrefresh: int(18),
  accmdselectrecord: int(109),
  accmdfind: int(30),
  accmdrecordsgotonew: int(28),
  acentire: int(0),
  acanywhere: int(0),
  acstart: int(1),
  accurrent: int(-1),
  acall: int(0),
  acdown: int(1),
  acup: int(0),
  acsearchall: int(2),
  acquitsaveall: int(1),
  acquitprompt: int(0),
  acquitsavenone: int(2),
  acexport: int(1),
  acimport: int(0),
  aclink: int(2),
  acoutputreport: int(3),
  acoutputform: int(2),
  acoutputquery: int(1),
  acoutputtable: int(0),
  acformatpdf: "PDF Format (*.pdf)",
  acformatxls: "Microsoft Excel (*.xls)",
  acformatxlsx: "Excel Workbook (*.xlsx)",
  acformatrtf: "Rich Text Format (*.rtf)",
  acformattxt: "MS-DOS Text (*.txt)",
  acspreadsheettypeexcel9: int(8),
  acspreadsheettypeexcel12: int(9),
  acspreadsheettypeexcel12xml: int(10),
  acimportdelim: int(0),
  acexportdelim: int(2),
  acmenuver70: int(0),
  acsavetranslation: int(0),
  aceditmenu: int(1),
  acrecordsmenu: int(5),
  acfile: int(0),
  acselectrecord: int(0),
};

// ---------- formulieren en besturingselementen ----------

function formulierHost(rt: VbaRuntime, doel: FormulierDoel) {
  const host = rt.opties.formulieren;
  // Zonder formulierhost is er geen formulier geopend. Code buiten een formuliermodule
  // krijgt dan dezelfde (vangbare) fout als in Access: 2450/2451 “kan het formulier niet vinden”.
  if (!host && rt.frame && rt.frame.module.soort !== "formulier")
    throw fout(
      doel.soort === "rapport" ? 2451 : 2450,
      i18next.t(doel.soort === "rapport" ? "vba:access.reportNotOpen" : "vba:access.formNotOpen", { name: doel.naam.split("/")[0] }),
    );
  if (!host)
    throw new VbaAfbreking(
      "niet-ondersteund",
      i18next.t(
        `vba:access.noFormHost.${doel.soort === "rapport" ? "report" : "form"}${doel.besturing ? "Control" : ""}`,
        { name: doel.naam, control: doel.besturing },
      ),
    );
  return host;
}

const FORMULIER_EIGENSCHAPPEN = new Set(
  `recordsource filter filteron orderby orderbyon dirty newrecord caption visible allowedits allowadditions
allowdeletions dataentry openargs name currentrecord recordselectors navigationbuttons modal popup
hwnd painting timerinterval defaultview cycle tag width insidewidth insideheight section activecontrol
recordlocks movable borderstyle controlbox minmaxbuttons closebutton autocenter autoresize page pages
hasmodule picture backcolor`
    .split(/\s+/)
    .filter(Boolean),
);
const FORMULIER_METHODEN = new Set(["requery", "refresh", "repaint", "recalc", "setfocus", "undo", "move", "goToPage".toLowerCase()]);
const BESTURING_METHODEN = new Set(["setfocus", "requery", "undo", "dropdown", "additem", "removeitem", "sizetofit", "move"]);

/** Is dit een eigenschap of methode van het formulier zelf (en geen besturingselement)? */
export function isFormulierLid(naam: string) {
  const k = naam.toLowerCase();
  return FORMULIER_EIGENSCHAPPEN.has(k) || FORMULIER_METHODEN.has(k) || ["controls", "form", "report", "recordsetclone", "recordset"].includes(k);
}

export class FormulierObject extends VbaObject {
  constructor(
    readonly doel: FormulierDoel,
    readonly module?: ModuleInfo,
  ) {
    super();
  }
  get typeNaam() {
    return this.doel.soort === "rapport" ? "Report" : "Form";
  }
  override isType(naam: string) {
    const k = naam.toLowerCase().split(".").pop()!;
    return k === "form" || k === "report" || k === "object" || k === `form_${this.doel.naam.toLowerCase()}`;
  }
  besturing(naam: string) {
    return new BesturingObject({ ...this.doel, besturing: naam });
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    // Eigen procedures en variabelen van de formuliermodule
    if (this.module?.instantie && (this.module.procs.has(naam) || this.module.instantie.vars.has(naam)))
      return r.klasseLid(this.module.instantie, naam, args);
    switch (naam) {
      case "form":
      case "report":
        return this;
      case "name":
        return this.doel.naam;
      case "controls":
        if (args.length) return this.besturing(naarTekst(await r.deref(args[0]), r.land));
        throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:access.controlsByNameOnly"));
      case "recordsetclone":
      case "recordset": {
        const bron = vanHost(await formulierHost(r, this.doel).lees(this.doel, "recordsource", []));
        return openRecordset(r, naarTekst(bron, r.land), 2);
      }
    }
    const host = formulierHost(r, this.doel);
    if (FORMULIER_METHODEN.has(naam)) return vanHost(await host.roepAan(this.doel, naam, args.map(naarHost)));
    if (FORMULIER_EIGENSCHAPPEN.has(naam)) return vanHost(await host.lees(this.doel, naam, args.map(naarHost)));
    if (host.heeftBesturing && !(await host.heeftBesturing(this.doel, naam))) return vanHost(await host.lees(this.doel, naam, args.map(naarHost)));
    const b = this.besturing(naam);
    return args.length ? b.standaard(args, rt) : b;
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    if (this.module?.instantie && (this.module.procs.has(naam) || this.module.instantie.vars.has(naam)))
      return r.klasseZetLid(this.module.instantie, naam, args, waarde, waarde instanceof VbaObject);
    const host = formulierHost(r, this.doel);
    if (FORMULIER_EIGENSCHAPPEN.has(naam) || (host.heeftBesturing && !(await host.heeftBesturing(this.doel, naam))))
      return host.zet(this.doel, naam, naarHost(await r.deref(waarde)));
    return this.besturing(naam).zetStandaard([], waarde, rt);
  }
  override async bang(naam: string): Promise<VbaWaarde> {
    return this.besturing(naam);
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    if (!args.length) return this;
    return this.besturing(naarTekst(await r.deref(args[0]), r.land));
  }
}

export class BesturingObject extends VbaObject {
  readonly typeNaam = "Control";
  constructor(readonly doel: FormulierDoel) {
    super();
  }
  override heeftStandaardwaarde() {
    return true;
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    return vanHost(await formulierHost(r, this.doel).lees(this.doel, "value", args.map(naarHost)));
  }
  override async zetStandaard(_args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    await formulierHost(r, this.doel).zet(this.doel, "value", naarHost(await r.deref(waarde)));
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    if (naam === "form" || naam === "report")
      return new FormulierObject({ soort: this.doel.soort, naam: `${this.doel.naam}/${this.doel.besturing}` });
    const host = formulierHost(r, this.doel);
    if (BESTURING_METHODEN.has(naam)) return vanHost(await host.roepAan(this.doel, naam, args.map(naarHost)));
    return vanHost(await host.lees(this.doel, naam, args.map(naarHost)));
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    void args;
    await formulierHost(r, this.doel).zet(this.doel, naam, naarHost(await r.deref(waarde)));
  }
  override isType(naam: string) {
    return ["control", "object", "textbox", "combobox", "listbox", "label", "commandbutton", "checkbox", "optiongroup", "subform"].includes(
      naam.toLowerCase().split(".").pop()!,
    );
  }
}

class FormulierenCollectie extends VbaObject {
  constructor(readonly soort: "formulier" | "rapport") {
    super();
  }
  get typeNaam() {
    return this.soort === "rapport" ? "Reports" : "Forms";
  }
  private formulier(naam: string) {
    return new FormulierObject({ soort: this.soort, naam });
  }
  override async bang(naam: string): Promise<VbaWaarde> {
    return this.formulier(naam);
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    const sleutel = await r.deref(args[0] ?? "");
    if (sleutel instanceof Getal)
      throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:access.indexUnsupported", { collection: this.typeNaam }));
    return this.formulier(naarTekst(sleutel, r.land));
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    if (naam === "item") return this.standaard(args, rt);
    // Zonder formulierhost is er niets geopend.
    if (naam === "count" && !(rt as VbaRuntime).opties.formulieren) return int(0);
    throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:runtime.memberUnsupported", { member: `${this.typeNaam}.${naam}` }));
  }
  override async elementen(rt: unknown): Promise<VbaWaarde[]> {
    if (!(rt as VbaRuntime).opties.formulieren) return [];
    throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:access.forEachUnsupported", { collection: this.typeNaam }));
  }
}

// ---------- DoCmd ----------

const DOCMD_PARAMS: Record<string, string[]> = {
  openform: ["FormName", "View", "FilterName", "WhereCondition", "DataMode", "WindowMode", "OpenArgs"],
  openreport: ["ReportName", "View", "FilterName", "WhereCondition", "WindowMode", "OpenArgs"],
  openquery: ["QueryName", "View", "DataMode"],
  opentable: ["TableName", "View", "DataMode"],
  close: ["ObjectType", "ObjectName", "Save"],
  requery: ["ControlName"],
  gotorecord: ["ObjectType", "ObjectName", "Record", "Offset"],
  gotocontrol: ["ControlName"],
  findrecord: ["FindWhat", "Match", "MatchCase", "Search", "SearchAsFormatted", "OnlyCurrentField", "FindFirst"],
  applyfilter: ["FilterName", "WhereCondition", "ControlName"],
  runsql: ["SQLStatement", "UseTransaction"],
  setwarnings: ["WarningsOn"],
  hourglass: ["HourglassOn"],
  echo: ["EchoOn", "StatusBarText"],
  quit: ["Options"],
  runcommand: ["Command"],
  selectobject: ["ObjectType", "ObjectName", "InDatabaseWindow"],
  save: ["ObjectType", "ObjectName"],
};

const DOCMD_GEBEURTENIS: Record<string, HostGebeurtenisSoort> = {
  openform: "OpenForm",
  openreport: "OpenReport",
  opentable: "OpenTable",
  close: "Close",
  requery: "Requery",
  gotorecord: "GoToRecord",
  gotocontrol: "GoToControl",
  findrecord: "FindRecord",
  applyfilter: "ApplyFilter",
  showallrecords: "ShowAllRecords",
  maximize: "Maximize",
  minimize: "Minimize",
  restore: "Restore",
  beep: "Beep",
  hourglass: "Hourglass",
  echo: "Echo",
  quit: "Quit",
  runcommand: "RunCommand",
  selectobject: "SelectObject",
  save: "Save",
  refresh: "Refresh",
  cancelevent: "CancelEvent",
  domenuitem: "DoMenuItem",
  gotopage: "GoToPage",
  searchforrecord: "SearchForRecord",
  navigateto: "NavigateTo",
  showtoolbar: "ShowToolbar",
  movesize: "MoveSize",
  repaintobject: "RepaintObject",
  refreshrecord: "RefreshRecord",
  findnext: "FindNext",
};

/** Acties die zonder interface zonder gevolgen kunnen vervallen. */
const ZONDER_HOST_GEEN_GEVOLG = new Set(["maximize", "minimize", "restore", "beep", "hourglass", "echo", "showtoolbar", "movesize", "repaintobject", "cancelevent"]);

async function hostGebeurtenis(rt: VbaRuntime, naam: string, args: VbaWaarde[]): Promise<VbaWaarde> {
  const soort = DOCMD_GEBEURTENIS[naam];
  const hostArgs: HostWaarde[] = [];
  for (const a of args) hostArgs.push(ontbreekt(a) ? null : naarHost(await rt.deref(a)));
  if (rt.host?.gebeurtenis) {
    const r = await rt.host.gebeurtenis({ soort, args: hostArgs });
    if (soort === "Quit") throw new VbaAfbreking("end", "Quit");
    return r === undefined ? LEEG : vanHost(r);
  }
  if (ZONDER_HOST_GEEN_GEVOLG.has(naam)) return LEEG;
  throw new VbaAfbreking(
    "niet-ondersteund",
    typeof hostArgs[0] === "string"
      ? i18next.t("vba:access.doCmdNeedsHostNamed", { action: soort, name: hostArgs[0] })
      : i18next.t("vba:access.doCmdNeedsHost", { action: soort }),
  );
}

class DoCmdObject extends VbaObject {
  readonly typeNaam = "DoCmd";
  parameterNamen(naam: string) {
    return DOCMD_PARAMS[naam];
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "transfertext":
      case "transferspreadsheet":
      case "transferdatabase":
      case "transfersqldatabase":
      case "outputto":
      case "sendobject":
      case "runapp":
      case "copydatabasefile":
      case "followhyperlink":
        return weigerLid("DoCmd", DOCMD_NAMEN[naam] ?? naam);
      case "runsql": {
        const sql = naarTekst(await r.deref(args[0] ?? ""), r.land);
        await voerSqlUit(r, sql);
        return LEEG;
      }
      case "setwarnings":
        r.staat.set("access.waarschuwingen", ontbreekt(args[0]) ? true : r.alsBool(await r.deref(args[0])));
        return LEEG;
      case "openquery": {
        const naamQ = naarTekst(await r.deref(args[0] ?? ""), r.land);
        const db = werkkopieVan(r);
        const q = (await db.querys()).find((x) => x.naam.toLowerCase() === naamQ.toLowerCase());
        if (!q) throw fout(7874, i18next.t("vba:access.objectNotFound", { name: naamQ }));
        if (q.soort !== "select" && q.soort !== "union" && q.soort !== "crosstab") {
          await voerSqlUit(r, q.naam);
          return LEEG;
        }
        return hostGebeurtenis(r, "openquery_select", args).catch((e) => {
          throw e;
        });
      }
      case "runmacro":
        throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:access.runMacroUnsupported"));
      case "deleteobject":
      case "rename":
      case "copyobject":
      case "setproperty":
      case "transferspreadsheetlink":
        throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:runtime.memberUnsupported", { member: `DoCmd.${naam}` }));
    }
    if (naam in DOCMD_GEBEURTENIS) return hostGebeurtenis(r, naam, args);
    throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:runtime.memberUnsupported", { member: `DoCmd.${naam}` }));
  }
}
DOCMD_GEBEURTENIS["openquery_select"] = "OpenQuery";

/** DoCmd-leden die worden uitgevoerd of aan de host worden doorgegeven (kleine letters). */
export const DOCMD_ONDERSTEUND = new Set(["runsql", "setwarnings", "openquery", ...Object.keys(DOCMD_GEBEURTENIS).filter((k) => !k.includes("_"))]);

const DOCMD_NAMEN: Record<string, string> = {
  transfertext: "TransferText",
  transferspreadsheet: "TransferSpreadsheet",
  transferdatabase: "TransferDatabase",
  transfersqldatabase: "TransferSQLDatabase",
  outputto: "OutputTo",
  sendobject: "SendObject",
  runapp: "RunApp",
  copydatabasefile: "CopyDatabaseFile",
  followhyperlink: "FollowHyperlink",
};

// ---------- Application, Screen, CurrentProject ----------

class ProjectObject extends VbaObject {
  readonly typeNaam = "CurrentProject";
  constructor(readonly code: boolean) {
    super();
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    const label = this.code ? "CodeProject" : "CurrentProject";
    switch (naam) {
      case "path":
        return weigerLid(label, "Path");
      case "fullname":
        return weigerLid(label, "FullName");
      case "name":
        return r.werkkopie?.bron.naam ?? "";
      case "allforms":
      case "allreports": {
        const soort = naam === "allforms" ? "formulier" : "rapport";
        const c = new AlleObjecten(soort);
        return args.length ? c.standaard(args, rt) : c;
      }
      case "connection":
      case "accessconnection":
        return weigerLid(label, "Connection");
      case "isconnected":
        return true;
    }
    return super.lid(naam, args, rt);
  }
}

class AlleObjecten extends VbaObject {
  readonly typeNaam = "AllObjects";
  constructor(readonly soort: "formulier" | "rapport") {
    super();
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    return new AccessObjectInfo({ soort: this.soort, naam: naarTekst(await r.deref(args[0] ?? ""), r.land) });
  }
  /** Namen van de formulieren of rapporten die de werkkopie kent. */
  private async namen(rt: VbaRuntime): Promise<string[]> {
    if (!rt.werkkopie) return [];
    try {
      return (await rt.werkkopie.ontwerpen()).filter((o) => o.soort === this.soort).map((o) => o.naam);
    } catch {
      return [];
    }
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown) {
    if (naam === "item") {
      const sleutel = await (rt as VbaRuntime).deref(args[0] ?? "");
      if (sleutel instanceof Getal) {
        const lijst = await this.namen(rt as VbaRuntime);
        const n = naarGetal(sleutel, (rt as VbaRuntime).land);
        if (n < 0 || n >= lijst.length) throw fout(2456);
        return new AccessObjectInfo({ soort: this.soort, naam: lijst[n] });
      }
      return this.standaard(args, rt);
    }
    if (naam === "count") return lng((await this.namen(rt as VbaRuntime)).length);
    return super.lid(naam, args, rt);
  }
  override async elementen(rt: unknown): Promise<VbaWaarde[]> {
    return (await this.namen(rt as VbaRuntime)).map((naam) => new AccessObjectInfo({ soort: this.soort, naam }));
  }
  override async bang(naam: string) {
    return new AccessObjectInfo({ soort: this.soort, naam });
  }
}

class AccessObjectInfo extends VbaObject {
  readonly typeNaam = "AccessObject";
  constructor(readonly doel: FormulierDoel) {
    super();
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    if (naam === "isloaded") return r.opties.formulieren ? r.opties.formulieren.isGeopend(this.doel) : false;
    if (naam === "name" || naam === "fullname") return this.doel.naam;
    if (naam === "type") return int(this.doel.soort === "rapport" ? 3 : 2);
    if (naam === "currentview") return int(0);
    return super.lid(naam, args, rt);
  }
}

/** `VBE` (de VBA-editor en het VBA-project): afgeschermd, net als Application.VBE. */
class VbeObject extends VbaObject {
  readonly typeNaam = "VBE";
  override async lid(): Promise<VbaWaarde> {
    return weigerLid("Application", "VBE");
  }
  override async zetLid(): Promise<void> {
    weigerLid("Application", "VBE");
  }
}

class ScreenObject extends VbaObject {
  readonly typeNaam = "Screen";
  muis = 0;
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "mousepointer":
        return int(this.muis);
      case "activeform":
      case "activereport": {
        const doel: FormulierDoel = { soort: naam === "activeform" ? "formulier" : "rapport", naam: "" };
        const n = vanHost(await formulierHost(r, doel).lees(doel, naam === "activeform" ? "activeform" : "activereport", []));
        return new FormulierObject({ soort: doel.soort, naam: naarTekst(n, r.land) });
      }
      case "activecontrol": {
        const doel: FormulierDoel = { soort: "formulier", naam: "" };
        const n = naarTekst(vanHost(await formulierHost(r, doel).lees(doel, "activeform", [])), r.land);
        const b = naarTekst(vanHost(await formulierHost(r, doel).lees({ soort: "formulier", naam: n }, "activecontrol", [])), r.land);
        return new BesturingObject({ soort: "formulier", naam: n, besturing: b });
      }
    }
    return super.lid(naam, args, rt);
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown) {
    if (naam === "mousepointer") {
      this.muis = bankAfronden(naarGetal(await (rt as VbaRuntime).deref(waarde)));
      return;
    }
    return super.zetLid(naam, args, waarde, rt);
  }
}

class ApplicationObject extends VbaObject {
  readonly typeNaam = "Application";
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    const g = r.globalen;
    switch (naam) {
      case "currentdb":
      case "codedb":
        return huidigeDatabase(r);
      case "docmd":
      case "forms":
      case "reports":
      case "screen":
      case "currentproject":
      case "codeproject":
      case "dbengine": {
        const w = g.get(naam)!;
        return args.length && w instanceof VbaObject ? w.standaard(args, rt) : w;
      }
      case "run": {
        const proc = naarTekst(await r.deref(args[0] ?? ""), r.land);
        return r.roepOpNaamAan(proc, args.slice(1));
      }
      case "echo":
        return LEEG;
      case "quit":
        return hostGebeurtenis(r, "quit", args);
      case "followhyperlink":
        return weigerLid("Application", "FollowHyperlink");
      case "exportxml":
      case "importxml":
      case "saveastext":
      case "loadfromtext":
        return weigerLid("Application", naam);
      case "name":
        return "Microsoft Access";
      case "version":
        return "16.0";
      case "currentuser":
        return "Admin";
      case "visible":
        return true;
      case "syscmd":
        return sysCmd(args, r);
      case "setoption":
        // Instellingen van Access zelf: hebben in Open Office Studio geen gevolg.
        return LEEG;
      case "getoption":
        return LEEG;
      case "references":
      case "vbe":
        return weigerLid("Application", naam === "vbe" ? "VBE" : "References");
      case "eval":
        throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:runtime.memberUnsupported", { member: `Application.${naam}` }));
    }
    const f = r.ingebouwd(naam);
    if (f) return r.roepIngebouwdAan(f, args);
    return super.lid(naam, args, rt);
  }
}

async function sysCmd(args: VbaWaarde[], rt: VbaRuntime): Promise<VbaWaarde> {
  const actie = bankAfronden(naarGetal(await rt.deref(args[0] ?? int(0)), rt.land));
  switch (actie) {
    case 7:
      return "16.0";
    case 10: {
      const type = bankAfronden(naarGetal(await rt.deref(args[1] ?? int(2)), rt.land));
      const naam = naarTekst(await rt.deref(args[2] ?? ""), rt.land);
      if (type !== 2 && type !== 3) return int(0);
      const geopend = rt.opties.formulieren ? await rt.opties.formulieren.isGeopend({ soort: type === 3 ? "rapport" : "formulier", naam }) : false;
      return int(geopend ? 1 : 0);
    }
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return LEEG; // voortgangsbalk en statusregel: geen gevolg
    case 6:
      return false; // acSysCmdRuntime: geen Access-runtimeversie
    case 8:
      return ""; // acSysCmdProfile
    case 9:
      return weigerLid("SysCmd", "AccessDir");
    case 13:
      return weigerLid("SysCmd", "GetWorkgroupFile");
  }
  throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:access.sysCmdUnsupported", { action: actie }));
}

const nietOndersteundeFunctie = (naam: string, reden: "managedDatabase" | "memoryAddress"): Ingebouwd => ({
  fn: () => {
    throw new VbaAfbreking("niet-ondersteund", i18next.t(`vba:access.unsupportedFunction.${reden}`, { name: naam }));
  },
});

export const accessFuncties: Record<string, Ingebouwd> = {
  syscmd: { ruw: true, fn: (args, rt) => sysCmd(args, rt) },
  currentuser: { fn: () => "Admin" },
  quit: { fn: (args, rt) => hostGebeurtenis(rt, "quit", args) },
  closecurrentdatabase: nietOndersteundeFunctie("CloseCurrentDatabase", "managedDatabase"),
  strptr: nietOndersteundeFunctie("StrPtr", "memoryAddress"),
  varptr: nietOndersteundeFunctie("VarPtr", "memoryAddress"),
  objptr: nietOndersteundeFunctie("ObjPtr", "memoryAddress"),
};

export function accessGlobalen(rt: VbaRuntime): [string, VbaWaarde][] {
  void rt;
  return [
    ["docmd", new DoCmdObject()],
    ["application", new ApplicationObject()],
    ["forms", new FormulierenCollectie("formulier")],
    ["reports", new FormulierenCollectie("rapport")],
    ["screen", new ScreenObject()],
    ["currentproject", new ProjectObject(false)],
    ["vbe", new VbeObject()],
    ["codeproject", new ProjectObject(true)],
  ];
}

/** `Me` van een formulier- of rapportmodule: `Form_Klanten` → formulier ‘Klanten’. */
export function meVoorModule(m: ModuleInfo): FormulierObject {
  const rapport = /^report_/i.test(m.naam);
  const naam = m.naam.replace(/^(form|report)_/i, "");
  return new FormulierObject({ soort: rapport ? "rapport" : "formulier", naam }, m);
}

export { lng };
