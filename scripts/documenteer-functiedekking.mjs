import fs from "node:fs";
import { FUNCTIES, CATEGORIEEN } from "../src/lint/rekenblad-functies.ts";
const bron = fs
  .readFileSync("src/rekenbladcontrole.ts", "utf8")
  .match(/export const ONDERSTEUNDE_FUNCTIES[\s\S]*?\n\);/)[0];
const ondersteund = [
  ...new Set(
    [...bron.matchAll(/"([^"]*)"/g)]
      .flatMap((m) => m[1].split(" "))
      .filter(Boolean),
  ),
].sort();
const kandidaten = fs
  .readFileSync("scripts/test-matrix-rekenbladen.mjs", "utf8")
  .match(/const KANDIDATEN = `([\s\S]*?)`/)[1]
  .split(/\s+/)
  .filter(Boolean);
const ontbreekt = kandidaten.filter((n) => !ondersteund.includes(n)).sort();
const categorie = new Map(FUNCTIES.map((f) => [f.naam, f.categorie]));
const regels = CATEGORIEEN.map(
  (c) =>
    `| ${c} | ${ondersteund
      .filter((n) => categorie.get(n) === c)
      .map((n) => "`" + n + "`")
      .join(", ")} |`,
);
const overige = ondersteund.filter((n) => !categorie.has(n));
if (overige.length)
  regels.push(
    `| Aliassen / overige | ${overige.map((n) => "`" + n + "`").join(", ")} |`,
  );
const tekst = `# Formules: notatie en functiedekking\n\nFormules gebruiken Engelse functienamen, komma’s tussen argumenten en een punt\nvoor decimalen: \`=SUM(1.5,2)\`. Dit geldt ook bij een Nederlandse interface.\nEen los ingevoerd getal volgt de bestandsregio: in een Nederlandse werkmap is\n\`1,5\` het getal 1,5. Formules worden altijd in standaard XLSX-notatie bewaard.\nFunctie invoegen toont deze keuze en de syntaxis per functie.\n\n\`src/rekenblad/formulenotatie.test.ts\` controleert de echte invoerroute met\n\`localized:true\`, Nederlandstalige en Engelstalige bestandsregio, berekening,\nwerkelijk opgeslagen XML en heropenen. De interface vertaalt functienamen niet\nnaar bijvoorbeeld SOM; een puntkomma is geen alternatief argumentscheidingsteken.\n\n## Herkende functies\n\nDe vastgezette lijst bevat **${ondersteund.length} herkende functies van ${kandidaten.length}\nkandidaten**. De bestaande matrix probeert iedere kandidaat daadwerkelijk in de\nrekenkern met meerdere argumentaantallen. Een resultaat anders dan \`#NAME?\`\nbewijst dat de naam bekend is; het bewijst geen volledige Excel-compatibiliteit\nvoor iedere invoer. De lijst is afkomstig uit \`ONDERSTEUNDE_FUNCTIES\` in\n\`src/rekenbladcontrole.ts\` en wordt door \`scripts/test-matrix-rekenbladen.mjs\`\ngecontroleerd.\n\n| Categorie | Herkende namen |\n| --- | --- |\n${regels.join("\n")}\n\n## Ontbrekende kandidaten\n\n${ontbreekt.map((n) => "`" + n + "`").join(", ")}.\n\nDeze **${ontbreekt.length}** namen komen uit de bestaande kandidatenlijst; de lijst omvat\nniet iedere mogelijke Excel-functie of invoegtoepassing. Een onbekende functie\nwordt bij openen gemeld. Een bewaarde bronuitkomst is geen opnieuw berekende\nuitkomst. Repareer of vervang zo’n formule voordat je op de uitkomst vertrouwt.\n\n## Berekening en fouten\n\nWijzigingen rekenen ook afhankelijke cellen op andere werkbladen opnieuw uit.\nDe geselecteerde foutcel krijgt een uitleg bij de formulebalk. De indicator\nonderscheidt een kringverwijzing en een rekenlimiet van de getoonde celwaarde.\nFoutcodes blijven canoniek in het bestand; de uitleg volgt de interfacetaal.\n\nZie de [onafhankelijke formulematrix](tests/2026-11-06-rekenbladmatrix.md) voor\nhet geteste synthetische corpus, matrix-/uitvloeiende formules en bronbehoud.\nDat historische rapport hoort bij de daar genoemde kernhash; het is geen\nnieuwe onafhankelijke beoordeling van de uitgebreide kern in deze werkstand.\nDe nieuwe kern krijgt afzonderlijke regressie- en opslagcontroles.\n\nOptioneel iteratief rekenen en een volledig praktijkcorpus zijn nog open\nacceptatiepunten van [#59](https://github.com/OpenAEC-Foundation/open-office-studio/issues/59).\n\nHerstel dit document na een wijziging van de functiecatalogus met\n\`node scripts/documenteer-functiedekking.mjs\`.\n`;
fs.writeFileSync("docs/rekenblad-functiedekking.md", tekst);
console.log(
  JSON.stringify({
    ondersteund: ondersteund.length,
    kandidaten: kandidaten.length,
    ontbreekt: ontbreekt.length,
  }),
);
