/**
 * Lintgroepen voor Afbeeldingsopmaak (#49): grootte met vergrendelde
 * verhouding, bijsnijden (interactief met grepen en met getallen), afbeelding
 * wijzigen, opnieuw instellen, alternatieve tekst en positie. De bewerkingen
 * staan in ./opdrachten.ts.
 */
import { useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Crop, ImageUp, Lock, LockOpen, Move, RefreshCcw, TextCursorInput } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { Groep, RibbonFout } from "../../Ribbon";
import { openVenster } from "../gedeeld/vensters";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi } from "../../lint/editorApi";
import { Keuzemenu, Maatveld, getalUit, toonGetal, useEditorTik, useUitvoeren } from "../gedeeld/ui";
import { engine, fout } from "../gedeeld/engine";
import {
  afbeeldingStaat,
  bijsnijden,
  natuurlijkeMaat,
  opnieuwInstellen,
  vervangAfbeelding,
  zetAfmeting,
  zetAltTekst,
  zetPositie,
  type BeeldPlek,
} from "./opdrachten";
import {
  EMU_PER_CM,
  ONDERSTEUNDE_BEELDEN,
  ZWEVEND,
  beeldmaat,
  begrensBijsnijding,
  cmNaarPx,
  leesBijsnijding,
  maatNaBijsnijden,
  metVerhouding,
  pxNaarCm,
  sleepGreep,
  type Bijsnijding,
  type Greep,
  type HorizontaalTov,
  type VerticaalTov,
} from "./logica";

const VERGRENDELD = "open-tekst-beeldverhouding";
function leesVergrendeld() {
  try {
    return localStorage.getItem(VERGRENDELD) !== "nee";
  } catch {
    return true;
  }
}

/** Leest een gekozen beeldbestand als data-URL met zijn pixelmaat. */
async function leesBeeld(file: File) {
  if (!ONDERSTEUNDE_BEELDEN.includes(file.type)) throw new Error(i18next.t("writer:picture.errors.unsupported"));
  if (file.size > 25 * 1024 * 1024) throw new Error(i18next.t("writer:picture.errors.tooLarge", { size: "25 MB" }));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const natuurlijk = beeldmaat(bytes);
  if (!natuurlijk) throw new Error(i18next.t("writer:picture.errors.unreadable"));
  const src = await new Promise<string>((klaar, fout) => {
    const lezer = new FileReader();
    lezer.onload = () => klaar(String(lezer.result));
    lezer.onerror = () => fout(new Error(i18next.t("writer:picture.errors.readFailed")));
    lezer.readAsDataURL(file);
  });
  return { src, natuurlijk };
}

/**
 * ‘Afbeelding wijzigen’: laat een bestand kiezen en vervangt de geselecteerde
 * afbeelding. Werkt vanuit het lint en vanuit het rechtermuismenu.
 */
export function kiesNieuweAfbeelding(api: () => DocxEditorRef | null, meld: (bericht: string) => void) {
  if (!afbeeldingStaat(api())) {
    meld(i18next.t("writer:picture.errors.selectPicture"));
    return;
  }
  const invoer = document.createElement("input");
  invoer.type = "file";
  invoer.accept = ONDERSTEUNDE_BEELDEN.join(",");
  invoer.addEventListener("change", () => {
    const file = invoer.files?.[0];
    if (!file) return;
    void leesBeeld(file)
      .then((nieuw) => {
        vervangAfbeelding(api(), nieuw.src, nieuw.natuurlijk);
        api()?.focus();
      })
      .catch((error) => meld(fout(error)));
  });
  invoer.click();
}

export function AfbeeldingGroepen() {
  const { t } = useTranslation("writer");
  const tik = useEditorTik();
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const uitvoeren = useUitvoeren();
  const bewerkbaar = useDocxCommand("imageProperties").state.enabled;
  const plek = useMemo(() => afbeeldingStaat(api()), [tik, api]);
  const [vergrendeld, setVergrendeld] = useState(leesVergrendeld);
  const uit = !bewerkbaar || !plek;
  const breedte = Number(plek?.attrs.width) || 0,
    hoogte = Number(plek?.attrs.height) || 0;
  const setVenster = (id: "bijsnijden" | "alt" | "positie") => openVenster(api, `afbeelding.${id}`);

  function maat(soort: "breedte" | "hoogte", cm: number) {
    if (!(cm > 0) || !plek) return;
    const px = cmNaarPx(cm);
    const nieuw = vergrendeld
      ? metVerhouding(breedte, hoogte, soort === "breedte" ? { breedte: px } : { hoogte: px })
      : { breedte: soort === "breedte" ? px : breedte, hoogte: soort === "hoogte" ? px : hoogte };
    uitvoeren((r) => zetAfmeting(r, nieuw.breedte, nieuw.hoogte), false);
  }

  function herstel(metGrootte: boolean) {
    uitvoeren(async (r) => {
      const e = engine(r);
      const huidig = afbeeldingStaat(r);
      const natuurlijk = metGrootte ? await natuurlijkeMaat(huidig?.attrs.src) : null;
      const sectie = e.ref.getDocument()?.package.document.finalSectionProperties as
        | { pageWidth?: number; marginLeft?: number; marginRight?: number }
        | undefined;
      const tekstbreedte = sectie?.pageWidth ? (sectie.pageWidth - (sectie.marginLeft ?? 1440) - (sectie.marginRight ?? 1440)) / 15 : 600;
      opnieuwInstellen(r, metGrootte, natuurlijk, tekstbreedte);
    });
  }

  return (
    <>
      <Groep naam={t("picture.groups.size")}>
        <div className="ribbon-stapel tw-beeldmaat">
          <MaatInvoer naam={t("picture.size.height")} waarde={hoogte} disabled={uit} kies={(cm) => maat("hoogte", cm)} />
          <MaatInvoer naam={t("picture.size.width")} waarde={breedte} disabled={uit} kies={(cm) => maat("breedte", cm)} />
          <EigenKnop
            naam={vergrendeld ? t("picture.size.locked") : t("picture.size.unlocked")}
            icoon={vergrendeld ? Lock : LockOpen}
            actief={vergrendeld}
            uitleg={t("picture.size.lockTip")}
            onClick={() => {
              setVergrendeld(!vergrendeld);
              try {
                localStorage.setItem(VERGRENDELD, vergrendeld ? "nee" : "ja");
              } catch {
                // Alleen gemak.
              }
            }}
          />
        </div>
        <EigenKnop naam={t("picture.buttons.crop")} icoon={Crop} groot disabled={uit} uitleg={t("picture.buttons.cropTip")} onClick={() => setVenster("bijsnijden")} />
      </Groep>
      <Groep naam={t("picture.groups.adjust")}>
        <EigenKnop
          naam={t("picture.buttons.change")}
          icoon={ImageUp}
          groot
          disabled={uit}
          uitleg={t("picture.buttons.changeTip")}
          onClick={() => kiesNieuweAfbeelding(api, meld)}
        />
        <Keuzemenu
          naam={t("picture.buttons.reset")}
          icoon={RefreshCcw}
          groot
          disabled={uit}
          items={[
            { naam: t("picture.buttons.resetPicture"), uitleg: t("picture.buttons.resetPictureTip"), kies: () => herstel(false) },
            { naam: t("picture.buttons.resetPictureAndSize"), uitleg: t("picture.buttons.resetPictureAndSizeTip"), kies: () => herstel(true) },
          ]}
        />
      </Groep>
      <Groep naam={t("picture.groups.accessibility")}>
        <EigenKnop naam={t("picture.buttons.altText")} icoon={TextCursorInput} groot disabled={uit} onClick={() => setVenster("alt")} />
      </Groep>
      <Groep naam={t("picture.groups.arrange")}>
        <EigenKnop
          naam={t("picture.buttons.position")}
          icoon={Move}
          groot
          disabled={uit || !ZWEVEND.has(String(plek?.attrs.wrapType))}
          uitleg={
            plek && !ZWEVEND.has(String(plek.attrs.wrapType))
              ? t("picture.buttons.positionInline")
              : t("picture.buttons.positionTip")
          }
          onClick={() => setVenster("positie")}
        />
      </Groep>
    </>
  );
}

/** De afbeeldingsvensters, geopend via ../gedeeld/vensters.ts (lint of rechtermuismenu). */
export function AfbeeldingVenster({ id, sluit }: { id: string; sluit: () => void }) {
  const api = useEditorApi().tekst;
  // De plek bij het openen: de selectie blijft daarna op het beeld staan.
  const [plek] = useState<BeeldPlek | null>(() => afbeeldingStaat(api()));
  if (!plek) return null;
  if (id === "afbeelding.bijsnijden") return <BijsnijdVenster plek={plek} sluit={sluit} />;
  if (id === "afbeelding.alt") return <AltVenster plek={plek} sluit={sluit} />;
  if (id === "afbeelding.positie") return <PositieVenster plek={plek} sluit={sluit} />;
  return null;
}

function MaatInvoer({ naam, waarde, disabled, kies }: { naam: string; waarde: number; disabled: boolean; kies: (cm: number) => void }) {
  const { t } = useTranslation("writer");
  const [tekst, setTekst] = useState(toonGetal(pxNaarCm(waarde)));
  useEffect(() => setTekst(toonGetal(pxNaarCm(waarde))), [waarde]);
  const toepassen = () => {
    const cm = getalUit(tekst);
    if (cm > 0 && Math.abs(cm - pxNaarCm(waarde)) >= 0.01) kies(cm);
    else setTekst(toonGetal(pxNaarCm(waarde)));
  };
  return (
    <label className="tw-lintmaat" title={t("picture.size.inCentimeters", { name: naam })}>
      <span>{naam}</span>
      <input
        type="number"
        min={0.1}
        step={0.1}
        value={tekst}
        disabled={disabled}
        aria-label={t("picture.size.withUnit", { name: naam, unit: "cm" })}
        onChange={(e) => setTekst(e.target.value)}
        onBlur={toepassen}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            toepassen();
          }
        }}
      />
      <span>cm</span>
    </label>
  );
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

const GREPEN: Greep[] = ["nw", "n", "no", "o", "zo", "z", "zw", "w"];

/** Bijsnijden: het volle beeld met een kader en acht grepen, plus getallen in cm. */
function BijsnijdVenster({ plek, sluit }: { plek: BeeldPlek; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const uitvoeren = useUitvoeren();
  const start = leesBijsnijding(plek.attrs);
  const [b, setB] = useState<Bijsnijding>(start);
  const vlak = useRef<HTMLDivElement>(null);
  const sleep = useRef<{ greep: Greep; x: number; y: number; van: Bijsnijding } | null>(null);
  // Volle maat (zonder bijsnijding) in cm, voor de getallen.
  const vol = maatNaBijsnijden(Number(plek.attrs.width) || 1, Number(plek.attrs.height) || 1, start, { top: 0, right: 0, bottom: 0, left: 0 });
  const volCm = { breedte: pxNaarCm(vol.breedte), hoogte: pxNaarCm(vol.hoogte) };
  const verhouding = vol.breedte / vol.hoogte;
  const kaderBreedte = Math.min(440, 300 * verhouding);
  const kaderHoogte = kaderBreedte / verhouding;
  const zichtbaar = maatNaBijsnijden(vol.breedte, vol.hoogte, { top: 0, right: 0, bottom: 0, left: 0 }, b);

  function omlaag(greep: Greep, event: ReactPointerEvent) {
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    sleep.current = { greep, x: event.clientX, y: event.clientY, van: b };
  }
  function beweeg(event: ReactPointerEvent) {
    const s = sleep.current;
    if (!s) return;
    const dx = (event.clientX - s.x) / kaderBreedte,
      dy = (event.clientY - s.y) / kaderHoogte;
    setB(sleepGreep(s.van, s.greep, dx, dy));
  }
  const veld = (kant: keyof Bijsnijding, label: string) => {
    const as = kant === "left" || kant === "right" ? volCm.breedte : volCm.hoogte;
    return (
      <Maatveld
        label={label}
        waarde={toonGetal(b[kant] * as)}
        stap={0.05}
        wijzig={(v) => setB(begrensBijsnijding({ ...b, [kant]: Math.max(0, getalUit(v) || 0) / as }))}
      />
    );
  };
  function toetsGreep(greep: Greep, event: React.KeyboardEvent) {
    const stap = event.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-stap, 0], ArrowRight: [stap, 0], ArrowUp: [0, -stap], ArrowDown: [0, stap] }[event.key];
    if (!d) return;
    event.preventDefault();
    setB(sleepGreep(b, greep, d[0], d[1]));
  }
  function ok() {
    sluit();
    uitvoeren((r) => bijsnijden(r, b));
  }
  return (
    <Dialoog titel={t("picture.crop.title")} sluit={sluit} className="tw-venster is-breed" acties={<Acties ok={ok} sluit={sluit} label={t("picture.crop.ok")} />}>
      <div
        ref={vlak}
        className="tw-bijsnijden"
        style={{ width: kaderBreedte, height: kaderHoogte }}
        onPointerMove={beweeg}
        onPointerUp={() => (sleep.current = null)}
        onPointerCancel={() => (sleep.current = null)}
      >
        {plek.attrs.src ? <img src={plek.attrs.src} alt="" draggable={false} /> : <div className="tw-bijsnijden-leeg">{t("picture.crop.noPreview")}</div>}
        <div
          className="tw-bijsnijden-kader"
          style={{ left: `${b.left * 100}%`, top: `${b.top * 100}%`, right: `${b.right * 100}%`, bottom: `${b.bottom * 100}%` }}
          onPointerDown={(e) => e.target === e.currentTarget && omlaag("verplaats", e)}
        >
          {plek.attrs.src && (
            <div
              className="tw-bijsnijden-zicht"
              style={{
                backgroundImage: `url("${plek.attrs.src}")`,
                backgroundSize: `${kaderBreedte}px ${kaderHoogte}px`,
                backgroundPosition: `${-b.left * kaderBreedte}px ${-b.top * kaderHoogte}px`,
              }}
            />
          )}
          {GREPEN.map((g) => (
            <button
              key={g}
              type="button"
              className={`tw-greep tw-greep-${g}`}
              aria-label={t(`picture.crop.handles.${g}`)}
              onPointerDown={(e) => omlaag(g, e)}
              onKeyDown={(e) => toetsGreep(g, e)}
            />
          ))}
        </div>
      </div>
      <div className="tw-raster2">
        {veld("top", t("picture.sides.top"))}
        {veld("bottom", t("picture.sides.bottom"))}
        {veld("left", t("picture.sides.left"))}
        {veld("right", t("picture.sides.right"))}
      </div>
      <p className="werkruimte-uitleg">
        {t("picture.crop.visible", {
          width: toonGetal(pxNaarCm(zichtbaar.breedte)),
          height: toonGetal(pxNaarCm(zichtbaar.hoogte)),
          fullWidth: toonGetal(volCm.breedte),
          fullHeight: toonGetal(volCm.hoogte),
          unit: "cm",
          reset: t("picture.buttons.reset"),
        })}
      </p>
      <button type="button" className="werkruimte-knop" onClick={() => setB({ top: 0, right: 0, bottom: 0, left: 0 })}>
        {t("picture.crop.clear")}
      </button>
    </Dialoog>
  );
}

function AltVenster({ plek, sluit }: { plek: BeeldPlek; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const uitvoeren = useUitvoeren();
  const [tekst, setTekst] = useState(String(plek.attrs.alt ?? ""));
  const [decoratief, setDecoratief] = useState(plek.attrs.decorative === true);
  function ok() {
    sluit();
    uitvoeren((r) => zetAltTekst(r, tekst, decoratief));
  }
  return (
    <Dialoog titel={t("picture.alt.title")} sluit={sluit} className="tw-venster" acties={<Acties ok={ok} sluit={sluit} />}>
      <p className="werkruimte-uitleg">{t("picture.alt.intro")}</p>
      <label className="werkruimte-veld tw-alt">
        <span>{t("picture.alt.description")}</span>
        <textarea rows={4} value={tekst} disabled={decoratief} data-autofocus="" onChange={(e) => setTekst(e.target.value)} />
      </label>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={decoratief} onChange={(e) => setDecoratief(e.target.checked)} />
        {t("picture.alt.decorative")}
      </label>
      {decoratief && <p className="werkruimte-uitleg">{t("picture.alt.decorativeNote")}</p>}
    </Dialoog>
  );
}

/** Ten opzichte van: de waarde is ook de sleutel onder `writer:picture.position.relativeTo`. */
const HORIZONTAAL: HorizontaalTov[] = ["margin", "page", "column", "character"];
const VERTICAAL: VerticaalTov[] = ["margin", "page", "paragraph", "line"];

function PositieVenster({ plek, sluit }: { plek: BeeldPlek; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const uitvoeren = useUitvoeren();
  const pos = plek.attrs.position;
  const [hSoort, setHSoort] = useState<"align" | "offset">(pos?.horizontal?.align ? "align" : "offset");
  const [hAlign, setHAlign] = useState(pos?.horizontal?.align ?? "center");
  const [hOffset, setHOffset] = useState(toonGetal((pos?.horizontal?.posOffset ?? 0) / EMU_PER_CM));
  const [hTov, setHTov] = useState<HorizontaalTov>((pos?.horizontal?.relativeTo as HorizontaalTov) ?? "column");
  const [vSoort, setVSoort] = useState<"align" | "offset">(pos?.vertical?.align ? "align" : "offset");
  const [vAlign, setVAlign] = useState(pos?.vertical?.align ?? "top");
  const [vOffset, setVOffset] = useState(toonGetal((pos?.vertical?.posOffset ?? 0) / EMU_PER_CM));
  const [vTov, setVTov] = useState<VerticaalTov>((pos?.vertical?.relativeTo as VerticaalTov) ?? "paragraph");
  const afstand = (k: "distTop" | "distBottom" | "distLeft" | "distRight") => toonGetal(pxNaarCm(Number(plek.attrs[k]) || 0));
  const [afst, setAfst] = useState({ distTop: afstand("distTop"), distBottom: afstand("distBottom"), distLeft: afstand("distLeft"), distRight: afstand("distRight") });
  function ok() {
    sluit();
    const cm = (t: string) => Math.round((getalUit(t) || 0) * EMU_PER_CM);
    uitvoeren((r) =>
      zetPositie(r, {
        position: {
          horizontal: hSoort === "align" ? { relativeTo: hTov, align: hAlign } : { relativeTo: hTov, posOffset: cm(hOffset) },
          vertical: vSoort === "align" ? { relativeTo: vTov, align: vAlign } : { relativeTo: vTov, posOffset: cm(vOffset) },
        },
        distTop: cmNaarPx(getalUit(afst.distTop) || 0),
        distBottom: cmNaarPx(getalUit(afst.distBottom) || 0),
        distLeft: cmNaarPx(getalUit(afst.distLeft) || 0),
        distRight: cmNaarPx(getalUit(afst.distRight) || 0),
      }),
    );
  }
  const as = (
    titel: string,
    soort: "align" | "offset",
    setSoort: (s: "align" | "offset") => void,
    align: string,
    setAlign: (s: string) => void,
    uitlijningen: [string, string][],
    offset: string,
    setOffset: (s: string) => void,
    tov: string,
    setTov: (s: never) => void,
    opties: string[],
  ) => (
    <fieldset>
      <legend>{titel}</legend>
      <div className="werkruimte-keuzes">
        <label>
          <input type="radio" checked={soort === "align"} onChange={() => setSoort("align")} /> {t("picture.position.alignment")}
        </label>
        <select aria-label={t("picture.position.alignmentLabel", { axis: titel })} value={align} disabled={soort !== "align"} onChange={(e) => setAlign(e.target.value)}>
          {uitlijningen.map(([w, n]) => (
            <option key={w} value={w}>
              {n}
            </option>
          ))}
        </select>
        <label>
          <input type="radio" checked={soort === "offset"} onChange={() => setSoort("offset")} /> {t("picture.position.absolute")}
        </label>
        <span className="werkruimte-eenheid">
          <input type="number" step={0.1} aria-label={t("picture.position.offsetLabel", { axis: titel, unit: "cm" })} value={offset} disabled={soort !== "offset"} onChange={(e) => setOffset(e.target.value)} />
          cm
        </span>
      </div>
      <label className="werkruimte-veld">
        <span>{t("picture.position.relativeToLabel")}</span>
        <select value={tov} onChange={(e) => setTov(e.target.value as never)}>
          {opties.map((o) => (
            <option key={o} value={o}>
              {t(`picture.position.relativeTo.${o}`)}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
  return (
    <Dialoog titel={t("picture.position.title")} sluit={sluit} className="tw-venster is-breed" acties={<Acties ok={ok} sluit={sluit} />}>
      {as(t("picture.position.horizontal"), hSoort, setHSoort, hAlign, setHAlign, [["left", t("picture.sides.left")], ["center", t("picture.position.centered")], ["right", t("picture.sides.right")]], hOffset, setHOffset, hTov, setHTov as (s: never) => void, HORIZONTAAL)}
      {as(t("picture.position.vertical"), vSoort, setVSoort, vAlign, setVAlign, [["top", t("picture.sides.top")], ["center", t("picture.position.centered")], ["bottom", t("picture.sides.bottom")]], vOffset, setVOffset, vTov, setVTov as (s: never) => void, VERTICAAL)}
      <fieldset>
        <legend>{t("picture.position.distance")}</legend>
        <div className="tw-raster2">
          {(
            [
              ["distTop", "top"],
              ["distBottom", "bottom"],
              ["distLeft", "left"],
              ["distRight", "right"],
            ] as const
          ).map(([k, n]) => (
            <Maatveld key={k} label={t(`picture.sides.${n}`)} waarde={afst[k]} wijzig={(v) => setAfst({ ...afst, [k]: v })} />
          ))}
        </div>
      </fieldset>
    </Dialoog>
  );
}
