/** De eenvoudige, onafhankelijke mediatak die deze app verliesvrij kan bewerken. */
import {
  attr,
  elementen,
  kind,
  kinderen,
  namespaceVan,
  type XmlElement,
} from "../grafieken/xml";
export const PRESENTATION_NS =
  "http://schemas.openxmlformats.org/presentationml/2006/main";
export function isEenvoudigeMedia(el: XmlElement) {
  if (
    !["audio", "video"].includes(el.lokaal) ||
    el.ouder?.lokaal !== "childTnLst" ||
    attr(el.ouder.ouder, "nodeType") !== "tmRoot"
  )
    return false;
  const toegestaan: Record<string, string[]> = {
    audio: [],
    video: [],
    cMediaNode: ["vol", "mute", "showWhenStopped"],
    cTn: ["id", "dur", "repeatCount"],
    stCondLst: [],
    cond: ["delay", "evt"],
    tgtEl: [],
    spTgt: ["spid"],
  };
  function goed(n: XmlElement): boolean {
    return (
      namespaceVan(n, n.voorvoegsel) === PRESENTATION_NS &&
      n.lokaal in toegestaan &&
      Object.keys(n.attrs).every(
        (k) => k.startsWith("xmlns") || toegestaan[n.lokaal].includes(k),
      ) &&
      elementen(n).every(goed)
    );
  }
  const m = kind(el, "cMediaNode"),
    tijd = kind(m, "cTn"),
    conds = kinderen(kind(tijd, "stCondLst"), "cond");
  if (
    !goed(el) ||
    elementen(el).length !== 1 ||
    !m ||
    !tijd ||
    elementen(m).length !== 2 ||
    conds.length !== 1
  )
    return false;
  const c = conds[0],
    target = kind(kind(m, "tgtEl"), "spTgt");
  const volume = Number(attr(m, "vol") ?? 100000),
    timeId = Number(attr(tijd, "id"));
  if (
    !["1", "true"].includes(attr(m, "showWhenStopped") ?? "") ||
    !Number.isInteger(volume) ||
    volume < 0 ||
    volume > 100000 ||
    !Number.isInteger(timeId) ||
    timeId < 1 ||
    elementen(tijd).length !== 1 ||
    elementen(kind(tijd, "stCondLst")!).length !== 1 ||
    !target ||
    elementen(target).length ||
    elementen(kind(m, "tgtEl")!).length !== 1 ||
    ["mute", "showWhenStopped"].some(
      (k) => attr(m, k) && !["1", "0", "true", "false"].includes(attr(m, k)!),
    )
  )
    return false;
  return (
    attr(tijd, "dur") === "indefinite" &&
    (!attr(tijd, "repeatCount") ||
      attr(tijd, "repeatCount") === "indefinite") &&
    Number.isInteger(Number(attr(target, "spid"))) &&
    Number(attr(target, "spid")) > 0 &&
    attr(c, "delay") === "0" &&
    ((!attr(c, "evt") && !elementen(c).length) ||
      (attr(c, "evt") === "onClick" &&
        attr(kind(kind(c, "tgtEl"), "spTgt"), "spid") === attr(target, "spid")))
  );
}
export function mediaTakken(timing: XmlElement | null) {
  const list = kind(
    kind(kind(kind(timing, "tnLst"), "par"), "cTn"),
    "childTnLst",
  );
  return list ? elementen(list).filter(isEenvoudigeMedia) : [];
}
