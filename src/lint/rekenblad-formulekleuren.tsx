/** Gekleurde verwijzingen boven de oorspronkelijke formule-invoer. */
import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { verwijzingenIn } from "./rekenblad-functies";
import { VERWIJZINGSKLEUREN } from "./rekenblad-laag";

type Veld = HTMLInputElement | HTMLTextAreaElement;
interface Beeld {
  veld: Veld;
  tekst: string;
  venster: CSSProperties;
  inhoud: CSSProperties;
}

/**
 * Het echte veld blijft tekst, selectie, cursor en invoermethode beheren.
 * Alleen de getekende tekst krijgt kleur; deze kopie ontvangt geen bediening
 * en wordt niet aan hulptechnologie aangeboden.
 */
export function FormuleKleuren() {
  const [beeld, setBeeld] = useState<Beeld | null>(null);
  useEffect(() => {
    let frame = 0;
    let samenstellen = false;
    const werkBij = () => {
      frame = 0;
      const v = document.activeElement;
      if (
        samenstellen ||
        matchMedia("(forced-colors: active)").matches ||
        !(v instanceof HTMLInputElement || v instanceof HTMLTextAreaElement) ||
        !v.matches(
          '[data-testid="xlsx-formula-input"], .rekenblad-formule-uitgebreid',
        ) ||
        !v.closest(".office-formulebalk") ||
        !v.value.startsWith("=") ||
        !verwijzingenIn(v.value).length
      ) {
        setBeeld(null);
        return;
      }
      const r = v.getBoundingClientRect(),
        s = getComputedStyle(v);
      const meerregelig = v instanceof HTMLTextAreaElement;
      setBeeld({
        veld: v,
        tekst: v.value,
        venster: {
          left: r.left + v.clientLeft,
          top: r.top + v.clientTop,
          width: v.clientWidth,
          height: v.clientHeight,
        },
        inhoud: {
          boxSizing: "border-box",
          width: v.clientWidth,
          padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          fontStyle: s.fontStyle,
          fontVariant: s.fontVariant,
          fontStretch: s.fontStretch,
          letterSpacing: s.letterSpacing,
          wordSpacing: s.wordSpacing,
          fontFeatureSettings: s.fontFeatureSettings,
          fontKerning: s.fontKerning as CSSProperties["fontKerning"],
          lineHeight: meerregelig
            ? s.lineHeight
            : `${v.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)}px`,
          textAlign: s.textAlign as CSSProperties["textAlign"],
          textIndent: s.textIndent,
          direction: s.direction as CSSProperties["direction"],
          color: s.color,
          tabSize: s.tabSize,
          whiteSpace: meerregelig ? "pre-wrap" : "pre",
          overflowWrap: meerregelig ? "break-word" : "normal",
          transform: `translate(${-v.scrollLeft}px, ${-v.scrollTop}px)`,
        },
      });
    };
    const plan = () => {
      if (!frame) frame = requestAnimationFrame(werkBij);
    };
    const begin = () => {
      samenstellen = true;
      plan();
    };
    const eind = () => {
      samenstellen = false;
      plan();
    };
    const gebeurtenissen = [
      "focusin",
      "focusout",
      "input",
      "keyup",
      "click",
      "scroll",
      "select",
    ];
    gebeurtenissen.forEach((naam) =>
      document.addEventListener(naam, plan, true),
    );
    document.addEventListener("compositionstart", begin, true);
    document.addEventListener("compositionend", eind, true);
    window.addEventListener("resize", plan);
    const observer = new ResizeObserver(plan);
    const balk = document.querySelector(".office-formulebalk");
    if (balk) observer.observe(balk);
    plan();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      gebeurtenissen.forEach((naam) =>
        document.removeEventListener(naam, plan, true),
      );
      document.removeEventListener("compositionstart", begin, true);
      document.removeEventListener("compositionend", eind, true);
      window.removeEventListener("resize", plan);
    };
  }, []);
  useLayoutEffect(() => {
    const v = beeld?.veld;
    v?.classList.add("rekenblad-formule-met-kleur");
    return () => v?.classList.remove("rekenblad-formule-met-kleur");
  }, [beeld?.veld]);
  if (!beeld) return null;
  const refs = verwijzingenIn(beeld.tekst);
  let begin = 0;
  return createPortal(
    <div
      className="rekenblad-formulekleuren"
      aria-hidden="true"
      style={beeld.venster}
    >
      <div style={beeld.inhoud}>
        {refs.map((r, i) => {
          const ervoor = beeld.tekst.slice(begin, r.begin);
          begin = r.eind;
          return (
            <span key={i}>
              {ervoor}
              <span
                style={{
                  color: VERWIJZINGSKLEUREN[i % VERWIJZINGSKLEUREN.length],
                }}
              >
                {r.tekst}
              </span>
            </span>
          );
        })}
        {beeld.tekst.slice(begin)}
      </div>
    </div>,
    document.body,
  );
}
