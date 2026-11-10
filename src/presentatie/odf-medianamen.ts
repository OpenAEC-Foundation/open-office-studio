/** Herstel uitsluitend lege namen van eenduidig teruggevonden ODF-media. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrNs,
  kind,
  leesXml,
  namespaceVan,
  vervang,
  zoekAlle,
  type XmlElement,
  type Vervanging,
} from "../grafieken/xml";
import { diaPaden } from "./overgangen";
import {
  leesOdfConversie,
  odfAttribuutWijziging,
  ODF_NS,
} from "./odf-overgangen";
import {
  gelijkeMediaGeometrie,
  leesOdfMediaKoppelingen,
  leesPptxMediaKoppelingen,
  uniekeMediaKoppelingen,
} from "./odf-mediavolume";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
function mediaEigenschappen(root: XmlElement) {
  return zoekAlle(root, "pic")
    .filter((pic) => namespaceVan(pic, pic.voorvoegsel) === P)
    .flatMap((pic) => {
      const nv = kind(pic, "nvPicPr"),
        pr = kind(nv, "cNvPr"),
        props = kind(nv, "nvPr");
      if (!pr || !props) return [];
      const media =
        zoekAlle(props, "media").some(
          (n) => namespaceVan(n, n.voorvoegsel) === P14,
        ) ||
        ["audioFile", "videoFile"].some((name) =>
          zoekAlle(props, name).some(
            (n) => namespaceVan(n, n.voorvoegsel) === A,
          ),
        );
      return media ? [pr] : [];
    });
}
export async function herstelOdfMedianamen(
  bron: Uint8Array,
  van: string,
  naar: string,
  result: Uint8Array,
): Promise<Uint8Array> {
  if (!["odp", "otp"].includes(van) || naar !== "pptx") return result;
  const doc = leesOdfConversie(bron, false);
  if (!doc) return result;
  const pakket = new Pakket(result),
    paths = diaPaden(pakket);
  if (paths.length !== doc.pages.length) return result;
  const slides = paths.map((path) => {
    const xml = pakket.lees(path);
    return { path, xml, props: mediaEigenschappen(leesXml(xml)) };
  });
  if (!slides.some((s) => s.props.some((p) => !attr(p, "name")?.trim())))
    return result;
  const source = await leesOdfMediaKoppelingen(doc),
    media = await leesPptxMediaKoppelingen(result);
  let changed = false;
  for (let page = 0; page < slides.length; page++) {
    const slide = slides[page],
      edits: Vervanging[] = [];
    for (const m of media.filter((m) => m.page === page)) {
      if (uniekeMediaKoppelingen(m, media).length !== 1) continue;
      const targets = slide.props.filter((p) => Number(attr(p, "id")) === m.id);
      if (targets.length !== 1 || attr(targets[0], "name")?.trim()) continue;
      const matches = source.filter(
        (f) =>
          f.page === page &&
          f.hash === m.hash &&
          gelijkeMediaGeometrie(f.geo, m.geo),
      );
      if (matches.length !== 1) continue;
      const name = attrNs(matches[0].plugin.ouder, ODF_NS.draw, "name");
      if (!name?.trim()) continue;
      const edit = odfAttribuutWijziging(targets[0], { name });
      if (edit) edits.push(edit);
    }
    if (edits.length) {
      pakket.schrijf(slide.path, vervang(slide.xml, edits));
      changed = true;
    }
  }
  return changed ? pakket.inpakken() : result;
}
