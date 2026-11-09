/** PPTX/PPSX/POTX delen hetzelfde pakket; alleen het hoofdinhoudstype verschilt. */
import i18next from "../i18n/config";
import { Pakket, REL } from "../grafieken/pakket";
import { attr, attrTekst, kinderen, leesXml, vervang } from "../grafieken/xml";

export const PRESENTATIETYPEN = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml",
} as const;
export const PPSX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow";

/** De aanroeper valideert de pakketgrenzen en scheidt eventuele VBA vooraf af. */
export function presentatieVariant(
  bytes: Uint8Array,
  ext: keyof typeof PRESENTATIETYPEN,
) {
  const pakket = new Pakket(bytes);
  const rel = pakket
    .relaties("")
    .find((r) => r.type === REL.officeDocument && !r.extern);
  const pad = rel && Pakket.doelPad("", rel.target);
  const xml = pakket.lees("[Content_Types].xml"),
    root = leesXml(xml);
  const hoofd = kinderen(root, "Override").find(
    (o) => attr(o, "PartName") === "/" + pad,
  );
  const type = attr(hoofd, "ContentType");
  if (
    !hoofd ||
    !pad ||
    !pakket.heeft(pad) ||
    !Object.values(PRESENTATIETYPEN).some(t => t === type)
  )
    throw new Error(i18next.t("import:errors.unsupportedFormat"));
  if (type === PRESENTATIETYPEN[ext]) return bytes;
  pakket.schrijf(
    "[Content_Types].xml",
    vervang(xml, [
      {
        start: hoofd.start,
        eind: hoofd.inhoudStart,
        tekst: `<${hoofd.naam}${attrTekst({ ...hoofd.attrs, ContentType: PRESENTATIETYPEN[ext] })}${hoofd.leeg ? "/>" : ">"}`,
      },
    ]),
  );
  return pakket.inpakken();
}
