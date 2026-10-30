/** Genereer echte bronbewaring en beproef weigeringen; geen echte mail of accounts. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { maakDossier, controleerDossier, attribuut } from "./bewaarprofiel.mjs";

const wortel = fileURLToPath(new URL("../../", import.meta.url));
const documenten = [];
for (const [kind, ext, mediaType] of [
  [
    "writer",
    "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    "spreadsheet",
    "xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  [
    "presentation",
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
])
  documenten.push({
    id: kind,
    kind,
    title: `Bewaarproef ${kind}`,
    fileName: `nieuw.${ext}`,
    mediaType,
    bytes: await readFile(join(wortel, `public/templates/nieuw.${ext}`)),
  });

const eml = Buffer.from(
  [
    "From: afzender@example.invalid",
    "To: ontvanger@example.invalid",
    "Date: Fri, 30 Oct 2026 10:00:00 +0100",
    "Message-ID: <proef1@example.invalid>",
    "Subject: Bewaarproef",
    "X-Proef: eerste",
    "X-Proef: tweede",
    "X-Gevouwen: regel een",
    " regel twee",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="openaec-proef"',
    "",
    "--openaec-proef",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "Een volledige e-mailbron met bijlage.",
    "--openaec-proef",
    'Content-Type: text/csv; charset="utf-8"',
    'Content-Disposition: attachment; filename="hoeveelheden.csv"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("Materiaal,Aantal\r\nHout,3\r\n").toString("base64"),
    "--openaec-proef--",
    "",
  ].join("\r\n"),
  "utf8",
);
documenten.push({
  id: "email",
  kind: "email",
  title: "Bewaarproef e-mail",
  fileName: "bericht.eml",
  mediaType: "message/rfc822",
  bytes: eml,
});
const notities = {
  formaat: "openaec-notities",
  versie: 3,
  boeken: [
    {
      id: "boek",
      naam: "Bewaarproef",
      secties: [
        {
          id: "canvas",
          naam: "Canvas",
          soort: "canvas",
          paginas: [
            {
              id: "pagina1",
              titel: "Vrij tekstvak",
              bijgewerkt: "2026-10-30T00:00:00Z",
              vastgezet: false,
              verwijderd: false,
              markdown: "",
              vakken: [
                {
                  id: "vak1",
                  x: 78,
                  y: 70,
                  breedte: 360,
                  hoogte: 80,
                  blokken: [
                    {
                      id: "blok1",
                      soort: "tekst",
                      tekst: "Een vrij tekstvak.",
                      vet: false,
                      cursief: false,
                      klaar: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "markdown",
          naam: "Markdown",
          soort: "markdown",
          paginas: [
            {
              id: "pagina2",
              titel: "Bron behouden",
              bijgewerkt: "2026-10-30T00:00:00Z",
              vastgezet: false,
              verwijderd: false,
              vakken: [],
              markdown: "# Notitie\n\n  witruimte behouden\n",
            },
          ],
        },
      ],
    },
  ],
};
documenten.push({
  id: "notition",
  kind: "notition",
  title: "Bewaarproef notities",
  fileName: "notities.openaec-notities",
  mediaType: "application/json",
  bytes: Buffer.from(JSON.stringify(notities)),
});

const dossier = maakDossier(documenten);
const uit = join(wortel, ".local/ifcx-office-voorstel");
await mkdir(uit, { recursive: true });
const bestand = join(uit, "office-bewaarproef.ifcx");
await writeFile(bestand, JSON.stringify(dossier, null, 2) + "\n");
await writeFile(
  join(uit, "email-bewaarproef.ifcx"),
  JSON.stringify(
    maakDossier(documenten.filter((d) => d.kind === "email")),
    null,
    2,
  ) + "\n",
);
await writeFile(join(uit, "bericht.eml"), eml);
const terug = JSON.parse(await readFile(bestand, "utf8"));
const gelezen = controleerDossier(terug);
assert.equal(gelezen.length, 5);
for (const doc of documenten)
  assert.deepEqual(
    gelezen.find((d) => d.kind === doc.kind).bytes,
    doc.bytes,
    `Bronbytes ${doc.kind}`,
  );

const beschadig = (wijzig) => {
  const kopie = structuredClone(terug);
  wijzig(kopie);
  assert.throws(() => controleerDossier(kopie));
};
const bron = (d) =>
  d.data.find((n) => n.attributes?.[attribuut + "payload"]).attributes[
    attribuut + "payload"
  ];
beschadig((d) => {
  bron(d).sha256 = "0".repeat(64);
});
beschadig((d) => {
  bron(d).byteLength++;
});
beschadig((d) => {
  d.data.find((n) => n.attributes?.[attribuut + "document"]).attributes[
    attribuut + "document"
  ].source = "/office/ontbreekt";
});
beschadig((d) => {
  bron(d).content += "!";
});
beschadig((d) => {
  d.data[0].attributes[attribuut + "collection"].profileVersion = "onbekend";
});
beschadig((d) => {
  const mail = d.data.find(
    (n) => n.attributes?.[attribuut + "document"]?.kind === "email",
  );
  const payload = d.data.find(
    (n) => n.path === mail.attributes[attribuut + "document"].source,
  );
  payload.attributes[attribuut + "payload"].mediaType = "text/plain";
});
beschadig((d) => {
  d.data.push(structuredClone(d.data[1]));
});
beschadig((d) => {
  d.imports.push({ uri: "https://example.invalid/ongewenst.ifcx" });
});
terug.data[1].attributes["ander::onbekend"] = {
  bewaren: [1, "letterlijk", null],
};
controleerDossier(terug);
assert.deepEqual(terug.data[1].attributes["ander::onbekend"], {
  bewaren: [1, "letterlijk", null],
});
console.log(
  `Vijf bronformaten bytegelijk heropend, acht ongeldige varianten geweigerd, onbekend attribuut behouden.\n${bestand}`,
);
