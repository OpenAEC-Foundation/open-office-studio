/**
 * Lintgroepen voor Tabelopmaak (#48): celgrootte, uitlijning in de cel,
 * celmarges, kopregel herhalen, sorteren, omzetten en splitsen. De bewerkingen
 * staan in ./opdrachten.ts (Yrs-sessie) en ./pakket.ts (splitsen).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import { formatGetal } from "../../i18n/opmaak";
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownAZ,
  Columns3,
  Repeat2,
  Rows3,
  Scaling,
  SquareSplitVertical,
  TableProperties,
  WrapText,
  BetweenHorizontalStart,
  Table2,
} from "lucide-react";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { Groep } from "../../Ribbon";
import type { Herladen } from "../../lint/editorApi";
import { openVenster } from "../gedeeld/vensters";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi } from "../../lint/editorApi";
import { Keuzemenu, Maatveld, getalUit, toonGetal, useEditorTik, useUitvoeren } from "../gedeeld/ui";
import { engine } from "../gedeeld/engine";
import {
  celMarges,
  celUitlijning,
  geselecteerdeAlineas,
  kolommenGelijk,
  maakPassend,
  rijenGelijk,
  sorteer,
  tabelNaarTekst,
  tabelStaat,
  tabelTeksten,
  tekstNaarTabel,
  zetRijen,
  type TabelStaat,
} from "./opdrachten";
import { splitsTabel } from "./pakket";
import {
  cmNaarTwips,
  raadScheiding,
  raadSoort,
  tekstNaarCellen,
  twipsNaarCm,
  type Scheiding,
  type Sorteersleutel,
  type Sorteersoort,
} from "./logica";

/** Splitst de tabel boven de rij met de cursor (pakketroute, herladen). */
export async function splitsHuidigeTabel(ref: DocxEditorRef | null, herlaad: Herladen | null | undefined) {
  const e = engine(ref);
  const s = tabelStaat(ref);
  if (!s) throw new Error(i18next.t("writer:table.errors.cursorInTable"));
  if (e.ref.commands.getState("editingMode").value === "suggesting")
    throw new Error(i18next.t("writer:table.errors.splitTracking"));
  if (s.plek.tabel.story !== "body") throw new Error(i18next.t("writer:table.errors.splitBodyOnly"));
  if (!herlaad) throw new Error(i18next.t("writer:table.errors.notReady"));
  await e.ref.flushPendingInput();
  const bytes = await herlaad.bytes();
  herlaad.vervang(splitsTabel(bytes, s.plek.tabel.tableIndex, s.plek.rijen[0]));
}

/** Groepen voor het contexttabblad Tabelopmaak. */
export function TabelIndeling() {
  const { t } = useTranslation("writer");
  const tik = useEditorTik();
  const api = useEditorApi();
  const uitvoeren = useUitvoeren();
  const staat = useMemo(() => tabelStaat(api.tekst()), [tik, api]);
  const bewerkbaar = useDocxCommand("insertPageBreak").state.enabled;
  const voorstel = useDocxCommand("editingMode").state.value === "suggesting";
  const uit = !bewerkbaar || !staat || voorstel;
  const reden = voorstel ? t("table.unavailableWhileTracking") : undefined;
  const setVenster = (id: "rij" | "marges" | "sorteren" | "naarTekst") => openVenster(api.tekst, `tabel.${id}`);
  const splitsen = () => uitvoeren((ref) => splitsHuidigeTabel(ref, api.herlaad), false);

  return (
    <>
      <Groep naam={t("table.groups.cellSize")}>
        <EigenKnop
          naam={t("table.buttons.row")}
          icoon={TableProperties}
          groot
          disabled={uit}
          uitleg={reden ?? t("table.buttons.rowTip")}
          onClick={() => setVenster("rij")}
        />
        <div className="ribbon-stapel">
          <EigenKnop
            naam={t("table.buttons.distributeRows")}
            icoon={Rows3}
            disabled={uit}
            uitleg={reden}
            onClick={() => uitvoeren(rijenGelijk)}
          />
          <EigenKnop
            naam={t("table.buttons.distributeColumns")}
            icoon={Columns3}
            disabled={uit}
            uitleg={reden}
            onClick={() => uitvoeren(kolommenGelijk)}
          />
          <Keuzemenu
            naam={t("table.buttons.autoFit")}
            icoon={Scaling}
            disabled={uit}
            uitleg={reden}
            items={[
              { naam: t("table.buttons.autoFitContents"), kies: () => uitvoeren((r) => maakPassend(r, "inhoud")) },
              { naam: t("table.buttons.autoFitWindow"), kies: () => uitvoeren((r) => maakPassend(r, "venster")) },
              {
                naam: t("table.buttons.fixedColumnWidth"),
                gekozen: staat?.indeling === "fixed",
                kies: () => uitvoeren((r) => maakPassend(r, "vast")),
              },
            ]}
          />
        </div>
      </Groep>
      <Groep naam={t("table.groups.cellAlignment")}>
        <div className="ribbon-stapel">
          <EigenKnop
            naam={t("table.buttons.alignTop")}
            icoon={AlignVerticalJustifyStart}
            actief={staat?.verticaal === "top"}
            disabled={uit}
            uitleg={reden ?? t("table.buttons.alignTopTip")}
            onClick={() => uitvoeren((r) => celUitlijning(r, "top"))}
          />
          <EigenKnop
            naam={t("table.buttons.alignCenter")}
            icoon={AlignVerticalJustifyCenter}
            actief={staat?.verticaal === "center"}
            disabled={uit}
            uitleg={reden ?? t("table.buttons.alignCenterTip")}
            onClick={() => uitvoeren((r) => celUitlijning(r, "center"))}
          />
          <EigenKnop
            naam={t("table.buttons.alignBottom")}
            icoon={AlignVerticalJustifyEnd}
            actief={staat?.verticaal === "bottom"}
            disabled={uit}
            uitleg={reden ?? t("table.buttons.alignBottomTip")}
            onClick={() => uitvoeren((r) => celUitlijning(r, "bottom"))}
          />
        </div>
        <EigenKnop
          naam={t("table.buttons.cellMargins")}
          icoon={BetweenHorizontalStart}
          groot
          disabled={uit}
          uitleg={reden}
          onClick={() => setVenster("marges")}
        />
      </Groep>
      <Groep naam={t("table.groups.data")}>
        <EigenKnop
          naam={t("table.buttons.sort")}
          icoon={ArrowDownAZ}
          groot
          disabled={uit}
          uitleg={reden ?? t("table.buttons.sortTip")}
          onClick={() => setVenster("sorteren")}
        />
        <div className="ribbon-stapel">
          <EigenKnop
            naam={t("table.buttons.repeatHeader")}
            icoon={Repeat2}
            actief={staat?.kopregel ?? false}
            disabled={uit}
            uitleg={reden ?? t("table.buttons.repeatHeaderTip")}
            onClick={() => uitvoeren((r) => zetRijen(r, { kopregel: !staat?.kopregel }))}
          />
          <EigenKnop
            naam={t("table.buttons.toText")}
            icoon={WrapText}
            disabled={uit}
            uitleg={reden ?? t("table.buttons.toTextTip")}
            onClick={() => setVenster("naarTekst")}
          />
          <EigenKnop
            naam={t("table.buttons.split")}
            icoon={SquareSplitVertical}
            disabled={uit || (staat?.plek.rijen[0] ?? 0) < 1}
            uitleg={reden ?? t("table.buttons.splitTip")}
            onClick={splitsen}
          />
        </div>
      </Groep>
    </>
  );
}

/** De tabelvensters, geopend via ../gedeeld/vensters.ts (lint of rechtermuismenu). */
export function TabelVenster({ id, gegevens, sluit }: { id: string; gegevens?: unknown; sluit: () => void }) {
  const api = useEditorApi().tekst;
  const [staat] = useState(() => tabelStaat(api()));
  if (id === "tabel.tekstNaarTabel") return <TekstNaarTabelVenster alineas={(gegevens as string[]) ?? []} sluit={sluit} />;
  if (!staat) return null;
  if (id === "tabel.rij") return <RijVenster staat={staat} sluit={sluit} />;
  if (id === "tabel.marges") return <MargesVenster staat={staat} sluit={sluit} />;
  if (id === "tabel.sorteren") return <SorteerVenster staat={staat} sluit={sluit} />;
  if (id === "tabel.naarTekst") return <NaarTekstVenster sluit={sluit} />;
  return null;
}

function Acties({ ok, sluit, label, disabled }: { ok: () => void; sluit: () => void; label?: string; disabled?: boolean }) {
  const { t } = useTranslation("common");
  return (
    <>
      <button type="button" className="werkruimte-knop" onClick={sluit}>
        {t("cancel")}
      </button>
      <button type="button" className="werkruimte-knop is-primair" disabled={disabled} onClick={ok}>
        {label ?? t("ok")}
      </button>
    </>
  );
}

function RijVenster({ staat, sluit }: { staat: TabelStaat; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const uitvoeren = useUitvoeren();
  const [regel, setRegel] = useState(staat.hoogte ? staat.regel : "auto");
  const [hoogte, setHoogte] = useState(toonGetal(twipsNaarCm(staat.hoogte ?? 567)));
  const [kopregel, setKopregel] = useState(staat.kopregel);
  const [nietAfbreken, setNietAfbreken] = useState(staat.nietAfbreken);
  const [alle, setAlle] = useState(false);
  const cm = getalUit(hoogte);
  const geldig = regel === "auto" || (cm > 0 && cm <= 55);
  const [van, tot] = staat.plek.rijen;
  function ok() {
    if (!geldig) return;
    sluit();
    uitvoeren((r) =>
      zetRijen(
        r,
        {
          kopregel: kopregel === staat.kopregel ? undefined : kopregel,
          nietAfbreken,
          hoogte: regel === "auto" ? null : cmNaarTwips(cm),
          regel: regel as "auto" | "atLeast" | "exact",
        },
        alle,
      ),
    );
  }
  return (
    <Dialoog titel={t("table.row.title")} sluit={sluit} className="tw-venster" acties={<Acties ok={ok} sluit={sluit} disabled={!geldig} />}>
      <p className="werkruimte-uitleg">
        {alle ? t("table.row.allRows") : van === tot ? t("table.row.oneRow", { row: van + 1 }) : t("table.row.rowRange", { from: van + 1, to: tot + 1 })}
      </p>
      <fieldset>
        <legend>{t("table.row.size")}</legend>
        <label className="werkruimte-veld">
          <span>{t("table.row.height")}</span>
          <select value={regel} onChange={(e) => setRegel(e.target.value as typeof regel)} data-autofocus="">
            <option value="auto">{t("table.row.auto")}</option>
            <option value="atLeast">{t("table.row.atLeast")}</option>
            <option value="exact">{t("table.row.exact")}</option>
          </select>
        </label>
        <Maatveld label={t("table.row.heightValue")} waarde={hoogte} wijzig={setHoogte} disabled={regel === "auto"} />
      </fieldset>
      <fieldset>
        <legend>{t("table.row.options")}</legend>
        <label className="werkruimte-vink">
          <input type="checkbox" checked={!nietAfbreken} onChange={(e) => setNietAfbreken(!e.target.checked)} />
          {t("table.row.allowBreak")}
        </label>
        <label className="werkruimte-vink">
          <input type="checkbox" checked={kopregel} onChange={(e) => setKopregel(e.target.checked)} />
          {t("table.row.repeatHeader")}
        </label>
        <label className="werkruimte-vink">
          <input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} />
          {t("table.row.applyToAll")}
        </label>
      </fieldset>
    </Dialoog>
  );
}

function MargesVenster({ staat, sluit }: { staat: TabelStaat; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const uitvoeren = useUitvoeren();
  const [heel, setHeel] = useState(true);
  const vanBron = (bron: TabelStaat["marges"]) => ({
    top: toonGetal(twipsNaarCm(bron.top ?? 0)),
    bottom: toonGetal(twipsNaarCm(bron.bottom ?? 0)),
    left: toonGetal(twipsNaarCm(bron.left ?? 108)),
    right: toonGetal(twipsNaarCm(bron.right ?? 108)),
  });
  const [waarden, setWaarden] = useState(() => vanBron(staat.tabelMarges));
  const kies = (tabel: boolean) => {
    setHeel(tabel);
    setWaarden(vanBron(tabel ? staat.tabelMarges : staat.marges));
  };
  const getallen = Object.fromEntries(Object.entries(waarden).map(([k, v]) => [k, getalUit(v)])) as Record<keyof typeof waarden, number>;
  const geldig = Object.values(getallen).every((n) => n >= 0 && n <= 10);
  const veld = (k: keyof typeof waarden, label: string) => (
    <Maatveld label={label} waarde={waarden[k]} wijzig={(v) => setWaarden({ ...waarden, [k]: v })} autoFocus={k === "top"} />
  );
  function ok() {
    if (!geldig) return;
    sluit();
    uitvoeren((r) =>
      celMarges(
        r,
        {
          top: cmNaarTwips(getallen.top),
          bottom: cmNaarTwips(getallen.bottom),
          left: cmNaarTwips(getallen.left),
          right: cmNaarTwips(getallen.right),
        },
        heel,
      ),
    );
  }
  return (
    <Dialoog titel={t("table.margins.title")} sluit={sluit} className="tw-venster" acties={<Acties ok={ok} sluit={sluit} disabled={!geldig} />}>
      <div className="werkruimte-keuzes" role="radiogroup" aria-label={t("table.margins.applyTo")}>
        <label>
          <input type="radio" checked={heel} onChange={() => kies(true)} /> {t("table.margins.wholeTable")}
        </label>
        <label>
          <input type="radio" checked={!heel} onChange={() => kies(false)} /> {t("table.margins.selectedCells")}
        </label>
      </div>
      <div className="tw-raster2">
        {veld("top", t("table.margins.top"))}
        {veld("bottom", t("table.margins.bottom"))}
        {veld("left", t("table.margins.left"))}
        {veld("right", t("table.margins.right"))}
      </div>
    </Dialoog>
  );
}

/** Sorteersoorten met hun sleutel onder `writer:table.sort.types`. */
const SOORTNAMEN: Record<Sorteersoort, string> = { tekst: "text", getal: "number", datum: "date" };

function SorteerVenster({ staat, sluit }: { staat: TabelStaat; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const api = useEditorApi().tekst;
  const uitvoeren = useUitvoeren();
  const teksten = useMemo(() => {
    try {
      return tabelTeksten(engine(api()).sessie, staat.plek.tabel);
    } catch {
      return [] as string[][];
    }
  }, [api, staat]);
  // Zoals Word: een kopregel als die als kop herhaalt, of als de eerste rij
  // tekst is waar de rest van een kolom getallen of datums bevat.
  const [kop, setKop] = useState(
    () =>
      staat.kopregel ||
      (teksten.length > 2 &&
        teksten[0].some((c, k) => raadSoort([c]) === "tekst" && c.trim() !== "" && raadSoort(teksten.slice(1).map((r) => r[k] ?? "")) !== "tekst")),
  );
  const kolomNaam = (k: number) => (kop ? teksten[0]?.[k]?.trim() : "") || t("table.sort.column", { n: k + 1 });
  const soortVan = (k: number) => raadSoort(teksten.slice(kop ? 1 : 0).map((r) => r[k] ?? ""));
  const [sleutels, setSleutels] = useState<(Sorteersleutel | null)[]>(() => [
    { kolom: staat.plek.kolommen[0], soort: soortVan(staat.plek.kolommen[0]), aflopend: false },
    null,
    null,
  ]);
  const zet = (i: number, s: Sorteersleutel | null) => setSleutels(sleutels.map((o, j) => (j === i ? s : o)));
  function ok() {
    const gekozen = sleutels.filter((s): s is Sorteersleutel => s !== null);
    if (!gekozen.length) return;
    sluit();
    // Kopregels die als kop herhalen blijven altijd bovenaan.
    const kopregels = kop ? Math.max(1, aantalKoppen(teksten.length, staat)) : 0;
    uitvoeren((r) => sorteer(r, gekozen, kopregels));
  }
  return (
    <Dialoog titel={t("table.sort.title")} sluit={sluit} className="tw-venster is-breed" acties={<Acties ok={ok} sluit={sluit} label={t("table.sort.ok")} />}>
      {sleutels.map((s, i) => (
        <fieldset key={i}>
          <legend>{i === 0 ? t("table.sort.sortBy") : t("table.sort.thenBy")}</legend>
          <div className="werkruimte-rij">
            <select
              aria-label={t("table.sort.columnLabel")}
              value={s?.kolom ?? ""}
              data-autofocus={i === 0 ? "" : undefined}
              onChange={(e) =>
                zet(i, e.target.value === "" ? null : { kolom: +e.target.value, soort: soortVan(+e.target.value), aflopend: s?.aflopend ?? false })
              }
            >
              {i > 0 && <option value="">{t("table.sort.none")}</option>}
              {Array.from({ length: staat.kolommen }, (_, k) => (
                <option key={k} value={k}>
                  {kolomNaam(k)}
                </option>
              ))}
            </select>
            <select aria-label={t("table.sort.type")} value={s?.soort ?? "tekst"} disabled={!s} onChange={(e) => s && zet(i, { ...s, soort: e.target.value as Sorteersoort })}>
              {Object.entries(SOORTNAMEN).map(([w, n]) => (
                <option key={w} value={w}>
                  {t(`table.sort.types.${n}`)}
                </option>
              ))}
            </select>
            <label className="werkruimte-vink">
              <input type="radio" name={`richting${i}`} checked={!s?.aflopend} disabled={!s} onChange={() => s && zet(i, { ...s, aflopend: false })} />
              {t("table.sort.ascending")}
            </label>
            <label className="werkruimte-vink">
              <input type="radio" name={`richting${i}`} checked={!!s?.aflopend} disabled={!s} onChange={() => s && zet(i, { ...s, aflopend: true })} />
              {t("table.sort.descending")}
            </label>
          </div>
        </fieldset>
      ))}
      <label className="werkruimte-vink">
        <input type="checkbox" checked={kop} onChange={(e) => setKop(e.target.checked)} />
        {t("table.sort.hasHeader")}
      </label>
      <p className="werkruimte-uitleg">{t("table.sort.note", { undo: "Ctrl+Z" })}</p>
    </Dialoog>
  );
}

function aantalKoppen(rijen: number, staat: TabelStaat) {
  return staat.kopregel ? Math.min(rijen - 1, 1) : 1;
}

/** Scheidingstekens met hun sleutel onder `writer:table.separator`. */
const SCHEIDINGEN: { waarde: Exclude<Scheiding, { teken: string }>; sleutel: string }[] = [
  { waarde: "tab", sleutel: "tabs" },
  { waarde: "puntkomma", sleutel: "semicolons" },
  { waarde: "komma", sleutel: "commas" },
  { waarde: "alinea", sleutel: "paragraphs" },
];

function ScheidingKeuze({
  scheiding,
  setScheiding,
  anders,
  setAnders,
}: {
  scheiding: Scheiding;
  setScheiding: (s: Scheiding) => void;
  anders: string;
  setAnders: (s: string) => void;
}) {
  const { t } = useTranslation("writer");
  return (
    <fieldset>
      <legend>{t("table.separator.legend")}</legend>
      <div className="werkruimte-keuzes">
        {SCHEIDINGEN.map((s) => (
          <label key={s.waarde}>
            <input type="radio" name="scheiding" checked={scheiding === s.waarde} onChange={() => setScheiding(s.waarde)} /> {t(`table.separator.${s.sleutel}`)}
          </label>
        ))}
        <label>
          <input type="radio" name="scheiding" checked={typeof scheiding === "object"} onChange={() => setScheiding({ teken: anders || "-" })} /> {t("table.separator.other")}
          <input
            type="text"
            maxLength={1}
            size={2}
            value={anders}
            aria-label={t("table.separator.otherLabel")}
            onChange={(e) => {
              setAnders(e.target.value);
              setScheiding({ teken: e.target.value || "-" });
            }}
          />
        </label>
      </div>
    </fieldset>
  );
}

function NaarTekstVenster({ sluit }: { sluit: () => void }) {
  const { t } = useTranslation("writer");
  const uitvoeren = useUitvoeren();
  const [scheiding, setScheiding] = useState<Scheiding>("tab");
  const [anders, setAnders] = useState("-");
  function ok() {
    sluit();
    uitvoeren((r) => tabelNaarTekst(r, scheiding));
  }
  return (
    <Dialoog titel={t("table.toText.title")} sluit={sluit} className="tw-venster" acties={<Acties ok={ok} sluit={sluit} label={t("table.convert")} />}>
      <ScheidingKeuze scheiding={scheiding} setScheiding={setScheiding} anders={anders} setAnders={setAnders} />
      <p className="werkruimte-uitleg">{t("table.toText.note", { paragraphs: t("table.separator.paragraphs") })}</p>
    </Dialoog>
  );
}

/** Invoegen › Tabellen: geselecteerde tekst omzetten naar een tabel. */
export function TekstNaarTabelKnop() {
  const { t } = useTranslation("writer");
  const api = useEditorApi().tekst;
  const uitvoeren = useUitvoeren();
  const bewerkbaar = useDocxCommand("insertTable").state.enabled;
  return (
    <EigenKnop
      naam={t("table.fromText.button")}
      icoon={Table2}
      disabled={!bewerkbaar}
      uitleg={t("table.fromText.buttonTip")}
      onClick={() => uitvoeren((ref) => openTekstNaarTabel(ref, api), false)}
    />
  );
}

/** Opent ‘Tekst converteren naar tabel’ voor de geselecteerde alinea’s. */
export async function openTekstNaarTabel(ref: DocxEditorRef | null, sleutel: object) {
  const e = engine(ref);
  await e.ref.flushPendingInput();
  const alineas = geselecteerdeAlineas(e).map((a) => a.text);
  if (!alineas.some((a) => a.trim())) throw new Error(i18next.t("writer:table.errors.selectParagraphs"));
  openVenster(sleutel, "tabel.tekstNaarTabel", alineas);
}

function TekstNaarTabelVenster({ alineas, sluit }: { alineas: string[]; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const uitvoeren = useUitvoeren();
  const [scheiding, setScheiding] = useState<Scheiding>(() => raadScheiding(alineas));
  const [anders, setAnders] = useState("-");
  const [kolommen, setKolommen] = useState(() => String(tekstNaarCellen(alineas, raadScheiding(alineas))[0]?.length ?? 1));
  const n = Math.max(1, Math.min(63, Math.round(getalUit(kolommen)) || 1));
  const cellen = tekstNaarCellen(alineas, scheiding, scheiding === "alinea" ? n : undefined);
  const breed = cellen[0]?.length ?? 1;
  function ok() {
    sluit();
    uitvoeren((r) => tekstNaarTabel(r, scheiding, scheiding === "alinea" ? n : undefined));
  }
  return (
    <Dialoog titel={t("table.fromText.title")} sluit={sluit} className="tw-venster is-breed" acties={<Acties ok={ok} sluit={sluit} label={t("table.convert")} />}>
      <Maatveld label={t("table.fromText.columns")} waarde={scheiding === "alinea" ? kolommen : String(breed)} wijzig={setKolommen} eenheid="" stap={1} min={1} max={63} disabled={scheiding !== "alinea"} />
      <p className="werkruimte-uitleg">
        {t("table.fromText.size", {
          rows: t("table.fromText.rows", { count: cellen.length, number: formatGetal(cellen.length) }),
          columns: t("table.fromText.columnCount", { count: breed, number: formatGetal(breed) }),
        })}
      </p>
      <ScheidingKeuze scheiding={scheiding} setScheiding={setScheiding} anders={anders} setAnders={setAnders} />
      <table className="tw-tabelvoorbeeld" aria-label={t("table.fromText.preview")}>
        <tbody>
          {cellen.slice(0, 5).map((rij, i) => (
            <tr key={i}>
              {rij.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {cellen.length > 5 && <p className="werkruimte-uitleg">{t("table.fromText.moreRows", { count: cellen.length - 5, number: formatGetal(cellen.length - 5) })}</p>}
    </Dialoog>
  );
}

