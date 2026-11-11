/** Kopieer uitsluitend bereikbare OPC-onderdelen; behoud externe relaties zonder ze te openen. */
import { Pakket, TYPE } from "../grafieken/pakket";
import { attr, attrTekst, kinderen, leesXml, vervang } from "../grafieken/xml";

export interface KopieOpties {
  maxOnderdelen: number;
  maxBytes: number;
  naam?: (bron: string, type: string) => string;
  fout?: () => Error;
}
export function maakOnderdeelKopie(
  bron: Pakket,
  doel: Pakket,
  opties: KopieOpties,
) {
  const map = new Map<string, string>(),
    types = leesXml(bron.lees("[Content_Types].xml"));
  const fout = opties.fout ?? (() => new Error("Invalid package dependency"));
  const inhoudstype = (pad: string) =>
    attr(
      kinderen(types, "Override").find(
        (e) => attr(e, "PartName") === "/" + pad,
      ),
      "ContentType",
    ) ??
    attr(
      kinderen(types, "Default").find(
        (e) =>
          attr(e, "Extension")?.toLowerCase() ===
          pad.split(".").pop()?.toLowerCase(),
      ),
      "ContentType",
    );
  let bytes = 0;
  function kopieer(oud: string, vasteNaam?: string): string {
    const al = map.get(oud);
    if (al) return al;
    const data = bron.bytes(oud),
      ct = inhoudstype(oud);
    if (!data || !ct || map.size >= opties.maxOnderdelen) throw fout();
    bytes += data.length;
    if (bytes > opties.maxBytes) throw fout();
    const ext = /\.([A-Za-z0-9]{1,10})$/.exec(oud)?.[1] ?? "bin";
    const naar =
      vasteNaam ??
      opties.naam?.(oud, ct) ??
      doel.vrijPad(`ppt/import/part#.${ext}`);
    map.set(oud, naar);
    doel.schrijf(naar, data);
    doel.voegOverrideToe(naar, ct);
    const rp = Pakket.relsPad(oud);
    if (bron.heeft(rp)) {
      const xml = bron.lees(rp),
        root = leesXml(xml),
        edits = [];
      for (const rel of kinderen(root, "Relationship")) {
        if (attr(rel, "TargetMode") === "External") continue;
        const target = attr(rel, "Target");
        if (!target) throw fout();
        const bestemming = kopieer(Pakket.doelPad(oud, target));
        edits.push({
          start: rel.start,
          eind: rel.inhoudStart,
          tekst: `<${rel.naam}${attrTekst({ ...rel.attrs, Target: Pakket.relatief(naar, bestemming) })}${rel.leeg ? "/>" : ">"}`,
        });
      }
      doel.schrijf(Pakket.relsPad(naar), vervang(xml, edits));
      doel.voegDefaultToe("rels", TYPE.rels);
    }
    return naar;
  }
  return { map, kopieer, inhoudstype };
}
