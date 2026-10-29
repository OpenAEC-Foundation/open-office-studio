/**
 * Stijl-editor: nieuwe stijl (uit de selectie) of een bestaande stijl
 * wijzigen, met de kern-eigenschappen. Alleen wat afwijkt van de basisstijl
 * (nieuw) of van de huidige waarde (wijzigen) komt in styles.xml.
 * De knoppen Lettertype… en Alinea… openen de volledige vensters van
 * pakket W1 (src/tekst/lettertype, src/tekst/alinea) voor de stijl.
 */
import { useMemo, useState } from "react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../../i18n/opmaak";
import { Dialoog } from "../../werkruimte/Dialoog";
import { AlineaVenster } from "../alinea/AlineaVenster";
import { LettertypeVenster } from "../lettertype/LettertypeVenster";
import { alsEigenschappen, losOp, opgelosteOpmaak, stijlNaam, uitOpmaak, voorbeeldStijl, type OpgelosteStijl } from "./model";
import { alineaBegin, lettertypeBegin, vanAlineaOpmaak, vanTekenOpmaak } from "./opmaakvensters";
import {
  nieuweStijl,
  wijzigStijl,
  type StijlEigenschappen,
  type StijlSoort,
  type Uitlijning,
} from "./stijlenxml";
import { useStijlen, type StijlVenster } from "./StijlenBeheer";

type Formulier = Required<
  Pick<
    StijlEigenschappen,
    | "lettertype"
    | "grootte"
    | "vet"
    | "cursief"
    | "onderstreept"
    | "kleur"
    | "uitlijning"
    | "ruimteVoor"
    | "ruimteNa"
    | "regelafstand"
    | "inspringLinks"
    | "eersteRegel"
  >
>;

const SLEUTELS: (keyof Formulier)[] = [
  "lettertype", "grootte", "vet", "cursief", "onderstreept", "kleur",
  "uitlijning", "ruimteVoor", "ruimteNa", "regelafstand", "inspringLinks", "eersteRegel",
];
const ALINEA: (keyof Formulier)[] = ["uitlijning", "ruimteVoor", "ruimteNa", "regelafstand", "inspringLinks", "eersteRegel"];

function formulier(e: StijlEigenschappen): Formulier {
  const basis = alsEigenschappen({ grootte: 11, vet: false, cursief: false, onderstreept: false, doorgehaald: false, hoofdletters: false, kleineHoofdletters: false });
  return { ...basis, ...Object.fromEntries(Object.entries(e).filter(([k, v]) => SLEUTELS.includes(k as keyof Formulier) && v !== undefined)) } as Formulier;
}

/** Velden die verschillen van de vergelijkingswaarden. */
export function verschil(nieuw: Formulier, oud: Formulier, soort: StijlSoort): StijlEigenschappen {
  const uit: StijlEigenschappen = {};
  for (const k of SLEUTELS) {
    if (soort === "character" && ALINEA.includes(k)) continue;
    const a = nieuw[k];
    const b = oud[k];
    const gelijk =
      typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.005 : (a ?? null) === (b ?? null) || (typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase());
    if (!gelijk) (uit as Record<string, unknown>)[k] = a === "" ? null : a;
  }
  return uit;
}

function Getal({
  label,
  waarde,
  eenheid,
  stap = 1,
  min = 0,
  max = 999,
  zet,
}: {
  label: string;
  waarde: number;
  eenheid: string;
  stap?: number;
  min?: number;
  max?: number;
  zet: (n: number) => void;
}) {
  return (
    <label className="werkruimte-veld">
      <span>{label}</span>
      <span className="werkruimte-eenheid">
        <input
          type="number"
          value={Number.isFinite(waarde) ? waarde : 0}
          step={stap}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) zet(Math.max(min, Math.min(max, n)));
          }}
        />
        {eenheid}
      </span>
    </label>
  );
}

export function StijlEditor({ venster }: { venster: Extract<StijlVenster, { soort: "nieuw" | "wijzig" }> }) {
  const { t } = useTranslation(["writer", "common"]);
  const { locale } = useOpmaak();
  const staat = useStijlen();
  const lettertypen = useDocxCommand("fontFamily").state.options ?? [];
  const alle = staat.stijlen?.styles ?? [];
  const bestaand = venster.soort === "wijzig" ? alle.find((s) => s.styleId === venster.styleId) : undefined;
  const uitSelectie = venster.soort === "nieuw" && !!venster.uitSelectie;
  const nieuwType = venster.soort === "nieuw" ? venster.type : undefined;
  const huidigeAlinea = staat.alineastijl ?? alle.find((s) => s.type === "paragraph" && s.default)?.styleId ?? "";

  const [soort, setSoort] = useState<StijlSoort>(
    bestaand ? (bestaand.type === "character" ? "character" : "paragraph") : nieuwType ?? "paragraph",
  );
  const [naam, setNaam] = useState(bestaand ? stijlNaam(bestaand) : "");
  const [basis, setBasis] = useState(bestaand ? bestaand.basedOn ?? "" : huidigeAlinea);
  const [volgende, setVolgende] = useState(bestaand ? bestaand.next ?? bestaand.styleId : "");
  const [galerij, setGalerij] = useState(bestaand ? !!bestaand.qFormat : true);
  const begin = useMemo(() => {
    if (bestaand) return formulier(alsEigenschappen(losOp(staat.stijlen, bestaand.styleId, staat.thema)));
    const basisStijl = formulier(alsEigenschappen(losOp(staat.stijlen, basis || null, staat.thema)));
    if (!uitSelectie) return basisStijl;
    const sel = staat.selectieOpmaak();
    // Alleen de directe opmaak van de selectie, over de basisstijl heen.
    return { ...basisStijl, ...uitOpmaak(sel.tekst, sel.alinea, "paragraph", staat.thema) } as Formulier;
    // Alleen bij het openen; latere keuzes passen het formulier niet meer aan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [f, setF] = useState<Formulier>(begin);
  /** Eigenschappen uit de W1-vensters die dit formulier zelf niet toont. */
  const [extra, setExtra] = useState<StijlEigenschappen>({});
  const [opmaakVenster, setOpmaakVenster] = useState<"lettertype" | "alinea" | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const zet = <K extends keyof Formulier>(k: K, v: Formulier[K]) => setF((oud) => ({ ...oud, [k]: v }));

  // De naam van de stijl zelf telt niet als dubbel.
  const namen = new Set(alle.filter((s) => s !== bestaand).map((s) => stijlNaam(s).toLowerCase()));
  const naamFout = !naam.trim()
    ? t("styles.errors.nameRequired")
    : namen.has(naam.trim().toLowerCase())
      ? t("styles.editor.nameTaken")
      : "";
  const keuzes = alle
    .filter((s) => s.type === soort && s !== bestaand && !s.hidden)
    .sort((a, b) => stijlNaam(a).localeCompare(stijlNaam(b), locale));
  const alineastijlen = alle.filter((s) => s.type === "paragraph" && !s.hidden).sort((a, b) => stijlNaam(a).localeCompare(stijlNaam(b), locale));

  async function opslaan() {
    setFout("");
    if (naamFout) return setFout(naamFout);
    setBezig(true);
    try {
      if (bestaand) {
        const eigenschappen = { ...verschil(f, begin, soort), ...extraVoor(soort) };
        const naamWijziging = naam.trim() !== stijlNaam(bestaand) ? naam.trim() : undefined;
        await staat.herlaadStijlen((o) => ({
          stijlen: wijzigStijl(o.stijlen, bestaand.styleId, {
            naam: naamWijziging,
            gebaseerdOp: (bestaand.basedOn ?? "") !== basis ? basis || null : undefined,
            volgende: soort === "paragraph" && (bestaand.next ?? bestaand.styleId) !== volgende ? volgende || null : undefined,
            snelleStijl: galerij !== !!bestaand.qFormat ? galerij : undefined,
            eigenschappen,
          }),
        }));
      } else {
        const vergelijk = formulier(alsEigenschappen(losOp(staat.stijlen, basis || null, staat.thema)));
        const eigenschappen = { ...verschil(f, vergelijk, soort), ...extraVoor(soort) };
        await staat.herlaadStijlen((o) => {
          const { xml, styleId } = nieuweStijl(o.stijlen, {
            naam,
            soort,
            gebaseerdOp: basis || null,
            volgende: soort === "paragraph" ? volgende || null : null,
            snelleStijl: galerij,
            eigenschappen,
          });
          // Zoals gebruikelijk krijgt de alinea van de selectie de nieuwe stijl.
          return { stijlen: xml, alineastijl: uitSelectie && soort === "paragraph" ? styleId : undefined };
        });
      }
      staat.sluit();
    } catch (error) {
      setBezig(false);
      setFout(error instanceof Error ? error.message : String(error));
    }
  }

  /** Extra eigenschappen, zonder alinea-eigenschappen bij een tekenstijl. */
  function extraVoor(s: StijlSoort): StijlEigenschappen {
    if (s === "paragraph") return extra;
    const { uitlijning, ruimteVoor, ruimteNa, regelafstand, regelafstandPt, inspringLinks, inspringRechts, eersteRegel, bijVolgende, regelsBijElkaar, paginaEindeVoor, zwevendeRegels, contextueel, ...teken } = extra;
    void [uitlijning, ruimteVoor, ruimteNa, regelafstand, regelafstandPt, inspringLinks, inspringRechts, eersteRegel, bijVolgende, regelsBijElkaar, paginaEindeVoor, zwevendeRegels, contextueel];
    return teken;
  }

  /** Een wijziging uit een W1-venster: velden van dit formulier daar, de rest in `extra`. */
  function neemOver(e: StijlEigenschappen) {
    const formulierDeel: Partial<Formulier> = {};
    const rest: StijlEigenschappen = {};
    for (const [k, v] of Object.entries(e) as [keyof StijlEigenschappen, unknown][]) {
      if (k === "onderstreping") {
        formulierDeel.onderstreept = v !== null && v !== "none";
        // Een bijzondere stijl (dubbel, golf …) gaat als extra mee.
        if (v !== "single") (rest as Record<string, unknown>)[k] = v;
      } else if (k === "regelafstand" && v === null) formulierDeel.regelafstand = 1;
      else if ((SLEUTELS as string[]).includes(k)) (formulierDeel as Record<string, unknown>)[k] = v ?? (k === "kleur" || k === "lettertype" ? null : 0);
      else (rest as Record<string, unknown>)[k] = v;
    }
    if ("regelafstand" in e) delete rest.regelafstandPt;
    setF((oud) => ({ ...oud, ...formulierDeel }));
    setExtra((oud) => {
      const n = { ...oud, ...rest };
      if ("regelafstand" in e && !e.regelafstandPt) delete n.regelafstandPt;
      return n;
    });
  }

  // Beginwaarden voor de W1-vensters: de opgeloste basis plus wat hier al gekozen is.
  const opgelost = opgelosteOpmaak(staat.stijlen, bestaand?.styleId ?? (basis || null));
  const huidig: StijlEigenschappen = { ...f, ...extra };

  const voorbeeld: OpgelosteStijl = {
    lettertype: f.lettertype ?? undefined,
    grootte: f.grootte ?? 11,
    vet: !!f.vet,
    cursief: !!f.cursief,
    onderstreept: !!f.onderstreept,
    doorgehaald: false,
    hoofdletters: false,
    kleineHoofdletters: false,
    kleur: f.kleur ?? undefined,
  };

  return (
    <>
    <Dialoog
      titel={bestaand ? t("styles.editor.modifyTitle", { name: stijlNaam(bestaand) }) : t("styles.editor.newTitle")}
      sluit={staat.sluit}
      className="tekst-stijleditor"
      acties={
        <>
          {fout && <span className="werkruimte-melding werkruimte-fout" role="alert">{fout}</span>}
          <button type="button" className="werkruimte-knop" onClick={staat.sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={bezig || !!naamFout} onClick={() => void opslaan()}>
            {bestaand ? t("styles.editor.modify") : t("styles.editor.create")}
          </button>
        </>
      }
    >
      <fieldset className="werkruimte-groep">
        <legend>{t("styles.editor.properties")}</legend>
        <label className="werkruimte-veld">
          <span>{t("styles.editor.name")}</span>
          <input type="text" value={naam} data-autofocus maxLength={253} onChange={(e) => setNaam(e.target.value)} aria-invalid={!!naamFout} />
        </label>
        <label className="werkruimte-veld">
          <span>{t("styles.editor.type")}</span>
          <select value={soort} disabled={!!bestaand} onChange={(e) => setSoort(e.target.value as StijlSoort)}>
            <option value="paragraph">{t("styles.editor.typeParagraph")}</option>
            <option value="character">{t("styles.editor.typeCharacter")}</option>
          </select>
        </label>
        <label className="werkruimte-veld">
          <span>{t("styles.editor.basedOn")}</span>
          <select value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="">{t("styles.editor.noStyle")}</option>
            {keuzes.map((s) => (
              <option key={s.styleId} value={s.styleId}>{stijlNaam(s)}</option>
            ))}
          </select>
        </label>
        {soort === "paragraph" && (
          <label className="werkruimte-veld">
            <span>{t("styles.editor.nextParagraph")}</span>
            <select value={volgende} onChange={(e) => setVolgende(e.target.value)}>
              <option value="">{bestaand ? stijlNaam(bestaand) : naam.trim() || t("styles.editor.thisStyle")}</option>
              {alineastijlen
                .filter((s) => s !== bestaand)
                .map((s) => (
                  <option key={s.styleId} value={s.styleId}>{stijlNaam(s)}</option>
                ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset className="werkruimte-groep">
        <legend>{t("styles.editor.formatting")}</legend>
        <label className="werkruimte-veld">
          <span>{t("styles.editor.font")}</span>
          <input type="text" list="tekst-stijl-lettertypen" value={f.lettertype ?? ""} onChange={(e) => zet("lettertype", e.target.value)} />
        </label>
        <datalist id="tekst-stijl-lettertypen">
          {lettertypen.map((o) => (
            <option key={o.label} value={o.label} />
          ))}
        </datalist>
        <Getal label={t("styles.editor.size")} waarde={f.grootte ?? 11} eenheid="pt" stap={0.5} min={1} max={1638} zet={(n) => zet("grootte", n)} />
        <div className="werkruimte-keuzes" role="group" aria-label={t("styles.editor.emphasis")}>
          <label><input type="checkbox" checked={!!f.vet} onChange={(e) => zet("vet", e.target.checked)} /> {t("styles.editor.bold")}</label>
          <label><input type="checkbox" checked={!!f.cursief} onChange={(e) => zet("cursief", e.target.checked)} /> {t("styles.editor.italic")}</label>
          <label><input type="checkbox" checked={!!f.onderstreept} onChange={(e) => zet("onderstreept", e.target.checked)} /> {t("styles.editor.underline")}</label>
          <label>
            {t("styles.editor.color")}{" "}
            <input type="color" value={`#${f.kleur ?? "000000"}`} onChange={(e) => zet("kleur", e.target.value.slice(1).toUpperCase())} />
          </label>
          <button type="button" className="werkruimte-knop" disabled={!f.kleur} onClick={() => zet("kleur", null)}>{t("styles.editor.automatic")}</button>
        </div>
        {soort === "paragraph" && (
          <>
            <label className="werkruimte-veld">
              <span>{t("styles.editor.alignment")}</span>
              <select value={f.uitlijning ?? "left"} onChange={(e) => zet("uitlijning", e.target.value as Uitlijning)}>
                <option value="left">{t("paragraph.alignment.left")}</option>
                <option value="center">{t("paragraph.alignment.center")}</option>
                <option value="right">{t("paragraph.alignment.right")}</option>
                <option value="both">{t("paragraph.alignment.justify")}</option>
              </select>
            </label>
            <Getal label={t("styles.editor.spaceBefore")} waarde={f.ruimteVoor ?? 0} eenheid="pt" min={0} max={1584} zet={(n) => zet("ruimteVoor", n)} />
            <Getal label={t("styles.editor.spaceAfter")} waarde={f.ruimteNa ?? 0} eenheid="pt" min={0} max={1584} zet={(n) => zet("ruimteNa", n)} />
            <Getal label={t("styles.editor.lineSpacing")} waarde={f.regelafstand ?? 1} eenheid={t("styles.editor.timesSingle")} stap={0.05} min={0.5} max={5} zet={(n) => zet("regelafstand", n)} />
            <Getal label={t("styles.editor.indentLeft")} waarde={f.inspringLinks ?? 0} eenheid="cm" stap={0.25} min={-20} max={50} zet={(n) => zet("inspringLinks", n)} />
            <Getal label={t("styles.editor.firstLine")} waarde={f.eersteRegel ?? 0} eenheid="cm" stap={0.25} min={-20} max={50} zet={(n) => zet("eersteRegel", n)} />
          </>
        )}
        <div className="werkruimte-rij">
          <button type="button" className="werkruimte-knop" onClick={() => setOpmaakVenster("lettertype")}>
            {t("styles.editor.fontDialog")}
          </button>
          {soort === "paragraph" && (
            <button type="button" className="werkruimte-knop" onClick={() => setOpmaakVenster("alinea")}>
              {t("styles.editor.paragraphDialog")}
            </button>
          )}
          {Object.keys(extraVoor(soort)).length > 0 && (
            <span className="werkruimte-melding">{t("styles.editor.extraProperties", { count: Object.keys(extraVoor(soort)).length })}</span>
          )}
        </div>
        <label className="werkruimte-vink">
          <input type="checkbox" checked={galerij} onChange={(e) => setGalerij(e.target.checked)} /> {t("styles.editor.showInGallery")}
        </label>
      </fieldset>

      <div className="tekst-stijlvoorbeeld" aria-label={t("styles.editor.preview")}>
        <p style={{ ...voorbeeldStijl(voorbeeld, 28), textAlign: f.uitlijning === "both" ? "justify" : (f.uitlijning ?? "left") as "left" }}>
          {t("styles.editor.sampleText", { name: naam.trim() || t("styles.editor.preview") })}
        </p>
      </div>
      <p className="werkruimte-uitleg">{t("styles.reloadNotice")}</p>
    </Dialoog>
    {opmaakVenster === "lettertype" && (
      <LettertypeVenster
        begin={lettertypeBegin(opgelost.r, huidig, losOp(staat.stijlen, bestaand?.styleId ?? (basis || null), staat.thema).lettertype)}
        voorbeeldTekst={naam.trim() || t("styles.editor.preview")}
        sluit={() => setOpmaakVenster(null)}
        toepassen={(w) => {
          setOpmaakVenster(null);
          neemOver(vanTekenOpmaak(w));
        }}
      />
    )}
    {opmaakVenster === "alinea" && (
      <AlineaVenster
        begin={alineaBegin(opgelost.p, huidig)}
        meerdere={false}
        sluit={() => setOpmaakVenster(null)}
        toepassen={(w) => {
          setOpmaakVenster(null);
          neemOver(vanAlineaOpmaak(w));
        }}
      />
    )}
    </>
  );
}
