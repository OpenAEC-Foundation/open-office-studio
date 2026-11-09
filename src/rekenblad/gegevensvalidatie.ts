import {
  openWorkbook,
  type WorkbookHandle,
  type XlsxCellValue,
  type XlsxEditRequest,
} from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  ontsnap,
  tekstVan,
  zoekAlle,
} from "../grafieken/xml";
import {
  adres,
  ontleedVerwijzing,
  verschuifFormule,
} from "../lint/rekenblad-logica";
import { NS, werkmap, gebied, bevat, sectie } from "./werkboekXml";
import { bewaarValidatieAnkers, namenAlle } from "./validatieAnkers";
import i18next from "../i18n/config";

export type ValidatieType =
  | "whole"
  | "decimal"
  | "list"
  | "date"
  | "time"
  | "textLength"
  | "custom";
export interface Validatieregel {
  ref: string;
  type: ValidatieType;
  operator: string;
  formule1: string;
  formule2: string;
  leeg: boolean;
  keuzelijst: boolean;
  invoerTonen: boolean;
  invoerTitel: string;
  invoer: string;
  foutTonen: boolean;
  foutType: "stop" | "warning" | "information";
  foutTitel: string;
  fout: string;
  uitgebreid?: boolean;
}
export const nieuweValidatie = (ref: string): Validatieregel => ({
  ref,
  type: "whole",
  operator: "between",
  formule1: "0",
  formule2: "100",
  leeg: true,
  keuzelijst: true,
  invoerTonen: true,
  invoerTitel: "",
  invoer: "",
  foutTonen: true,
  foutType: "stop",
  foutTitel: i18next.t("spreadsheet:validation.defaultErrorTitle"),
  fout: i18next.t("spreadsheet:validation.defaultError"),
});
export function leesValidaties(bytes: Uint8Array): Validatieregel[][] {
  const p = new Pakket(bytes);
  return werkmap(p).bladen.map((b) => {
    const root = leesXml(p.lees(b.pad));
    return zoekAlle(root, "dataValidation")
      .map((el) => {
        const basis = nieuweValidatie(
          attr(el, "sqref") ??
            (kind(el, "sqref") ? tekstVan(kind(el, "sqref")!) : ""),
        );
        const f = (naam: string) => {
          const node = kind(el, naam);
          return node ? tekstVan(node) : "";
        };
        return {
          ...basis,
          ref:
            attr(el, "sqref") ??
            (kind(el, "sqref") ? tekstVan(kind(el, "sqref")!) : ""),
          type: (attr(el, "type") ?? "whole") as ValidatieType,
          operator: attr(el, "operator") ?? "between",
          formule1: f("formula1"),
          formule2: f("formula2"),
          leeg:
            attr(el, "allowBlank") === "1" || attr(el, "allowBlank") === "true",
          keuzelijst:
            attr(el, "showDropDown") !== "1" &&
            attr(el, "showDropDown") !== "true",
          invoerTonen: ["1", "true"].includes(
            attr(el, "showInputMessage") ?? "",
          ),
          invoerTitel: attr(el, "promptTitle") ?? "",
          invoer: attr(el, "prompt") ?? "",
          foutTonen: ["1", "true"].includes(attr(el, "showErrorMessage") ?? ""),
          foutType: (attr(el, "errorStyle") ??
            "stop") as Validatieregel["foutType"],
          foutTitel: attr(el, "errorTitle") ?? basis.foutTitel,
          fout: attr(el, "error") ?? basis.fout,
          uitgebreid: namespaceVan(el, el.voorvoegsel) !== NS,
        };
      })
      .filter((r) => !!r.ref);
  });
}
export function schrijfValidatie(
  bytes: Uint8Array,
  blad: number,
  index: number | null,
  regel: Validatieregel | null,
) {
  const p = new Pakket(bytes),
    pad = werkmap(p).bladen[blad]?.pad;
  if (!pad) throw new Error("Werkblad ontbreekt.");
  const xml = p.lees(pad),
    root = leesXml(xml),
    container = kind(root, "dataValidations"),
    oud = kinderen(container, "dataValidation");
  if (kind(root, "sheetProtection"))
    throw new Error(
      "Hef eerst de bladbeveiliging op om validatieregels te wijzigen.",
    );
  if (regel) {
    regel.ref.split(/\s+/).forEach(gebied);
    if (!regel.formule1.trim())
      throw new Error("Geef een waarde, lijst, bereik of formule op.");
    if (
      !["list", "custom"].includes(regel.type) &&
      ["between", "notBetween"].includes(regel.operator) &&
      !regel.formule2.trim()
    )
      throw new Error("Geef ook de tweede grens op.");
    if (
      regel.type === "list" &&
      /^".*"$/s.test(regel.formule1) &&
      regel.formule1.length > 257
    )
      throw new Error(
        "Een vaste keuzelijst mag maximaal 255 tekens bevatten; gebruik voor meer waarden een celbereik.",
      );
    if (regel.invoerTitel.length > 32 || regel.foutTitel.length > 32)
      throw new Error("Een berichttitel mag maximaal 32 tekens bevatten.");
    if (
      regel.formule1.length > 8192 ||
      regel.formule2.length > 8192 ||
      regel.invoer.length > 255 ||
      regel.fout.length > 255
    )
      throw new Error("De validatietekst is te lang.");
    if (regel.uitgebreid)
      throw new Error(
        "Deze uitgebreide validatie wordt behouden; maak een gewone regel voor een ander bereik.",
      );
  }
  const regels = oud.map((el) => xml.slice(el.start, el.eind));
  const fragment = regel
    ? `<dataValidation xmlns="${NS}"${attrTekst({ type: regel.type, operator: regel.operator, sqref: regel.ref, allowBlank: regel.leeg ? "1" : "0", showDropDown: regel.keuzelijst ? "0" : "1", showInputMessage: regel.invoerTonen ? "1" : "0", promptTitle: regel.invoerTitel, prompt: regel.invoer, showErrorMessage: regel.foutTonen ? "1" : "0", errorStyle: regel.foutType, errorTitle: regel.foutTitel, error: regel.fout })}><formula1>${ontsnap(regel.formule1.replace(/^=/, ""))}</formula1>${regel.formule2 ? `<formula2>${ontsnap(regel.formule2.replace(/^=/, ""))}</formula2>` : ""}</dataValidation>`
    : "";
  if (index === null) {
    if (fragment) regels.push(fragment);
  } else if (index < 0 || index >= regels.length)
    throw new Error("De validatieregel bestaat niet meer.");
  else if (fragment) regels[index] = fragment;
  else regels.splice(index, 1);
  sectie(
    p,
    pad,
    "dataValidations",
    regels.length
      ? `<dataValidations xmlns="${NS}"${attrTekst({ ...(container?.attrs ?? {}), count: String(regels.length) })}>${regels.join("")}</dataValidations>`
      : "",
  );
  return p.inpakken();
}
const tekst = (v: XlsxCellValue) => (v.kind === "empty" ? "" : String(v.value));
export function celWaarde(h: WorkbookHandle, blad: number, ref: string) {
  const r = h.readCells({
    ranges: [
      { sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1: ref } },
    ],
  });
  if (!r.ok) throw new Error(r.failure.message);
  return r.ranges[0].cells;
}
export function lijstWaarden(
  h: WorkbookHandle,
  blad: number,
  formule: string,
): string[] {
  const f = formule.replace(/^=/, "").trim();
  if (f.startsWith('"') && f.endsWith('"'))
    return f
      .slice(1, -1)
      .split(",")
      .map((s) => s.replace(/""/g, '"'));
  let verwijzing = f;
  const naam = namenAlle(h)
    .filter(
      (n) =>
        n.name.toLowerCase() === f.toLowerCase() &&
        (n.scope === null || n.scope === blad),
    )
    .sort((a, b) => Number(b.scope !== null) - Number(a.scope !== null))[0];
  if (naam) verwijzing = naam.refersTo;
  const ref = ontleedVerwijzing(verwijzing.replace(/^=/, ""));
  if (!ref) throw new Error("De lijstverwijzing kan niet worden gelezen.");
  const index = ref.blad
    ? h
        .sheetInfo()
        .sheetNames.findIndex(
          (n) => n.toLowerCase() === ref.blad!.toLowerCase(),
        )
    : blad;
  if (index < 0) throw new Error("Het bronblad van de keuzelijst ontbreekt.");
  if (
    (ref.bereik.bottom - ref.bereik.top + 1) *
      (ref.bereik.right - ref.bereik.left + 1) >
    10000
  )
    throw new Error("De keuzelijst bevat meer dan 10.000 cellen.");
  return celWaarde(h, index, verwijzing.replace(/^.*!/, "").replace(/\$/g, ""))
    .flat()
    .map((c) => tekst(c.value));
}
function bereken(
  h: WorkbookHandle,
  blad: number,
  formule: string,
  row: number,
  col: number,
  regel: Validatieregel,
) {
  const start = gebied(regel.ref.split(/\s+/)[0]);
  const f = verschuifFormule(
    formule.replace(/^=/, ""),
    row - start.top,
    col - start.left,
  )
    .split(/("(?:[^"]|"")*")/)
    .map((s, i) =>
      i % 2
        ? s
        : s
            .replace(/\bROW\(\s*\)/gi, String(row + 1))
            .replace(/\bCOLUMN\(\s*\)/gi, String(col + 1)),
    )
    .join("");
  const colKlad = Array.from({ length: 256 }, (_, i) => 16383 - i).find(
    (c) => !h.cell(blad, 1048575, c).input,
  );
  if (colKlad === undefined)
    throw new Error("Geen vrije cel om de validatieformule te berekenen.");
  h.editCell(blad, 1048575, colKlad, "=" + f);
  const v = celWaarde(h, blad, adres({ row: 1048575, col: colKlad }))[0][0]
    .value;
  h.editCell(blad, 1048575, colKlad, "");
  if (v.kind === "error" || v.kind === "empty")
    throw new Error("De validatieformule kon niet worden berekend: " + formule);
  return v;
}
export function voldoetValidatie(
  h: WorkbookHandle,
  blad: number,
  row: number,
  col: number,
  regel: Validatieregel,
) {
  const v = celWaarde(h, blad, adres({ row, col }))[0][0].value;
  if (v.kind === "empty" || (v.kind === "text" && v.value === ""))
    return regel.leeg;
  if (regel.type === "list")
    return lijstWaarden(h, blad, regel.formule1).some(
      (s) => s.toLocaleLowerCase() === tekst(v).toLocaleLowerCase(),
    );
  if (regel.type === "custom") {
    const uit = bereken(h, blad, regel.formule1, row, col, regel);
    return uit.kind === "bool"
      ? uit.value
      : uit.kind === "number" && uit.value !== 0;
  }
  const x =
    regel.type === "textLength"
      ? [...tekst(v)].length
      : v.kind === "number"
        ? v.value
        : NaN;
  if (!Number.isFinite(x) || (regel.type === "whole" && !Number.isInteger(x)))
    return false;
  const grens = (f: string) => {
    const n = Number(f);
    if (f.trim() && Number.isFinite(n)) return n;
    const uit = bereken(h, blad, f, row, col, regel);
    if (uit.kind !== "number")
      throw new Error("De validatiegrens is geen getal.");
    return uit.value;
  };
  const a = grens(regel.formule1);
  switch (regel.operator) {
    case "between":
      return x >= a && x <= grens(regel.formule2);
    case "notBetween":
      return x < a || x > grens(regel.formule2);
    case "equal":
      return x === a;
    case "notEqual":
      return x !== a;
    case "greaterThan":
      return x > a;
    case "greaterThanOrEqual":
      return x >= a;
    case "lessThan":
      return x < a;
    case "lessThanOrEqual":
      return x <= a;
    default:
      throw new Error("Onbekende validatievergelijking.");
  }
}
const caches = new WeakMap<WorkbookHandle, Validatieregel[][]>();
const vooraf = new WeakMap<
  WorkbookHandle,
  (ops: unknown[], request: XlsxEditRequest) => void
>();
const plannen = new WeakMap<
  WorkbookHandle,
  {
    ops: unknown[];
    steps: XlsxEditRequest["steps"];
    basis: string;
    versie: string;
    opsTekst: string;
    stappenTekst: string;
  }
>();
export function controleerValidatieBewerking(
  h: WorkbookHandle,
  ops: unknown[],
  request: XlsxEditRequest,
) {
  vooraf.get(h)?.(ops, request);
}
function requestCellen(h: WorkbookHandle, request: XlsxEditRequest) {
  const info = h.sheetInfo();
  return request.steps.flatMap((s) => {
    if (!["setCellInputs", "setCellValues", "setFormulas"].includes(s.op))
      return [];
    const b =
      s.target.range.kind === "a1"
        ? gebied(s.target.range.a1)
        : {
            top: s.target.range.start.row,
            left: s.target.range.start.col,
            bottom: s.target.range.end.row,
            right: s.target.range.end.col,
          };
    const uit = [];
    for (let row = b.top; row <= b.bottom; row++)
      for (let col = b.left; col <= b.right; col++)
        uit.push({ sheet: info.sheetIds.indexOf(s.target.sheetId), row, col });
    return uit;
  });
}
export const validaties = (h: WorkbookHandle) => caches.get(h) ?? [];
export function installeerValidatie(
  h: WorkbookHandle,
  bytes: Uint8Array,
  bevestig: (tekst: string) => boolean = (tekst) => window.confirm(tekst),
) {
  if (caches.has(h)) return;
  let regels = leesValidaties(bytes),
    bezig = false,
    opnieuw = false;
  caches.set(h, regels);
  if (!regels.some((l) => l.length)) return;
  const save = h.save.bind(h);
  h.save = () => bewaarValidatieAnkers(h, save());
  function controleer(
    cellen: { sheet: number; row: number; col: number }[],
    doe: (kloon: WorkbookHandle) => unknown,
  ) {
    if (bezig) return;
    if (opnieuw) {
      regels = leesValidaties(h.save());
      caches.set(h, regels);
      opnieuw = false;
    }
    const toetsen = cellen.flatMap((c) =>
      (regels[c.sheet] ?? [])
        .filter((r) =>
          r.ref.split(/\s+/).some((ref) => bevat(gebied(ref), c.row, c.col)),
        )
        .map((r) => ({ ...c, regel: r })),
    );
    if (!toetsen.length) return;
    const kloon = openWorkbook(h.save());
    try {
      doe(kloon);
      for (const { sheet, row, col, regel } of toetsen) {
        if (!regel.foutTonen || voldoetValidatie(kloon, sheet, row, col, regel))
          continue;
        const fout = `${regel.foutTitel}\n${adres({ row, col })}: ${regel.fout}`;
        if (regel.foutType === "stop" || !bevestig(fout + "\n\nToch doorgaan?"))
          throw new Error(fout);
      }
    } finally {
      kloon.dispose();
    }
  }
  const editCell = h.editCell.bind(h),
    editCells = h.editCells.bind(h),
    applyOps = h.applyOps.bind(h),
    applyEdits = h.applyEdits.bind(h);
  vooraf.set(h, (ops, request) => {
    const geldig = h.validateEdits(request);
    if (!geldig.ok) throw new Error(geldig.failure.message);
    controleer(requestCellen(h, request), (k) => {
      if (ops.length) k.applyOps(ops);
      const uit = k.applyEdits({ ...request, expectVersion: k.version() });
      if (!uit.ok) throw new Error(uit.failure.message);
    });
    plannen.set(h, {
      ops,
      steps: request.steps,
      basis: h.version(),
      versie: h.version(),
      opsTekst: JSON.stringify(ops),
      stappenTekst: JSON.stringify(request.steps),
    });
  });
  const run = <T>(fn: () => T) => {
    const was = bezig;
    bezig = true;
    try {
      return fn();
    } finally {
      bezig = was;
    }
  };
  h.editCell = (sheet, row, col, input) => {
    controleer([{ sheet, row, col }], (k) =>
      k.editCell(sheet, row, col, input),
    );
    return run(() => editCell(sheet, row, col, input));
  };
  h.editCells = (sheet, edits) => {
    controleer(
      edits.map((e) => ({ sheet, row: e.row, col: e.col })),
      (k) => k.editCells(sheet, edits),
    );
    return run(() => editCells(sheet, edits));
  };
  h.applyOps = (ops) => {
    const plan = plannen.get(h),
      past =
        plan?.ops === ops &&
        plan.basis === h.version() &&
        plan.opsTekst === JSON.stringify(ops);
    const cellen = ops.flatMap((op: any) =>
      op.type === "setCell"
        ? [{ sheet: op.sheet, row: op.at.row, col: op.at.col }]
        : [],
    );
    controleer(cellen, (k) => k.applyOps(ops));
    const uit = run(() => applyOps(ops));
    if (past) plan!.versie = h.version();
    if (
      ops.some((op: any) =>
        /^(insert|delete)(Rows|Cols)$|^(rename|move|remove)Sheet$/.test(
          op.type,
        ),
      )
    ) {
      regels = leesValidaties(h.save());
      caches.set(h, regels);
      opnieuw = false;
    }
    return uit;
  };
  h.applyEdits = (request: XlsxEditRequest) => {
    if (request.expectVersion !== h.version()) return applyEdits(request);
    if (!h.validateEdits(request).ok) return applyEdits(request);
    const plan = plannen.get(h),
      goedgekeurd =
        plan?.steps === request.steps &&
        plan.versie === request.expectVersion &&
        plan.stappenTekst === JSON.stringify(request.steps);
    plannen.delete(h);
    if (!goedgekeurd)
      controleer(requestCellen(h, request), (k) =>
        k.applyEdits({ ...request, expectVersion: k.version() }),
      );
    return run(() => applyEdits(request));
  };
  for (const naam of ["undo", "redo"] as const) {
    const fn = h[naam].bind(h);
    h[naam] = () => {
      const uit = fn();
      regels = leesValidaties(h.save());
      caches.set(h, regels);
      opnieuw = false;
      return uit;
    };
  }
}
