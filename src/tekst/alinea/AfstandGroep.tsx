import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Groep } from "../../Ribbon";
import { useEditorApi } from "../../lint/editorApi";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { cmNaarTwips, getalTekst, leesGetal, ptNaarTwips, rond, twipsNaarCm, twipsNaarPt } from "../eenheden";
import { useTekstOpmaak, AlineaKnop } from "../TekstOpmaak";

type Waarden = { links: number; rechts: number; voor: number; na: number };
const getal = (w: unknown) => (typeof w === "number" && Number.isFinite(w) ? w : 0);

/** Alinea-eigenschappen bij de cursor, bijgewerkt bij elke selectie- of inhoudswijziging. */
function useHuidigeAlinea(): Waarden | null {
  const api = useEditorApi().tekst;
  const [waarden, setWaarden] = useState<Waarden | null>(null);
  useEffect(() => {
    let opruimen: (() => void)[] = [];
    let frame = 0;
    let gekoppeld: object | null = null;
    const lees = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sessie = api()?.getEditorRef()?.getYrsSession();
        const sel = sessie?.selection();
        if (!sessie || !sel) return;
        try {
          const p = sessie.selectionContext({ story: sel.anchor.story, start: sel.anchor, end: sel.anchor })
            .paragraphProperties as Record<string, unknown>;
          const nieuw = {
            links: rond(twipsNaarCm(getal(p.indentLeft))),
            rechts: rond(twipsNaarCm(getal(p.indentRight))),
            voor: rond(twipsNaarPt(getal(p.spaceBefore)), 1),
            na: rond(twipsNaarPt(getal(p.spaceAfter)), 1),
          };
          setWaarden((oud) => (JSON.stringify(oud) === JSON.stringify(nieuw) ? oud : nieuw));
        } catch {
          // Bijvoorbeeld tijdens het laden; de volgende wijziging leest opnieuw.
        }
      });
    };
    const koppel = setInterval(() => {
      const ref = api();
      if (!ref || ref === gekoppeld) return;
      opruimen.forEach((weg) => weg());
      gekoppeld = ref;
      opruimen = [ref.onSelectionChange(lees), ref.onContentChange(lees)];
      lees();
    }, 500);
    return () => {
      clearInterval(koppel);
      cancelAnimationFrame(frame);
      opruimen.forEach((weg) => weg());
    };
  }, [api]);
  return waarden;
}

function Veld({
  label,
  waarde,
  eenheid,
  stap,
  uit,
  zet,
}: {
  label: string;
  waarde: number | undefined;
  eenheid: string;
  stap: number;
  uit: boolean;
  zet: (waarde: number) => void;
}) {
  const { t } = useTranslation("writer");
  const id = useId();
  const [tekst, setTekst] = useState("");
  const [bewerken, setBewerken] = useState(false);
  // Tekst bij het binnenkomen, en of Enter/Esc het veld al heeft afgehandeld.
  const begin = useRef("");
  const afgehandeld = useRef(false);
  const getoond = bewerken ? tekst : waarde === undefined ? "" : `${getalTekst(waarde, 2)} ${eenheid}`;
  const bevestig = (invoer: string) => {
    const n = leesGetal(invoer);
    if (n !== null && n >= (eenheid === "pt" ? 0 : -20)) zet(n);
  };
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-label={`${label} (${eenheid})`}
        value={getoond}
        disabled={uit}
        inputMode="decimal"
        title={t("paragraph.ribbon.fieldHint", { label, unit: eenheid, step: `${getalTekst(stap)} ${eenheid}` })}
        onFocus={(e) => {
          const begintekst = waarde === undefined ? "" : getalTekst(waarde, 2);
          begin.current = begintekst;
          afgehandeld.current = false;
          setBewerken(true);
          setTekst(begintekst);
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => {
          // Zoals Word: Tab of wegklikken neemt een gewijzigde waarde over.
          if (!afgehandeld.current && tekst.trim() !== begin.current) bevestig(tekst);
          setBewerken(false);
        }}
        onChange={(e) => setTekst(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            afgehandeld.current = true;
            bevestig(tekst);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            afgehandeld.current = true;
            setBewerken(false);
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = Math.max(eenheid === "pt" ? 0 : -20, rond((leesGetal(tekst) ?? waarde ?? 0) + (e.key === "ArrowUp" ? stap : -stap)));
            const nieuw = getalTekst(n, 2);
            // Al toegepast: bij het verlaten niet nog eens.
            begin.current = nieuw;
            setTekst(nieuw);
            zet(n);
          }
        }}
      />
    </>
  );
}

/** Lintgroepen "Inspringen" en "Afstand" zoals op het tabblad Indeling van Word. */
export function AfstandGroep() {
  const { t } = useTranslation("writer");
  const opmaak = useTekstOpmaak();
  const w = useHuidigeAlinea();
  const uit = !opmaak.bewerkbaar;
  return (
    <>
      <Groep naam={t("paragraph.ribbon.indent")}>
        <div className="tekst-afstand">
          <Veld label={t("paragraph.left")} eenheid="cm" stap={0.25} waarde={w?.links} uit={uit} zet={(n) => opmaak.alinea({ indentLeft: n ? cmNaarTwips(n) : null })} />
          <Veld label={t("paragraph.right")} eenheid="cm" stap={0.25} waarde={w?.rechts} uit={uit} zet={(n) => opmaak.alinea({ indentRight: n ? cmNaarTwips(n) : null })} />
        </div>
      </Groep>
      <Groep naam={t("paragraph.spacing")}>
        <div className="tekst-afstand">
          <Veld label={t("paragraph.before")} eenheid="pt" stap={6} waarde={w?.voor} uit={uit} zet={(n) => opmaak.alinea({ spaceBefore: ptNaarTwips(n) })} />
          <Veld label={t("paragraph.after")} eenheid="pt" stap={6} waarde={w?.na} uit={uit} zet={(n) => opmaak.alinea({ spaceAfter: ptNaarTwips(n) })} />
        </div>
        <div className="ribbon-stapel">
          <EigenKnop
            naam={w && w.voor > 0 ? t("paragraph.ribbon.removeSpaceBefore") : t("paragraph.ribbon.addSpaceBefore", { size: "12 pt" })}
            icoon={ArrowUpToLine}
            disabled={uit}
            onClick={() => opmaak.alinea({ spaceBefore: w && w.voor > 0 ? 0 : ptNaarTwips(12) })}
          />
          <EigenKnop
            naam={w && w.na > 0 ? t("paragraph.ribbon.removeSpaceAfter") : t("paragraph.ribbon.addSpaceAfter", { size: "12 pt" })}
            icoon={ArrowDownToLine}
            disabled={uit}
            onClick={() => opmaak.alinea({ spaceAfter: w && w.na > 0 ? 0 : ptNaarTwips(12) })}
          />
        </div>
        <AlineaKnop groot />
      </Groep>
    </>
  );
}
