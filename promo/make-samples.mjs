// Maakt de zelfgemaakte voorbeeldbestanden voor de promovideo.
// Gebruik: node promo/make-samples.mjs   (Node 22.18+ of 24, voor TypeScript-import)
//
// - promo/output/sample/library.sqlite: een kleine fictieve bibliotheekdatabase
//   als werkkopie van Open Database Studio, gemaakt met de eigen werkkopiecode
//   van de app (tabellen, twee opgeslagen query's en een VBA-module).
// Er worden geen bestaande databases, corpusbestanden of persoonsgegevens gebruikt.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { nieuweWerkkopie } from "../packages/database/src/werkkopie/werkkopie.ts";

const hier = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(hier, "..", "package.json"));
const initSqlJs = require("sql.js");
const uit = join(hier, "output", "sample");
mkdirSync(uit, { recursive: true });

const SQL = await initSqlJs();
const wk = nieuweWerkkopie(SQL, "Library demo");

await wk.maakTabel({
  naam: "Books",
  velden: [
    { naam: "BookID", soort: "tekst", lengte: 8, primair: true, verplicht: true },
    { naam: "Title", soort: "tekst", lengte: 120, verplicht: true },
    { naam: "Author", soort: "tekst", lengte: 80 },
    { naam: "Shelf", soort: "tekst", lengte: 10 },
    { naam: "Year", soort: "geheel" },
    { naam: "OnLoan", soort: "jaNee", standaard: false },
  ],
});
// Fictieve titels en auteurs, zelf bedacht voor deze demo.
const boeken = [
  ["B-001", "Timber Frames in Practice", "R. Holt", "A2", 2019, true],
  ["B-002", "Daylight and Space", "M. Ortega", "A4", 2021, false],
  ["B-003", "Concrete Without Cracks", "J. Lindqvist", "B1", 2017, true],
  ["B-004", "The Quiet Facade", "S. Okafor", "B3", 2022, false],
  ["B-005", "Roofs of the North Sea", "E. Vermeer", "C2", 2015, true],
  ["B-006", "Small Libraries, Big Ideas", "A. Kowalski", "C5", 2023, false],
  ["B-007", "Circular Building Basics", "L. Moreau", "D1", 2020, true],
];
for (const [BookID, Title, Author, Shelf, Year, OnLoan] of boeken)
  await wk.voegToe("Books", { BookID, Title, Author, Shelf, Year, OnLoan });

await wk.bewaarQuery({
  naam: "Books on loan",
  soort: "select",
  sql: "SELECT BookID, Title, Author, Shelf\nFROM Books\nWHERE OnLoan = True\nORDER BY Title;",
});
await wk.bewaarQuery({
  naam: "Books by year",
  soort: "select",
  sql: "SELECT Year, Title\nFROM Books\nORDER BY Year DESC;",
});
await wk.bewaarModule({
  naam: "LibraryTools",
  soort: "module",
  bron: `Option Compare Database
Option Explicit

' Shows how many books are currently on loan.
Public Sub LoanSummary()
    Dim onLoan As Long
    onLoan = DCount("*", "Books", "OnLoan = True")
    MsgBox onLoan & " of " & DCount("*", "Books") & " books are on loan.", vbInformation, "Library"
End Sub
`,
});

const bytes = await wk.exporteer();
writeFileSync(join(uit, "library.sqlite"), bytes);
console.log(join(uit, "library.sqlite"), bytes.length, "bytes");
