/** Het begrensde, offline Office-bronprofiel; geen algemene IFCX-compositielezer. */
import { Buffer } from "buffer";
import type { Soort } from "../editors";
import i18next from "../i18n/config";

export const PROFIEL = "0.1.0-draft.1";
export const ATTR = "openaec::office::";
export const MAX_IFCX = 100 * 1024 * 1024;
export const MAX_BRONNEN = 70 * 1024 * 1024;
export const MIME = "application/json";
type Objectwaarde = Record<string, unknown>;

const string = { dataType: "String" };
const object = (values: Objectwaarde) => ({
  value: { dataType: "Object", objectRestrictions: { values } },
});
export const SCHEMAS = {
  [ATTR + "collection"]: object({ profileVersion: string, title: string }),
  [ATTR + "document"]: object({
    kind: {
      dataType: "Enum",
      enumRestrictions: {
        options: [
          "writer",
          "spreadsheet",
          "presentation",
          "email",
          "notition",
          "database",
        ],
      },
    },
    title: string,
    source: { dataType: "Reference" },
  }),
  [ATTR + "payload"]: object({
    fileName: string,
    mediaType: string,
    byteLength: { dataType: "Integer" },
    sha256: string,
    encoding: { dataType: "Enum", enumRestrictions: { options: ["base64"] } },
    content: string,
  }),
};
const DOCUMENTEN = {
  docx: {
    kind: "writer",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    macro: "docm",
    macroMime: "application/vnd.ms-word.document.macroEnabled.12",
  },
  xlsx: {
    kind: "spreadsheet",
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    macro: "xlsm",
    macroMime: "application/vnd.ms-excel.sheet.macroEnabled.12",
  },
  pptx: {
    kind: "presentation",
    mediaType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    macro: "pptm",
    macroMime: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
  },
} as const;

/** Alleen JSON-gegevens: ook overdraagbaar naar een ander documentvenster. */
export interface IfcxBron {
  documentPad: string;
  bronPad: string;
  /** Letterlijke UTF-8-brontekst; geen tweede payloadkopie als getallenreeks. */
  origineel: string;
}
export interface IfcxDocument {
  soort: Soort;
  naam: string;
  bytes: Uint8Array;
  bron: IfcxBron;
}

function fout(
  code:
    | "invalid"
    | "profile"
    | "composition"
    | "documents"
    | "integrity"
    | "size",
) {
  return new Error(i18next.t(`import:ifcx.${code}`));
}
function obj(value: unknown): Objectwaarde {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw fout("invalid");
  return value as Objectwaarde;
}
function tekst(value: unknown): string {
  if (typeof value !== "string") throw fout("invalid");
  return value;
}
function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canon(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function nodesVan(dossier: Objectwaarde): Objectwaarde[] {
  if (
    !Array.isArray(dossier.data) ||
    !dossier.data.length ||
    dossier.data.length > 1000
  )
    throw fout("invalid");
  return dossier.data.map(obj);
}

function controleerGetallen(tekst: string) {
  // Ook onbekende extensies mogen bij een latere JSON-opslag niet door
  // afronding veranderen. Sla tekenreeksen over (waaronder de base64-bron).
  const tokens =
    /"[^"\\]*(?:\\.[^"\\]*)*"|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  for (const token of tekst.matchAll(tokens)) {
    if (!token[1]) continue;
    const getal = Number(token[1]);
    if (
      !Number.isFinite(getal) ||
      (Number.isInteger(getal) && !Number.isSafeInteger(getal))
    )
      throw fout("profile");
  }
}

/** Weigert corruptie en onbegrepen compositie vóór het openen van een editor. */
export async function openIfcx(invoer: Uint8Array): Promise<IfcxDocument> {
  if (!invoer.byteLength || invoer.byteLength > MAX_IFCX) throw fout("size");
  let dossier: Objectwaarde;
  let origineel: string;
  try {
    origineel = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(invoer);
    controleerGetallen(origineel);
    dossier = obj(JSON.parse(origineel.replace(/^\uFEFF/, "")));
  } catch {
    throw fout("invalid");
  }
  const header = obj(dossier.header);
  if (header.ifcxVersion !== "ifcx_alpha") throw fout("profile");
  for (const key of ["id", "dataVersion", "author", "timestamp"])
    tekst(header[key]);
  if (!Array.isArray(dossier.imports) || dossier.imports.length)
    throw fout("composition");
  const schemas = obj(dossier.schemas);
  for (const [naam, schema] of Object.entries(SCHEMAS)) {
    if (canon(schemas[naam]) !== canon(schema)) throw fout("profile");
  }
  const nodes = nodesVan(dossier);
  const paden = new Map<string, Objectwaarde>();
  for (const node of nodes) {
    const pad = tekst(node.path);
    if (!/^\/office\/[A-Za-z0-9/]+$/.test(pad) || paden.has(pad))
      throw fout("composition");
    if (node.inherits !== undefined && Object.keys(obj(node.inherits)).length)
      throw fout("composition");
    if (node.attributes !== undefined) obj(node.attributes);
    paden.set(pad, node);
  }
  let totaal = 0;
  const bronnen = new Map<string, { bytes: Uint8Array; meta: Objectwaarde }>();
  const documenten: Objectwaarde[] = [];
  const roots: Objectwaarde[] = [];
  for (const node of nodes) {
    for (const doel of Object.values(
      node.children === undefined ? {} : obj(node.children),
    )) {
      if (!paden.has(tekst(doel))) throw fout("invalid");
    }
    const attributes = obj(node.attributes ?? {});
    if (Object.hasOwn(attributes, ATTR + "collection")) roots.push(node);
    if (Object.hasOwn(attributes, ATTR + "document")) documenten.push(node);
    if (!Object.hasOwn(attributes, ATTR + "payload")) continue;
    const meta = obj(attributes[ATTR + "payload"]);
    const content = tekst(meta.content);
    if (
      meta.encoding !== "base64" ||
      !Number.isSafeInteger(meta.byteLength) ||
      (meta.byteLength as number) <= 0
    )
      throw fout("invalid");
    if (content.length > Math.ceil(MAX_BRONNEN / 3) * 4) throw fout("size");
    const bytes = new Uint8Array(Buffer.from(content, "base64"));
    totaal += bytes.byteLength;
    if (totaal > MAX_BRONNEN) throw fout("size");
    if (
      Buffer.from(bytes).toString("base64") !== content ||
      bytes.byteLength !== meta.byteLength
    )
      throw fout("integrity");
    const hash = await sha256(bytes);
    if (meta.sha256 !== hash || node.path !== `/office/payload/${hash}`)
      throw fout("integrity");
    tekst(meta.fileName);
    tekst(meta.mediaType);
    bronnen.set(tekst(node.path), { bytes, meta });
  }
  if (
    roots.length !== 1 ||
    obj(obj(roots[0].attributes)[ATTR + "collection"]).profileVersion !==
      PROFIEL
  )
    throw fout("profile");
  if (documenten.length !== 1) throw fout("documents");
  const node = documenten[0];
  const document = obj(obj(node.attributes)[ATTR + "document"]);
  tekst(document.title);
  const soort = (Object.keys(DOCUMENTEN) as Soort[]).find(
    (s) => DOCUMENTEN[s].kind === document.kind,
  );
  if (!soort) throw fout("documents");
  const bronPad = tekst(document.source);
  const bron = bronnen.get(bronPad);
  if (!bron || !Object.values(obj(roots[0].children)).includes(node.path))
    throw fout("invalid");
  const naam = tekst(bron.meta.fileName);
  const ext = naam.split(".").pop()?.toLowerCase();
  const formaat = DOCUMENTEN[soort];
  if (
    !naam ||
    /[\\/\u0000-\u001f]/.test(naam) ||
    !(
      (ext === soort && bron.meta.mediaType === formaat.mediaType) ||
      (ext === formaat.macro && bron.meta.mediaType === formaat.macroMime)
    )
  )
    throw fout("documents");
  return {
    soort,
    naam,
    bytes: bron.bytes,
    bron: { documentPad: tekst(node.path), bronPad, origineel },
  };
}

/** Schrijft een nieuwe bronrevisie met behoud van onbekende velden en oudere bronnen. */
export async function maakIfcx(opties: {
  soort: Soort;
  naam: string;
  bytes: Uint8Array;
  macro?: boolean;
  vorige?: IfcxBron;
  /** Alleen waar de opslagbewaking bevestigt dat sinds openen niets is bewerkt. */
  ongewijzigd?: boolean;
}): Promise<{ bytes: Uint8Array; bron: IfcxBron }> {
  if (opties.vorige && opties.ongewijzigd) {
    const bytes = new TextEncoder().encode(opties.vorige.origineel);
    const gecontroleerd = await openIfcx(bytes);
    if (gecontroleerd.soort !== opties.soort) throw fout("documents");
    return { bytes, bron: gecontroleerd.bron };
  }
  if (!opties.bytes.length || opties.bytes.length > MAX_BRONNEN)
    throw fout("size");
  const hash = await sha256(opties.bytes);
  const bronPad = `/office/payload/${hash}`;
  const uuid = crypto.randomUUID();
  const id = uuid.replaceAll("-", "");
  const documentPad = opties.vorige?.documentPad ?? `/office/document/${id}`;
  const datum = new Date().toISOString();
  const dossier: Objectwaarde = opties.vorige
    ? obj(JSON.parse(opties.vorige.origineel.replace(/^\uFEFF/, "")))
    : {
        header: {
          id: `urn:uuid:${uuid}`,
          ifcxVersion: "ifcx_alpha",
          dataVersion: "1.0.0",
          author: "OpenAEC",
          timestamp: datum,
        },
        imports: [],
        schemas: structuredClone(SCHEMAS),
        data: [
          {
            path: `/office/collection/${id}`,
            children: { [id]: documentPad },
            attributes: {
              [ATTR + "collection"]: {
                profileVersion: PROFIEL,
                title: opties.naam,
              },
            },
          },
          {
            path: documentPad,
            attributes: {
              [ATTR + "document"]: {
                kind: DOCUMENTEN[opties.soort].kind,
                title: opties.naam,
                source: bronPad,
              },
            },
          },
        ],
      };
  obj(dossier.header).timestamp = datum;
  const nodes = nodesVan(dossier);
  const node = nodes.find((n) => n.path === documentPad);
  if (!node) throw fout("invalid");
  const doc = obj(obj(node.attributes)[ATTR + "document"]);
  if (doc.kind !== DOCUMENTEN[opties.soort].kind) throw fout("documents");
  doc.source = bronPad;
  const formaat = DOCUMENTEN[opties.soort];
  if (!nodes.some((n) => n.path === bronPad)) {
    nodes.push({
      path: bronPad,
      attributes: {
        [ATTR + "payload"]: {
          fileName: `${opties.naam.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") || "Document"}.${opties.macro ? formaat.macro : opties.soort}`,
          mediaType: opties.macro ? formaat.macroMime : formaat.mediaType,
          byteLength: opties.bytes.length,
          sha256: hash,
          encoding: "base64",
          content: Buffer.from(opties.bytes).toString("base64"),
        },
      },
    });
  }
  dossier.data = nodes;
  const bytes = new TextEncoder().encode(JSON.stringify(dossier));
  // Controleer ook onze eigen uitvoer, inclusief gedeelde bronnen en de totale grens.
  const opnieuw = await openIfcx(bytes);
  return { bytes, bron: opnieuw.bron };
}
