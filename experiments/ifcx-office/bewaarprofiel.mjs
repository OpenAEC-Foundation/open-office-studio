/** Begrensde bewaarproef; nog niet gekoppeld aan de productie-apps. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const profiel = "0.1.0-draft.1";
export const attribuut = "openaec::office::";
const soorten = [
  "writer",
  "spreadsheet",
  "presentation",
  "email",
  "notition",
  "database",
];
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

const string = { dataType: "String" };
const object = (values) => ({
  value: { dataType: "Object", objectRestrictions: { values } },
});
const schemas = {
  [attribuut + "collection"]: object({ profileVersion: string, title: string }),
  [attribuut + "document"]: object({
    kind: { dataType: "Enum", enumRestrictions: { options: soorten } },
    title: string,
    source: { dataType: "Reference" },
  }),
  [attribuut + "payload"]: object({
    fileName: string,
    mediaType: string,
    byteLength: { dataType: "Integer" },
    sha256: string,
    encoding: { dataType: "Enum", enumRestrictions: { options: ["base64"] } },
    content: string,
  }),
};

export function maakDossier(documenten) {
  const root = {
    path: "/office/voorbeeld",
    children: {},
    attributes: {
      [attribuut + "collection"]: {
        profileVersion: profiel,
        title: "Office-bewaarproef",
      },
    },
  };
  const data = [root];
  const bronnen = new Set();
  for (const doc of documenten) {
    const hash = sha256(doc.bytes);
    const source = `/office/payload/${hash}`;
    const path = `/office/document/${doc.id}`;
    root.children[doc.id] = path;
    data.push({
      path,
      attributes: {
        [attribuut + "document"]: { kind: doc.kind, title: doc.title, source },
      },
    });
    if (bronnen.has(hash)) continue;
    bronnen.add(hash);
    data.push({
      path: source,
      attributes: {
        [attribuut + "payload"]: {
          fileName: doc.fileName,
          mediaType: doc.mediaType,
          byteLength: doc.bytes.length,
          sha256: hash,
          encoding: "base64",
          content: Buffer.from(doc.bytes).toString("base64"),
        },
      },
    });
  }
  return {
    header: {
      id: "urn:example:openaec:office:bewaarproef",
      ifcxVersion: "ifcx_alpha",
      dataVersion: "1.0.0",
      author: "OpenAEC",
      timestamp: "2026-10-30T00:00:00Z",
    },
    imports: [],
    schemas: structuredClone(schemas),
    data,
  };
}

/** Alleen dit bewaarprofiel: geen algemene IFCX- of MIME-conformiteitsclaim. */
export function controleerDossier(dossier) {
  assert.equal(
    dossier.header?.ifcxVersion,
    "ifcx_alpha",
    "Onbekende IFCX-versie",
  );
  assert.deepEqual(dossier.imports, [], "Deze proef verwerkt geen imports");
  for (const [naam, schema] of Object.entries(schemas))
    assert.deepEqual(
      dossier.schemas?.[naam],
      schema,
      `Afwijkende profielschema's: ${naam}`,
    );
  assert(
    Array.isArray(dossier.data) && dossier.data.length <= 1000,
    "Ongeldige of te grote nodeverzameling",
  );
  const nodes = new Map();
  for (const node of dossier.data) {
    assert(/^\/office\/[A-Za-z0-9/]+$/.test(node.path), "Ongeldig proefpad");
    assert(
      !nodes.has(node.path),
      "Dubbele nodefragmenten zijn in deze proef niet toegestaan",
    );
    assert(
      !node.inherits || Object.keys(node.inherits).length === 0,
      "Deze proef verwerkt geen overerving",
    );
    nodes.set(node.path, node);
  }
  const roots = dossier.data.filter(
    (n) => n.attributes?.[attribuut + "collection"],
  );
  assert.equal(roots.length, 1, "Eén dossierroot vereist");
  assert.equal(
    roots[0].attributes[attribuut + "collection"].profileVersion,
    profiel,
    "Onbekende profielversie",
  );
  const documenten = [];
  for (const node of nodes.values()) {
    for (const child of Object.values(node.children ?? {}))
      assert(nodes.has(child), "Ontbrekend child-doel");
    const bron = node.attributes?.[attribuut + "payload"];
    if (bron) {
      assert.equal(bron.encoding, "base64", "Onbekende broncodering");
      assert(
        typeof bron.content === "string" && bron.content.length <= 16_000_000,
        "Te grote bron",
      );
      const bytes = Buffer.from(bron.content, "base64");
      assert.equal(bytes.toString("base64"), bron.content, "Ongeldige base64");
      assert(
        Number.isSafeInteger(bron.byteLength) && bron.byteLength >= 0,
        "Ongeldig byte-aantal",
      );
      assert.equal(bytes.length, bron.byteLength, "Byte-aantal wijkt af");
      assert.equal(sha256(bytes), bron.sha256, "Bronhash wijkt af");
      assert.equal(
        node.path,
        `/office/payload/${bron.sha256}`,
        "Bronpad wijkt af",
      );
      assert(
        typeof bron.fileName === "string" && typeof bron.mediaType === "string",
        "Bronmetadata ontbreekt",
      );
    }
    const doc = node.attributes?.[attribuut + "document"];
    if (!doc) continue;
    assert(soorten.includes(doc.kind), "Onbekende documentsoort");
    assert(typeof doc.title === "string", "Documenttitel ontbreekt");
    const payload = nodes.get(doc.source)?.attributes?.[attribuut + "payload"];
    assert(payload, "Documentbron ontbreekt");
    if (doc.kind === "email")
      assert.equal(
        payload.mediaType,
        "message/rfc822",
        "E-mail vereist de oorspronkelijke EML/MIME-bron",
      );
    documenten.push({
      node: node.path,
      kind: doc.kind,
      bron: payload,
      bytes: Buffer.from(payload.content, "base64"),
    });
  }
  assert(documenten.length > 0, "Dossier bevat geen documenten");
  const children = Object.values(roots[0].children ?? {});
  assert.equal(
    new Set(children).size,
    documenten.length,
    "Root verwijst niet naar alle documenten",
  );
  assert(
    documenten.every((doc) => children.includes(doc.node)),
    "Document buiten dossierroot",
  );
  return documenten;
}
