/** Afzonderlijke lege werkmappen voor voorbeelden en het lezen van regionale invoer. */
import { openWorkbook } from "@betteroffice/xlsx";
import i18next from "../i18n/config";
import { Pakket } from "../grafieken/pakket";
import { kind, leesXml, vervang } from "../grafieken/xml";

let sjabloon: Promise<Uint8Array> | undefined;
export function laadProefsjabloon(): Promise<Uint8Array> {
  sjabloon ??= fetch(new URL("../../public/templates/nieuw.xlsx", import.meta.url)).then(async (r) => {
    if (!r.ok) throw new Error(i18next.t("spreadsheet:numberFormat.errors.previewLoad"));
    return new Uint8Array(await r.arrayBuffer());
  }).catch((fout) => { sjabloon = undefined; throw fout; });
  return sjabloon;
}

export function openProefwerkmap(bytes: Uint8Array, datumstelsel: "1900" | "1904") {
  const pakket = new Pakket(bytes);
  const xml = pakket.lees("xl/workbook.xml");
  const root = leesXml(xml);
  const pr = kind(root, "workbookPr");
  const prefix = root.voorvoegsel ? root.voorvoegsel + ":" : "";
  pakket.schrijf("xl/workbook.xml", vervang(xml, [{
    start: pr?.start ?? root.inhoudStart,
    eind: pr?.eind ?? root.inhoudStart,
    tekst: `<${prefix}workbookPr date1904="${datumstelsel === "1904" ? 1 : 0}"/>`,
  }]));
  return openWorkbook(pakket.inpakken());
}
