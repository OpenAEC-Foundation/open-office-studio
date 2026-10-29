/**
 * Vensters van de paginafuncties, op de gedeelde werkruimtedialoog.
 */
import { useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Dialoog } from "../../../werkruimte/Dialoog";
import { intlLocale } from "../../../i18n/config";
import { formatGetal } from "../../../i18n/opmaak";
import { PAGINANUMMER_VORMEN, paginanummerTekst, type PaginanummerOpties, type PaginanummerVorm } from "../kopvoet.ts";
import { OPVULTEKENS, STANDAARD_INHOUD, type InhoudOpties } from "../inhoudsopgave.ts";
import { NOOTNOTATIES, type NootHerstart, type NootInstellingen, type NootNotatie, type NootPositie, type NootSoort } from "../noten.ts";
import { PAGINANOTATIES, cmNaarTwips, twipsNaarCm, type Kolommen, type Paginanotatie } from "../secties.ts";
import type { NootInfo } from "./engine.ts";

/** Decimaalteken voor invoervelden: alleen komma of punt, zodat `leesCm` het terugleest. */
const decimaalteken = () =>
  new Intl.NumberFormat(intlLocale()).formatToParts(1.5).find((d) => d.type === "decimal")?.value === "," ? "," : ".";
/** Centimeters in een invoerveld (zonder groepering, met het decimaalteken van de taal). */
const cmTekst = (twips: number) => String(twipsNaarCm(twips)).replace(".", decimaalteken());
/** Centimeters als weergave, bijvoorbeeld 2,54 (nl) of 2.54 (en). */
export const cmWeergave = (twips: number) => formatGetal(twipsNaarCm(twips), { maximumFractionDigits: 2 });
const leesCm = (tekst: string) => {
  const n = Number(tekst.replace(/[,٫]/, ".").replace(/\s*cm$/i, ""));
  return Number.isFinite(n) ? n : NaN;
};

function Knoppen({ bevestig, sluit, knop, uit }: { bevestig: () => void; sluit: () => void; knop?: string; uit?: boolean }) {
  const { t } = useTranslation(["writer", "common"]);
  return (
    <>
      <span className="werkruimte-melding">{t("page.reload.explanation")}</span>
      <button type="button" className="werkruimte-knop" onClick={sluit}>
        {t("common:cancel")}
      </button>
      <button type="button" className="werkruimte-knop is-primair" disabled={uit} onClick={bevestig}>
        {knop ?? t("common:ok")}
      </button>
    </>
  );
}

function Veld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="werkruimte-veld">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Keuzes<T extends string>({ label, waarde, opties, kies, naam }: { label: string; waarde: T; opties: { waarde: T; naam: string }[]; kies: (w: T) => void; naam: string }) {
  return (
    <div className="werkruimte-keuzes" role="radiogroup" aria-label={label}>
      <span className="werkruimte-label">{label}</span>
      {opties.map((o) => (
        <label key={o.waarde}>
          <input type="radio" name={naam} checked={waarde === o.waarde} onChange={() => kies(o.waarde)} />
          {o.naam}
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function BevestigHerladen({ titel, bevestig, sluit }: { titel: string; bevestig: (altijd: boolean) => void; sluit: () => void }) {
  const [altijd, setAltijd] = useState(false);
  const { t } = useTranslation(["writer", "common"]);
  return (
    <Dialoog
      titel={titel}
      sluit={sluit}
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" data-autofocus onClick={() => bevestig(altijd)}>
            {t("page.reload.continue")}
          </button>
        </>
      }
    >
      <p className="werkruimte-uitleg">{t("page.reload.confirmText", { explanation: t("page.reload.explanation") })}</p>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={altijd} onChange={(e) => setAltijd(e.target.checked)} />
        {t("page.reload.dontAskAgain")}
      </label>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

/** Voorbeeld van een paginanummer (pagina 2 van 3) in de gekozen vorm en notatie. */
export function voorbeeldPaginanummer(vorm: PaginanummerVorm, notatie: Paginanotatie = "decimal") {
  const n = { decimal: "2", lowerRoman: "ii", upperRoman: "II", lowerLetter: "b", upperLetter: "B" }[notatie];
  return paginanummerTekst(vorm, n);
}

const VOORBEELDPLEK = {
  boven: { links: "topLeft", midden: "topCenter", rechts: "topRight" },
  onder: { links: "bottomLeft", midden: "bottomCenter", rechts: "bottomRight" },
} as const;

export function PaginanummerDialoog({
  begin,
  secties,
  bevestig,
  sluit,
}: {
  begin: Partial<PaginanummerOpties>;
  secties: number;
  bevestig: (o: PaginanummerOpties) => void;
  sluit: () => void;
}) {
  const [o, setO] = useState<PaginanummerOpties>({
    positie: "onder",
    uitlijning: "midden",
    vorm: "getal",
    opEerstePagina: true,
    notatie: "decimal",
    beginBij: null,
    doel: "alle",
    ...begin,
  });
  const [start, setStart] = useState(o.beginBij == null ? "" : String(o.beginBij));
  const startOk = start.trim() === "" || (/^\d{1,4}$/.test(start.trim()) && Number(start) >= 0);
  const zet = (w: Partial<PaginanummerOpties>) => setO({ ...o, ...w });
  const { t } = useTranslation("writer");
  const plek = o.positie === "cursor" ? "cursor" : VOORBEELDPLEK[o.positie][o.uitlijning];
  return (
    <Dialoog
      titel={t("page.pageNumber.dialog.title")}
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop={t("page.pageNumber.dialog.insert")} uit={!startOk} sluit={sluit} bevestig={() => bevestig({ ...o, beginBij: start.trim() === "" ? null : Number(start) })} />}
    >
      <fieldset className="werkruimte-groep">
        <legend>{t("page.pageNumber.dialog.placement")}</legend>
        <Keuzes
          label={t("page.pageNumber.dialog.position")}
          naam="pn-positie"
          waarde={o.positie}
          kies={(positie) => zet({ positie })}
          opties={[
            { waarde: "boven", naam: t("page.pageNumber.dialog.positionTop") },
            { waarde: "onder", naam: t("page.pageNumber.dialog.positionBottom") },
            { waarde: "cursor", naam: t("page.pageNumber.dialog.positionCursor") },
          ]}
        />
        {o.positie !== "cursor" && (
          <Keuzes
            label={t("page.pageNumber.dialog.alignment")}
            naam="pn-uitlijning"
            waarde={o.uitlijning}
            kies={(uitlijning) => zet({ uitlijning })}
            opties={[
              { waarde: "links", naam: t("page.align.left") },
              { waarde: "midden", naam: t("page.align.center") },
              { waarde: "rechts", naam: t("page.align.right") },
            ]}
          />
        )}
        <Veld label={t("page.pageNumber.dialog.display")}>
          <select value={o.vorm} onChange={(e) => zet({ vorm: e.target.value as PaginanummerVorm })}>
            {PAGINANUMMER_VORMEN.map((v) => (
              <option key={v.waarde} value={v.waarde}>
                {t("page.pageNumber.dialog.formOption", { name: t(`page.pageNumber.forms.${v.sleutel}`), example: voorbeeldPaginanummer(v.waarde, o.notatie) })}
              </option>
            ))}
          </select>
        </Veld>
        {o.positie !== "cursor" && (
          <label className="werkruimte-vink">
            <input type="checkbox" checked={o.opEerstePagina} onChange={(e) => zet({ opEerstePagina: e.target.checked })} />
            {t("page.pageNumber.dialog.showOnFirstPage")}
          </label>
        )}
      </fieldset>
      <fieldset className="werkruimte-groep">
        <legend>{t("page.pageNumber.dialog.numbering")}</legend>
        <Veld label={t("page.pageNumber.dialog.format")}>
          <select value={o.notatie} onChange={(e) => zet({ notatie: e.target.value as Paginanotatie })}>
            {PAGINANOTATIES.map((n) => (
              <option key={n.waarde} value={n.waarde}>
                {n.naam}
              </option>
            ))}
          </select>
        </Veld>
        <Veld label={t("page.pageNumber.dialog.startAt")}>
          <span className="werkruimte-eenheid">
            <input type="text" inputMode="numeric" aria-invalid={!startOk} value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="werkruimte-uitleg">{t("page.pageNumber.dialog.startAtHint")}</span>
          </span>
        </Veld>
        {secties > 1 && o.positie !== "cursor" && (
          <Keuzes
            label={t("page.pageNumber.dialog.applyTo")}
            naam="pn-doel"
            waarde={o.doel === "alle" ? "alle" : "sectie"}
            kies={(w) => zet({ doel: w === "alle" ? "alle" : -1 })}
            opties={[
              { waarde: "alle", naam: t("page.pageNumber.dialog.wholeDocument") },
              { waarde: "sectie", naam: t("page.pageNumber.dialog.thisSection") },
            ]}
          />
        )}
      </fieldset>
      <p className="pagina-voorbeeld" aria-live="polite">
        <Trans
          t={t}
          i18nKey={`page.pageNumber.dialog.preview.${plek}`}
          values={{ example: voorbeeldPaginanummer(o.vorm, o.notatie) }}
          components={{ b: <strong /> }}
        />
      </p>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function KolommenDialoog({
  begin,
  breedte,
  secties,
  bevestig,
  sluit,
}: {
  begin: Kolommen;
  breedte: number;
  secties: number;
  bevestig: (k: Kolommen, doel: "alle" | "sectie") => void;
  sluit: () => void;
}) {
  const [aantal, setAantal] = useState(String(begin.aantal));
  const [ruimte, setRuimte] = useState(cmTekst(begin.tussenruimte));
  const [lijn, setLijn] = useState(begin.lijn);
  const [doel, setDoel] = useState<"alle" | "sectie">("sectie");
  const n = Number(aantal);
  const r = leesCm(ruimte);
  const ok = Number.isInteger(n) && n >= 1 && n <= 12 && r >= 0 && r <= 10 && cmNaarTwips(r) * (n - 1) < breedte - 720 * n;
  const kolom = ok ? (breedte - cmNaarTwips(r) * (n - 1)) / n : 0;
  const { t } = useTranslation("writer");
  return (
    <Dialoog
      titel={t("page.layout.columnsDialog.title")}
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen uit={!ok} sluit={sluit} bevestig={() => bevestig({ aantal: n, tussenruimte: cmNaarTwips(r), lijn: lijn && n > 1 }, doel)} />}
    >
      <Veld label={t("page.layout.columnsDialog.count")}>
        <input type="text" inputMode="numeric" value={aantal} aria-invalid={!ok} onChange={(e) => setAantal(e.target.value)} data-autofocus />
      </Veld>
      <Veld label={t("page.layout.columnsDialog.spacing")}>
        <span className="werkruimte-eenheid">
          <input type="text" inputMode="decimal" value={ruimte} onChange={(e) => setRuimte(e.target.value)} />
          cm
        </span>
      </Veld>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={lijn} disabled={n <= 1} onChange={(e) => setLijn(e.target.checked)} />
        {t("page.layout.columnsDialog.line")}
      </label>
      {secties > 1 && (
        <Keuzes
          label={t("page.pageNumber.dialog.applyTo")}
          naam="kol-doel"
          waarde={doel}
          kies={setDoel}
          opties={[
            { waarde: "sectie", naam: t("page.pageNumber.dialog.thisSection") },
            { waarde: "alle", naam: t("page.pageNumber.dialog.wholeDocument") },
          ]}
        />
      )}
      <div className="pagina-kolomvoorbeeld" aria-hidden="true">
        {ok && Array.from({ length: n }, (_, i) => <span key={i} style={{ flexBasis: `${(kolom / breedte) * 100}%` }} data-lijn={lijn && i > 0 ? "" : undefined} />)}
      </div>
      <p className="werkruimte-uitleg">{ok ? t("page.layout.columnsDialog.columnWidth", { width: cmWeergave(kolom) }) : t("page.layout.columnsDialog.invalid")}</p>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function AfstandDialoog({ koptekst, voettekst, bevestig, sluit }: { koptekst: number; voettekst: number; bevestig: (a: { koptekst: number; voettekst: number }) => void; sluit: () => void }) {
  const [kop, setKop] = useState(cmTekst(koptekst));
  const [voet, setVoet] = useState(cmTekst(voettekst));
  const k = leesCm(kop);
  const v = leesCm(voet);
  const ok = k >= 0 && k <= 10 && v >= 0 && v <= 10;
  const { t } = useTranslation("writer");
  return (
    <Dialoog
      titel={t("page.headerFooter.distanceDialog.title")}
      sluit={sluit}
      className="pagina-dialoog"
      acties={
        <Knoppen
          uit={!ok}
          sluit={sluit}
          // Ongewijzigde velden houden hun twips: 708 → "1,25" → 709 zou de waarde ongemerkt verschuiven.
          bevestig={() =>
            bevestig({ koptekst: kop === cmTekst(koptekst) ? koptekst : cmNaarTwips(k), voettekst: voet === cmTekst(voettekst) ? voettekst : cmNaarTwips(v) })
          }
        />
      }
    >
      <Veld label={t("page.headerFooter.distanceDialog.headerFromTop")}>
        <span className="werkruimte-eenheid">
          <input type="text" inputMode="decimal" value={kop} aria-invalid={!(k >= 0 && k <= 10)} onChange={(e) => setKop(e.target.value)} data-autofocus />
          cm
        </span>
      </Veld>
      <Veld label={t("page.headerFooter.distanceDialog.footerFromBottom")}>
        <span className="werkruimte-eenheid">
          <input type="text" inputMode="decimal" value={voet} aria-invalid={!(v >= 0 && v <= 10)} onChange={(e) => setVoet(e.target.value)} />
          cm
        </span>
      </Veld>
      <p className="werkruimte-uitleg">{t("page.headerFooter.distanceDialog.appliesToSection")}</p>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function InhoudDialoog({ begin, bestaat, bevestig, sluit }: { begin: InhoudOpties; bestaat: boolean; bevestig: (o: InhoudOpties) => void; sluit: () => void }) {
  const [o, setO] = useState<InhoudOpties>(() => ({ ...begin }));
  const zet = (w: Partial<InhoudOpties>) => setO({ ...o, ...w });
  const { t } = useTranslation("writer");
  const kop = (level: number) => t("page.toc.dialog.heading", { level });
  const leader = { punt: ".", streep: "-", lijn: "_", geen: " " }[o.opvulteken];
  const regel = (tekst: string, niveau: number, pagina: string) => (
    <div className="pagina-tocregel" style={{ paddingLeft: `${(niveau - 1) * 14}px` }}>
      <span>{tekst}</span>
      {o.paginanummers && (o.rechtsUitlijnen ? <span className="pagina-tocvulling">{leader.repeat(60)}</span> : " ")}
      {o.paginanummers && <span>{pagina}</span>}
    </div>
  );
  return (
    <Dialoog
      titel={t("page.toc.dialog.title")}
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop={bestaat ? t("page.toc.dialog.replace") : t("page.toc.dialog.insert")} sluit={sluit} bevestig={() => bevestig(o)} />}
    >
      <div className="pagina-tocvoorbeeld" aria-hidden="true">
        {o.titel.trim() && <div className="pagina-toctitel">{o.titel}</div>}
        {regel(kop(1), 1, "1")}
        {o.niveaus >= 2 && regel(kop(2), 2, "3")}
        {o.niveaus >= 3 && regel(kop(3), 3, "5")}
      </div>
      <Veld label={t("page.toc.dialog.titleField")}>
        <input type="text" value={o.titel} placeholder={t("page.toc.dialog.noTitle")} onChange={(e) => zet({ titel: e.target.value })} data-autofocus />
      </Veld>
      <Veld label={t("page.toc.dialog.levels")}>
        <select value={o.niveaus} onChange={(e) => zet({ niveaus: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? t("page.toc.dialog.levelsOnlyFirst") : t("page.toc.dialog.levelsUpTo", { level: n })}
            </option>
          ))}
        </select>
      </Veld>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={o.paginanummers} onChange={(e) => zet({ paginanummers: e.target.checked })} />
        {t("page.toc.dialog.showPageNumbers")}
      </label>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={o.rechtsUitlijnen} disabled={!o.paginanummers} onChange={(e) => zet({ rechtsUitlijnen: e.target.checked })} />
        {t("page.toc.dialog.rightAlign")}
      </label>
      <Veld label={t("page.toc.dialog.leader")}>
        <select value={o.opvulteken} disabled={!o.paginanummers || !o.rechtsUitlijnen} onChange={(e) => zet({ opvulteken: e.target.value as InhoudOpties["opvulteken"] })}>
          {OPVULTEKENS.map((v) => (
            <option key={v.waarde} value={v.waarde}>
              {t(`page.toc.dialog.leaders.${v.sleutel}`)}
            </option>
          ))}
        </select>
      </Veld>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={o.hyperlinks} onChange={(e) => zet({ hyperlinks: e.target.checked })} />
        {t("page.toc.dialog.hyperlinks")}
      </label>
      <p className="werkruimte-uitleg">{t("page.toc.dialog.explanation", { level: o.niveaus })}</p>
    </Dialoog>
  );
}

export function BijwerkenDialoog({ bevestig, sluit }: { bevestig: (modus: "paginas" | "alles") => void; sluit: () => void }) {
  const [modus, setModus] = useState<"paginas" | "alles">("paginas");
  const { t } = useTranslation("writer");
  return (
    <Dialoog
      titel={t("page.toc.updateDialog.title")}
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop={t("page.toc.updateDialog.update")} sluit={sluit} bevestig={() => bevestig(modus)} />}
    >
      <Keuzes
        label={t("page.toc.updateDialog.what")}
        naam="toc-modus"
        waarde={modus}
        kies={setModus}
        opties={[
          { waarde: "paginas", naam: t("page.toc.updateDialog.pagesOnly") },
          { waarde: "alles", naam: t("page.toc.updateDialog.whole") },
        ]}
      />
      <p className="werkruimte-uitleg">{t("page.toc.updateDialog.explanation")}</p>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function NootDialoog({ soort, bevestig, sluit }: { soort: NootSoort; bevestig: (tekst: string) => void; sluit: () => void }) {
  const [tekst, setTekst] = useState("");
  const { t } = useTranslation("writer");
  const voetnoot = soort === "voetnoot";
  return (
    <Dialoog
      titel={voetnoot ? t("page.footnotes.insertFootnote") : t("page.footnotes.insertEndnote")}
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop={t("page.footnotes.noteDialog.insert")} uit={!tekst.trim()} sluit={sluit} bevestig={() => bevestig(tekst)} />}
    >
      <label className="pagina-nootveld">
        <span>{voetnoot ? t("page.footnotes.noteDialog.footnoteText") : t("page.footnotes.noteDialog.endnoteText")}</span>
        <textarea
          rows={4}
          value={tekst}
          data-autofocus
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && tekst.trim()) {
              e.preventDefault();
              bevestig(tekst);
            }
          }}
        />
      </label>
      <p className="werkruimte-uitleg">
        {t(voetnoot ? "page.footnotes.noteDialog.footnoteHint" : "page.footnotes.noteDialog.endnoteHint", { shortcut: "Ctrl+Enter" })}
      </p>
    </Dialoog>
  );
}

export function NootInstellingenDialoog({
  begin,
  bevestig,
  sluit,
}: {
  begin: { soort: NootSoort; instellingen: Record<NootSoort, NootInstellingen> };
  bevestig: (soort: NootSoort, w: NootInstellingen) => void;
  sluit: () => void;
}) {
  const [soort, setSoort] = useState<NootSoort>(begin.soort);
  const [alle, setAlle] = useState(begin.instellingen);
  const w = alle[soort];
  const [start, setStart] = useState(String(w.beginBij));
  const zet = (x: Partial<NootInstellingen>) => setAlle({ ...alle, [soort]: { ...w, ...x } });
  const startOk = /^\d{1,4}$/.test(start) && Number(start) >= 1;
  const { t } = useTranslation("writer");
  return (
    <Dialoog
      titel={t("page.footnotes.settingsDialog.title")}
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop={t("page.footnotes.settingsDialog.apply")} uit={!startOk} sluit={sluit} bevestig={() => bevestig(soort, { ...w, beginBij: Number(start) })} />}
    >
      <Keuzes
        label={t("page.footnotes.settingsDialog.kind")}
        naam="noot-soort"
        waarde={soort}
        kies={(s) => {
          setSoort(s);
          setStart(String(alle[s].beginBij));
        }}
        opties={[
          { waarde: "voetnoot", naam: t("page.footnotes.settingsDialog.footnotes") },
          { waarde: "eindnoot", naam: t("page.footnotes.settingsDialog.endnotes") },
        ]}
      />
      <Veld label={t("page.footnotes.settingsDialog.placement")}>
        <select value={w.positie} onChange={(e) => zet({ positie: e.target.value as NootPositie })}>
          {soort === "voetnoot" ? (
            <>
              <option value="pageBottom">{t("page.footnotes.settingsDialog.pageBottom")}</option>
              <option value="beneathText">{t("page.footnotes.settingsDialog.beneathText")}</option>
            </>
          ) : (
            <>
              <option value="docEnd">{t("page.footnotes.settingsDialog.docEnd")}</option>
              <option value="sectEnd">{t("page.footnotes.settingsDialog.sectEnd")}</option>
            </>
          )}
        </select>
      </Veld>
      <Veld label={t("page.footnotes.settingsDialog.format")}>
        <select value={w.notatie} onChange={(e) => zet({ notatie: e.target.value as NootNotatie })}>
          {NOOTNOTATIES.map((n) => (
            <option key={n.waarde} value={n.waarde}>
              {n.naam}
            </option>
          ))}
        </select>
      </Veld>
      <Veld label={t("page.footnotes.settingsDialog.startAt")}>
        <input type="text" inputMode="numeric" value={start} aria-invalid={!startOk} onChange={(e) => setStart(e.target.value)} />
      </Veld>
      <Veld label={t("page.footnotes.settingsDialog.numbering")}>
        <select value={w.herstart} onChange={(e) => zet({ herstart: e.target.value as NootHerstart })}>
          <option value="continuous">{t("page.footnotes.settingsDialog.continuous")}</option>
          <option value="eachSect">{t("page.footnotes.settingsDialog.eachSection")}</option>
          {soort === "voetnoot" && <option value="eachPage">{t("page.footnotes.settingsDialog.eachPage")}</option>}
        </select>
      </Veld>
      <p className="werkruimte-uitleg">{t("page.footnotes.settingsDialog.appliesToDocument")}</p>
    </Dialoog>
  );
}

export function NotenLijst({ noten, gaNaar, sluit }: { noten: NootInfo[]; gaNaar: (n: NootInfo, waar: "verwijzing" | "noot") => void; sluit: () => void }) {
  const { t } = useTranslation(["writer", "common"]);
  return (
    <Dialoog
      titel={t("page.footnotes.list.title")}
      sluit={sluit}
      className="pagina-dialoog pagina-notenlijst"
      acties={
        <button type="button" className="werkruimte-knop" onClick={sluit}>
          {t("common:close")}
        </button>
      }
    >
      {noten.length === 0 ? (
        <p className="werkruimte-uitleg">{t("page.footnotes.list.none")}</p>
      ) : (
        <ol className="pagina-noten">
          {noten.map((n) => (
            <li key={`${n.soort}-${n.noteId}`}>
              <span className="pagina-nootnummer">
                {t(n.soort === "voetnoot" ? "page.footnotes.list.footnote" : "page.footnotes.list.endnote", { number: n.volgnummer })}
              </span>
              <span className="pagina-noottekst">{n.tekst || t("page.footnotes.list.empty")}</span>
              <span className="pagina-nootacties">
                <button type="button" className="werkruimte-knop" onClick={() => gaNaar(n, "verwijzing")}>
                  {n.paginaVerwijzing != null
                    ? t("page.footnotes.list.toReferenceOnPage", { page: formatGetal(n.paginaVerwijzing + 1) })
                    : t("page.footnotes.list.toReference")}
                </button>
                <button type="button" className="werkruimte-knop" onClick={() => gaNaar(n, "noot")}>
                  {n.paginaNoot != null
                    ? t("page.footnotes.list.toNoteOnPage", { page: formatGetal(n.paginaNoot + 1) })
                    : t("page.footnotes.list.toNote")}
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Dialoog>
  );
}

export { STANDAARD_INHOUD };
