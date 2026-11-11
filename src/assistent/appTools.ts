/**
 * De `office_*`-tools voor de assistent van de OpenAEC SuperCloud-werkplek (`window.__OPDS_APP__`).
 *
 * In de werkplek draait de app in een sandbox-iframe; de brug van de werkplek roept `run(naam, argumenten)` aan als de
 * assistent een tool gebruikt. De tools werken op het document in het zichtbare tabblad, via dezelfde versie-gecontroleerde
 * engine-API's als de eigen opdrachten van de app (`readParagraphs`/`readCells`/`readContent` en `applyEdits`). Elke
 * bewerking is één stap in de geschiedenis, dus `office_undo` draait haar terug. Een fout is een `Error` met een korte
 * code vooraan; een antwoord is gewone JSON. Geen netwerk, geen berichten naar buiten.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { XlsxCellValue, XlsxEditStep } from "@betteroffice/xlsx";
import type { PptxEditStep, PptxStoryText, PresentationHandle } from "@betteroffice/pptx";
import type { Soort } from "../editors";
import { actieveEditor, type ActieveEditor } from "./actieveEditor";
import { bereikA1, kolomLetters, ontleedAdres, ontleedBereik } from "../lint/rekenblad-logica";

export interface AppToolDefinitie {
  name: string;
  description: string;
  inputSchema: object;
}
export interface AppTools {
  tools(): string[];
  definitions(): Promise<AppToolDefinitie[]>;
  run(naam: string, argumenten?: Record<string, unknown>): Promise<unknown>;
}

type Args = Record<string, unknown>;
type DocxEditStep = Parameters<DocxEditorRef["applyEdits"]>[0]["steps"][number];

/** Een antwoord gaat in de context van een model; groter moet de assistent zelf inperken. */
const MAX_TEKENS = 30_000;
const MAX_CELLEN = 2_000;
const STANDAARD_ALINEAS = 200;

const SOORTNAAM: Record<Soort, string> = { docx: "tekstdocument", xlsx: "rekenblad", pptx: "presentatie" };

function fout(code: string, tekst?: string): Error {
  return new Error(tekst ? `${code}: ${tekst}` : code);
}

/** Een weigering van de engine (`{ ok: false, failure }`) als fout met de code van de engine. */
function weigering(failure: { code: string; message: string }): Error {
  return fout(failure.code.replace(/-/g, "_"), failure.message);
}

function editor<K extends "tekst" | "rekenblad" | "presentatie">(
  soort: Soort,
  sleutel: K,
): NonNullable<ActieveEditor[K]> {
  const e = actieveEditor();
  if (!e) throw fout("geen_document", "open eerst een document");
  if (e.soort !== soort)
    throw fout("verkeerde_soort", `deze tool werkt op een ${SOORTNAAM[soort]}; het open document is een ${SOORTNAAM[e.soort]}`);
  const api = e[sleutel];
  if (!api) throw fout("niet_gereed", "het document laadt nog");
  return api as NonNullable<ActieveEditor[K]>;
}

function bewerkbaar() {
  if (actieveEditor()?.alleenLezen) throw fout("alleen_lezen", "het document is alleen-lezen");
}

const geheel = (waarde: unknown, naam: string, min = 1) => {
  if (waarde === undefined) return undefined;
  if (!Number.isInteger(waarde) || (waarde as number) < min) throw fout("ongeldig_argument", `${naam} moet een geheel getal ≥ ${min} zijn`);
  return waarde as number;
};
const tekstArg = (waarde: unknown, naam: string, verplicht = true) => {
  if (waarde === undefined && !verplicht) return undefined;
  if (typeof waarde !== "string") throw fout("ongeldig_argument", `${naam} moet tekst zijn`);
  return waarde;
};

// ── Tekstdocument ──────────────────────────────────────────────────────────

async function alineas(ref: DocxEditorRef) {
  const r = await ref.readParagraphs({ view: "accepted" });
  if (!r.ok) throw weigering(r.failure);
  return r;
}

async function bewerkTekst(ref: DocxEditorRef, versie: string, steps: DocxEditStep[]) {
  bewerkbaar();
  const r = await ref.applyEdits({ expectVersion: versie, source: "agent", steps });
  if (!r.ok) throw weigering(r.failure);
  return r;
}

async function tekstLezen(args: Args) {
  const ref = editor("docx", "tekst");
  const vanaf = geheel(args.vanaf, "vanaf") ?? 1;
  const aantal = geheel(args.aantal, "aantal") ?? STANDAARD_ALINEAS;
  const { paragraphs } = await alineas(ref);
  return {
    totaal: paragraphs.length,
    vanaf,
    alineas: paragraphs.slice(vanaf - 1, vanaf - 1 + aantal).map((p, i) => ({
      nr: vanaf + i,
      tekst: p.text,
      ...(p.styleId ? { stijl: p.styleId } : {}),
      ...(typeof p.outlineLevel === "number" ? { kopniveau: p.outlineLevel + 1 } : {}),
      ...(p.list?.marker ? { lijst: p.list.marker } : {}),
    })),
  };
}

async function tekstInvoegen(args: Args) {
  const ref = editor("docx", "tekst");
  const tekst = tekstArg(args.tekst, "tekst")!;
  const { version, paragraphs } = await alineas(ref);
  if (!paragraphs.length) throw fout("niet_gereed", "het document heeft geen alinea's");
  const na = geheel(args.na, "na", 0) ?? paragraphs.length;
  if (na > paragraphs.length) throw fout("buiten_bereik", `het document heeft ${paragraphs.length} alinea's`);
  const anker = paragraphs[Math.max(0, na - 1)];
  const regels = tekst.split(/\r?\n/);
  await bewerkTekst(ref, version, [
    {
      op: "insertParagraphs",
      target: { story: anker.story, paraId: anker.paraId },
      at: na === 0 ? "start" : "end",
      paragraphs: regels.map((regel) => ({ text: regel })),
    },
  ]);
  return { ingevoegd: regels.length, vanaf: na + 1 };
}

async function tekstVervangen(args: Args) {
  const ref = editor("docx", "tekst");
  const { version, paragraphs } = await alineas(ref);
  const nr = geheel(args.alinea, "alinea");
  if (nr !== undefined) {
    const tekst = tekstArg(args.tekst, "tekst")!;
    const p = paragraphs[nr - 1];
    if (!p) throw fout("buiten_bereik", `het document heeft ${paragraphs.length} alinea's`);
    await bewerkTekst(ref, version, [{ op: "replaceText", target: { kind: "paragraph", story: p.story, paraId: p.paraId }, text: tekst }]);
    return { vervangen: 1, alinea: nr };
  }
  const zoek = tekstArg(args.zoek, "zoek")!;
  const door = tekstArg(args.door, "door")!;
  if (!zoek) throw fout("ongeldig_argument", "zoek mag niet leeg zijn");
  const story = paragraphs[0]?.story ?? "body";
  const gevonden = await ref.findText({ text: zoek, within: { kind: "story", story }, view: "accepted", limit: args.alles === true ? 10_000 : 1 });
  if (!gevonden.ok) throw weigering(gevonden.failure);
  if (!gevonden.matches.length) throw fout("niet_gevonden", `"${zoek}" staat niet in het document`);
  await bewerkTekst(
    ref,
    gevonden.version,
    gevonden.matches.map((m) => ({ op: "replaceText", target: { kind: "range", ...m.range }, text: door })),
  );
  return { vervangen: gevonden.matches.length };
}

// ── Rekenblad ──────────────────────────────────────────────────────────────

function blad(api: XlsxEditorApi, waarde: unknown) {
  const info = api.handle.sheetInfo();
  let index = info.activeSheet;
  if (typeof waarde === "string") {
    index = info.sheetNames.findIndex((n) => n.toLowerCase() === waarde.trim().toLowerCase());
    if (index < 0) throw fout("onbekend_blad", `bladen: ${info.sheetNames.join(", ")}`);
  } else if (waarde !== undefined) {
    const nr = geheel(waarde, "blad")!;
    if (nr > info.sheetNames.length) throw fout("onbekend_blad", `er zijn ${info.sheetNames.length} bladen`);
    index = nr - 1;
  }
  return { index, sheetId: info.sheetIds[index], naam: info.sheetNames[index] };
}

async function leesBereik(api: XlsxEditorApi, sheetId: string, a1: string) {
  const r = await api.readCells({ ranges: [{ sheetId, range: { kind: "a1", a1 } }] });
  if (!r.ok) throw weigering(r.failure);
  const cellen = r.ranges[0]?.cells ?? [];
  const formules: Record<string, string> = {};
  for (const rij of cellen) for (const cel of rij) if (cel.formula !== null) formules[cel.a1] = `=${cel.formula}`;
  return { rijen: cellen.map((rij) => rij.map((cel) => cel.displayText)), formules };
}

async function cellenLezen(args: Args) {
  const api = editor("xlsx", "rekenblad");
  const b = blad(api, args.blad);
  let bereik;
  if (args.bereik !== undefined) {
    bereik = ontleedBereik(tekstArg(args.bereik, "bereik")!);
    if (!bereik) throw fout("ongeldig_argument", "bereik is bijvoorbeeld A1:D20");
  } else {
    const { gebruikt } = await import("../rekenblad/bladen");
    bereik = gebruikt(api, b.index) ?? { top: 0, left: 0, bottom: 0, right: 0 };
  }
  const aantal = (bereik.bottom - bereik.top + 1) * (bereik.right - bereik.left + 1);
  if (aantal > MAX_CELLEN) throw fout("te_groot", `${bereikA1(bereik)} heeft ${aantal} cellen; lees hooguit ${MAX_CELLEN} cellen tegelijk`);
  const a1 = bereikA1(bereik);
  return { blad: b.naam, bereik: a1, ...(await leesBereik(api, b.sheetId, a1)) };
}

/** Eén cel naar een engine-stap: getallen en waar/onwaar als waarde, `=…` als formule, tekst zoals een gebruiker typt. */
function celStap(sheetId: string, a1: string, waarde: unknown): XlsxEditStep {
  const target = { sheetId, range: { kind: "a1" as const, a1 } };
  if (waarde === null || waarde === "") return { op: "setCellValues", target, values: [[{ kind: "empty" }]] };
  if (typeof waarde === "number") {
    if (!Number.isFinite(waarde)) throw fout("ongeldig_argument", `${a1}: geen eindig getal`);
    return { op: "setCellValues", target, values: [[{ kind: "number", value: waarde } satisfies XlsxCellValue]] };
  }
  if (typeof waarde === "boolean") return { op: "setCellValues", target, values: [[{ kind: "bool", value: waarde }]] };
  if (typeof waarde !== "string") throw fout("ongeldig_argument", `${a1}: tekst, getal, waar/onwaar of null`);
  if (waarde.startsWith("=") && waarde.length > 1) return { op: "setFormulas", target, formulas: [[waarde.slice(1)]] };
  return { op: "setCellInputs", target, inputs: [[waarde]] };
}

async function cellenZetten(args: Args) {
  const api = editor("xlsx", "rekenblad");
  const b = blad(api, args.blad);
  const start = ontleedAdres(tekstArg(args.cel, "cel")!);
  if (!start) throw fout("ongeldig_argument", "cel is bijvoorbeeld B2");
  const waarden = args.waarden;
  if (!Array.isArray(waarden) || !waarden.length || !waarden.every((rij) => Array.isArray(rij)))
    throw fout("ongeldig_argument", "waarden is een lijst van rijen, bijvoorbeeld [[1, 2], [\"=A1+B1\"]]");
  const rijen = waarden as unknown[][];
  const breedte = Math.max(...rijen.map((rij) => rij.length));
  if (!breedte) throw fout("ongeldig_argument", "waarden is leeg");
  if (rijen.length * breedte > MAX_CELLEN) throw fout("te_groot", `zet hooguit ${MAX_CELLEN} cellen tegelijk`);
  const steps: XlsxEditStep[] = [];
  rijen.forEach((rij, r) =>
    rij.forEach((waarde, k) => {
      if (waarde !== undefined) steps.push(celStap(b.sheetId, `${kolomLetters(start.col + k)}${start.row + r + 1}`, waarde));
    }),
  );
  bewerkbaar();
  const resultaat = await api.applyEdits({ expectVersion: await api.version(), source: "agent", steps });
  if (!resultaat.ok) throw weigering(resultaat.failure);
  const a1 = bereikA1({ top: start.row, left: start.col, bottom: start.row + rijen.length - 1, right: start.col + breedte - 1 });
  return { blad: b.naam, bereik: a1, herberekend: resultaat.calculation.changed.length, ...(await leesBereik(api, b.sheetId, a1)) };
}

// ── Presentatie ────────────────────────────────────────────────────────────

async function inhoud(api: PptxEditorApi) {
  const r = await api.readContent();
  if (!r.ok) throw weigering(r.failure);
  const perDia = new Map<string, PptxStoryText[]>();
  for (const story of r.stories) perDia.set(story.slideId, [...(perDia.get(story.slideId) ?? []), story]);
  return { version: r.version, slides: r.slides, perDia };
}

function dia<T>(slides: T[], waarde: unknown): T {
  const nr = geheel(waarde, "dia")!;
  if (nr === undefined) throw fout("ongeldig_argument", "dia is verplicht");
  if (nr > slides.length) throw fout("buiten_bereik", `de presentatie heeft ${slides.length} dia's`);
  return slides[nr - 1];
}

async function diasLezen(args: Args) {
  const api = editor("pptx", "presentatie");
  const { slides, perDia } = await inhoud(api);
  const alleen = geheel(args.dia, "dia");
  if (alleen !== undefined && alleen > slides.length) throw fout("buiten_bereik", `de presentatie heeft ${slides.length} dia's`);
  return {
    totaal: slides.length,
    dias: slides
      .map((slide, i) => ({ slide, nr: i + 1 }))
      .filter(({ nr }) => alleen === undefined || nr === alleen)
      .map(({ slide, nr }) => {
        const vormen = new Map(slide.shapes.map((s) => [s.id, s]));
        return {
          nr,
          // Lege vormen zonder tijdelijke aanduiding (vlakken, lijnen) laten we weg; de nummering blijft die van alle vakken.
          vakken: (perDia.get(slide.id) ?? [])
            .map((story, v) => ({ vak: v + 1, vorm: vormen.get(story.shapeId), tekst: story.text }))
            .filter(({ vorm, tekst }) => tekst || vorm?.placeholder)
            .map(({ vak, vorm, tekst }) => ({ vak, vorm: vorm?.name ?? "", tekst })),
          ...(slide.notes ? { notities: slide.notes } : {}),
        };
      }),
  };
}

async function bewerkDia(api: PptxEditorApi, versie: string, steps: PptxEditStep[]) {
  bewerkbaar();
  const r = await api.applyEdits({ expectVersion: versie, source: "agent", steps });
  if (!r.ok) throw weigering(r.failure);
  return r;
}

/** Directe engine-bewerkingen als één ongedaan-stap (standaard maakt de engine er per bewerking een), daarna opnieuw tekenen. */
function alsEenStap(api: PptxEditorApi, werk: () => void) {
  const h = api.handle;
  const modus = h.undoCaptureMode();
  h.setUndoCaptureMode("manual");
  h.addUndoBoundary();
  try {
    werk();
  } finally {
    h.addUndoBoundary();
    h.setUndoCaptureMode(modus);
    api.refresh();
  }
}

/**
 * Schrijft `tekst` in een vak, een alinea per regel. `applyEdits` schrijft geen regeleinden en de engine haalt geen
 * alinea's weg; daarom van achter naar voren: elke bestaande alinea krijgt haar regel, overtollige worden leeg en extra
 * regels worden nieuwe alinea's achteraan.
 */
function schrijfVak(h: PresentationHandle, story: PptxStoryText, tekst: string) {
  const regels = tekst.split(/\r?\n/);
  const delen = story.paragraphs.length ? story.paragraphs : [{ start: 0, end: story.text.length }];
  for (let i = delen.length - 1; i >= 0; i--) {
    const { start, end } = delen[i];
    if (end > start) h.deleteText(story.storyId, start, end);
    let positie = start;
    (i === delen.length - 1 ? regels.slice(i) : [regels[i] ?? ""]).forEach((regel, j) => {
      if (j) h.insertParagraphBreak(story.storyId, positie++);
      if (regel) h.insertText(story.storyId, positie, regel);
      positie += regel.length;
    });
  }
}

async function voorbereid(api: PptxEditorApi) {
  bewerkbaar();
  await api.flushPendingInput();
  return api.handle;
}

async function diaTekst(args: Args) {
  const api = editor("pptx", "presentatie");
  const { slides, perDia } = await inhoud(api);
  const slide = dia(slides, args.dia);
  const nr = slides.indexOf(slide) + 1;
  const vakken = perDia.get(slide.id) ?? [];
  if (args.vak !== undefined) {
    const story = vakken[geheel(args.vak, "vak")! - 1];
    if (!story) throw fout("buiten_bereik", `dia ${nr} heeft ${vakken.length} tekstvakken`);
    const tekst = tekstArg(args.tekst, "tekst")!;
    const h = await voorbereid(api);
    alsEenStap(api, () => schrijfVak(h, story, tekst));
    return { dia: nr, vak: vakken.indexOf(story) + 1 };
  }
  const zoek = tekstArg(args.zoek, "zoek")!;
  const door = tekstArg(args.door, "door")!;
  if (!zoek) throw fout("ongeldig_argument", "zoek mag niet leeg zijn");
  const gevonden = await api.findText({ text: zoek, within: { slideId: slide.id } });
  if (!gevonden.ok) throw weigering(gevonden.failure);
  if (!gevonden.matches.length) throw fout("niet_gevonden", `"${zoek}" staat niet op dia ${nr}`);
  await bewerkDia(
    api,
    gevonden.version,
    gevonden.matches.map((m) => ({ op: "replaceText", target: { kind: "range", ...m.range }, text: door })),
  );
  return { dia: nr, vervangen: gevonden.matches.length };
}

async function diaToevoegen(args: Args) {
  const api = editor("pptx", "presentatie");
  bewerkbaar();
  const voor = await inhoud(api);
  const na = geheel(args.na, "na") ?? voor.slides.length;
  if (na > voor.slides.length) throw fout("buiten_bereik", `de presentatie heeft ${voor.slides.length} dia's`);
  const teksten = args.teksten;
  if (teksten !== undefined && (!Array.isArray(teksten) || !teksten.every((t) => typeof t === "string")))
    throw fout("ongeldig_argument", "teksten is een lijst met tekst per vak");
  // Dezelfde opdracht als Nieuwe dia: na de huidige dia, met haar indeling.
  if (!api.goToSlide(na)) throw fout("buiten_bereik", `dia ${na} bestaat niet`);
  const r = await api.commands.execute("insertSlide", {});
  if (!r.ok || r.status !== "executed") throw fout("niet_gelukt", "de dia is niet toegevoegd");
  const bekend = new Set(voor.slides.map((s) => s.id));
  const na2 = await inhoud(api);
  const nieuw = na2.slides.find((s) => !bekend.has(s.id));
  if (!nieuw) throw fout("niet_gelukt", "de nieuwe dia is niet gevonden");
  const vakken = na2.perDia.get(nieuw.id) ?? [];
  const lijst = (teksten as string[] | undefined) ?? [];
  if (lijst.length) {
    const h = await voorbereid(api);
    const deck = h.snapshot();
    const marge = Math.round(deck.widthEmu / 12);
    const extra = lijst.length - vakken.length;
    const hoogte = Math.round((deck.heightEmu - 2 * marge) / Math.max(1, extra));
    alsEenStap(api, () => {
      // Een indeling zonder (genoeg) tijdelijke aanduidingen: de rest in nieuwe tekstvakken, onder elkaar.
      for (let i = 0; i < extra; i++)
        h.addTextBox(nieuw.id, {
          name: `Tekstvak ${vakken.length + i + 1}`,
          rect: { x: marge, y: marge + i * hoogte, width: deck.widthEmu - 2 * marge, height: hoogte },
          text: "",
          style: {},
        });
      const gelezen = h.readContent({ slideIds: [nieuw.id] });
      if (!gelezen.ok) throw weigering(gelezen.failure);
      lijst.forEach((tekst, i) => schrijfVak(h, gelezen.stories[i], tekst));
    });
  }
  const nr = na2.slides.indexOf(nieuw) + 1;
  return { dia: nr, totaal: na2.slides.length, tekstvakken: Math.max(vakken.length, lijst.length), ongedaanStappen: lijst.length ? 2 : 1 };
}

// ── Algemeen ───────────────────────────────────────────────────────────────

async function stand() {
  const e = actieveEditor();
  if (!e) return { document: null };
  const basis = { document: e.naam, soort: e.soort, alleenLezen: e.alleenLezen };
  if (e.soort === "docx" && e.tekst) {
    const { paragraphs } = await alineas(e.tekst);
    const selectie = e.tekst.getSelectionInfo()?.selectedText ?? "";
    return { ...basis, paginas: e.tekst.getTotalPages(), alineas: paragraphs.length, ...(selectie ? { selectie: selectie.slice(0, 2_000) } : {}) };
  }
  if (e.soort === "xlsx" && e.rekenblad) {
    const info = e.rekenblad.handle.sheetInfo();
    let selectie: string | undefined;
    try {
      const { leesSelectie } = await import("../lint/rekenblad-opdrachten");
      selectie = bereikA1(leesSelectie(e.rekenblad).bereik);
    } catch {
      selectie = undefined;
    }
    return { ...basis, bladen: info.sheetNames, actiefBlad: info.sheetNames[info.activeSheet], ...(selectie ? { selectie } : {}) };
  }
  if (e.soort === "pptx" && e.presentatie) {
    const { huidigeDia } = await import("../export/editorKoppeling");
    return { ...basis, dias: e.presentatie.handle.snapshot().slides.length, huidigeDia: huidigeDia() + 1 };
  }
  return { ...basis, gereed: false };
}

async function ongedaanMaken() {
  const e = actieveEditor();
  if (!e) throw fout("geen_document", "open eerst een document");
  const api = e.tekst ?? e.rekenblad ?? e.presentatie;
  if (!api) throw fout("niet_gereed", "het document laadt nog");
  bewerkbaar();
  const r = await (api.commands as { execute(id: "undo", args: null): Promise<{ ok: boolean; status?: string }> }).execute("undo", null);
  return { ongedaan: r.ok && r.status === "executed" };
}

// ── Definities ─────────────────────────────────────────────────────────────

const leeg = { type: "object", properties: {}, additionalProperties: false };
const bladArg = { type: ["string", "integer"], description: "Bladnaam of bladnummer (1 = eerste); zonder: het actieve blad." };

const DEFINITIES: AppToolDefinitie[] = [
  {
    name: "office_stand",
    description: "Het open document: naam, soort (docx, xlsx of pptx), alleen-lezen, aantal pagina's/alinea's, bladen of dia's, en de selectie.",
    inputSchema: leeg,
  },
  {
    name: "office_tekst_lezen",
    description: "Tekstdocument: lees alinea's met nummer, tekst, stijl en kopniveau.",
    inputSchema: {
      type: "object",
      properties: {
        vanaf: { type: "integer", minimum: 1, description: "Eerste alinea (1 = begin)." },
        aantal: { type: "integer", minimum: 1, description: `Aantal alinea's, standaard ${STANDAARD_ALINEAS}.` },
      },
      additionalProperties: false,
    },
  },
  {
    name: "office_tekst_invoegen",
    description: "Tekstdocument: voeg nieuwe alinea's in (elke regel wordt een alinea) na alinea `na`; 0 = vooraan, zonder = achteraan.",
    inputSchema: {
      type: "object",
      properties: {
        tekst: { type: "string" },
        na: { type: "integer", minimum: 0 },
      },
      required: ["tekst"],
      additionalProperties: false,
    },
  },
  {
    name: "office_tekst_vervangen",
    description: "Tekstdocument: vervang `zoek` door `door` (exact, hoofdlettergevoelig; `alles` voor elke plek), of geef `alinea` en `tekst` om een hele alinea te vervangen.",
    inputSchema: {
      type: "object",
      properties: {
        zoek: { type: "string" },
        door: { type: "string" },
        alles: { type: "boolean" },
        alinea: { type: "integer", minimum: 1 },
        tekst: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "office_cellen_lezen",
    description: `Rekenblad: lees de cellen van een bereik (zonder: het gebruikte deel van het blad), als getoonde tekst plus formules; hooguit ${MAX_CELLEN} cellen.`,
    inputSchema: {
      type: "object",
      properties: { blad: bladArg, bereik: { type: "string", description: "Bijvoorbeeld A1:D20." } },
      additionalProperties: false,
    },
  },
  {
    name: "office_cellen_zetten",
    description: "Rekenblad: zet waarden vanaf cel `cel`, rij voor rij. Tekst die met = begint is een formule (Engelse functienamen, komma als scheidingsteken); null maakt een cel leeg. Geeft het resultaat terug.",
    inputSchema: {
      type: "object",
      properties: {
        blad: bladArg,
        cel: { type: "string", description: "Linkerbovencel, bijvoorbeeld B2." },
        waarden: {
          type: "array",
          items: { type: "array", items: { type: ["string", "number", "boolean", "null"] } },
          description: 'Rijen met waarden, bijvoorbeeld [["Aantal", 3], ["Totaal", "=SUM(B1:B1)"]].',
        },
      },
      required: ["cel", "waarden"],
      additionalProperties: false,
    },
  },
  {
    name: "office_dias_lezen",
    description: "Presentatie: lees de tekst per dia, per tekstvak, met de notities.",
    inputSchema: {
      type: "object",
      properties: { dia: { type: "integer", minimum: 1, description: "Alleen deze dia (1 = eerste)." } },
      additionalProperties: false,
    },
  },
  {
    name: "office_dia_tekst",
    description: "Presentatie: vervang de tekst van tekstvak `vak` op dia `dia` door `tekst` (vaknummers uit office_dias_lezen), of vervang `zoek` door `door` op die dia.",
    inputSchema: {
      type: "object",
      properties: {
        dia: { type: "integer", minimum: 1 },
        vak: { type: "integer", minimum: 1 },
        tekst: { type: "string" },
        zoek: { type: "string" },
        door: { type: "string" },
      },
      required: ["dia"],
      additionalProperties: false,
    },
  },
  {
    name: "office_dia_toevoegen",
    description: "Presentatie: voeg een dia toe na dia `na` (zonder: achteraan) met de indeling van die dia; `teksten` vult de tekstvakken op volgorde (zo nodig in nieuwe tekstvakken). Kan meer dan één ongedaan-stap zijn (zie ongedaanStappen).",
    inputSchema: {
      type: "object",
      properties: {
        na: { type: "integer", minimum: 1 },
        teksten: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
  {
    name: "office_undo",
    description: "Maak de laatste bewerking in het open document ongedaan.",
    inputSchema: leeg,
  },
];

const UITVOERING: Record<string, (args: Args) => Promise<unknown>> = {
  office_stand: stand,
  office_tekst_lezen: tekstLezen,
  office_tekst_invoegen: tekstInvoegen,
  office_tekst_vervangen: tekstVervangen,
  office_cellen_lezen: cellenLezen,
  office_cellen_zetten: cellenZetten,
  office_dias_lezen: diasLezen,
  office_dia_tekst: diaTekst,
  office_dia_toevoegen: diaToevoegen,
  office_undo: ongedaanMaken,
};

export function maakAppTools(): AppTools {
  return {
    tools: () => DEFINITIES.map((d) => d.name),
    definitions: async () => structuredClone(DEFINITIES),
    async run(naam, argumenten = {}) {
      if (!Object.prototype.hasOwnProperty.call(UITVOERING, naam)) throw fout("onbekende_tool", naam);
      if (!argumenten || typeof argumenten !== "object" || Array.isArray(argumenten)) throw fout("ongeldig_argument", "argumenten is een object");
      const definitie = DEFINITIES.find((d) => d.name === naam)!.inputSchema as { properties: object };
      const onbekend = Object.keys(argumenten).filter((k) => !(k in definitie.properties));
      if (onbekend.length) throw fout("ongeldig_argument", `onbekend: ${onbekend.join(", ")}`);
      const antwoord = JSON.parse(JSON.stringify((await UITVOERING[naam](argumenten)) ?? null));
      const lengte = JSON.stringify(antwoord).length;
      if (lengte > MAX_TEKENS) throw fout("te_groot", `het antwoord heeft ${lengte} tekens; vraag een kleiner deel`);
      return antwoord;
    },
  };
}

/** Zet `window.__OPDS_APP__`, alleen in de browserbouw: onder Tauri is er geen werkplek. */
export function installeerAppTools(venster: Window = window): boolean {
  if ("__TAURI_INTERNALS__" in venster) return false;
  (venster as Window & { __OPDS_APP__?: AppTools }).__OPDS_APP__ = maakAppTools();
  return true;
}
