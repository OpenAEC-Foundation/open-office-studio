/** Controleer de echte native luisteraar uit de vastgezette enginepatch. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function aansluiten(veld: EventTarget | null, handler: (e: { nativeEvent: Event; currentTarget: EventTarget; preventDefault: () => void }) => void) {
  const bron = readFileSync(new URL("../../node_modules/@betteroffice/docx-react/dist/index.mjs", import.meta.url), "utf8");
  const begin = '()=>{let _openaecVeld=j.current;';
  const b = bron.indexOf(begin), e = bron.indexOf('},[Rt,!!t])', b);
  if (b < 0 || e < 0) throw new Error("Controleer de native invoeradapter bij een engine-update.");
  const effect = new Function("j", "Rt", `return ${bron.slice(b, e + 1)}`)({ current: veld }, handler);
  return effect() as (() => void) | undefined;
}

const toets = (inputType = "insertText", data = "é") => Object.assign(new Event("beforeinput", { bubbles: true, cancelable: true }), { inputType, data });

describe("native beforeinput naast de React-terugvalroute", () => {
  it("verwerkt een gewone invoer één keer vóór de native textarea wijzigt", () => {
    const veld = new EventTarget(), tekst: string[] = [];
    const weg = aansluiten(veld, e => {
      expect(e.currentTarget).toBe(veld);
      tekst.push((e.nativeEvent as InputEvent).data!);
      e.preventDefault();
    });
    try {
      const e = toets();veld.dispatchEvent(e);
      expect(tekst).toEqual(["é"]);
      expect(e.defaultPrevented).toBe(true);
      // React mag dezelfde afgehandelde native gebeurtenis niet nogmaals verwerken.
      expect(e.cancelBubble).toBe(true);
    } finally { weg?.(); }
  });

  it("laat compositie en niet-afgehandelde invoer door naar de bestaande route", () => {
    const veld = new EventTarget();
    const weg = aansluiten(veld, () => {});
    try {
      const e = toets("insertCompositionText", "漢");veld.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
      expect(e.cancelBubble).toBe(false);
    } finally { weg?.(); }
  });

  it("herhaalt eerder geannuleerde invoer niet en ruimt op bij sluiten of wisselen", () => {
    const veld = new EventTarget();let aantal = 0;
    const weg = aansluiten(veld, () => { aantal++; });
    const e = toets();e.preventDefault();veld.dispatchEvent(e);
    expect(aantal).toBe(0);
    weg?.();veld.dispatchEvent(toets());
    expect(aantal).toBe(0);
    expect(aansluiten(null, () => { throw new Error("geen invoerveld"); })).toBeUndefined();
  });
});
