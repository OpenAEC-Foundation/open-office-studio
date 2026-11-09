import { useContext, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { PanelBottom } from "lucide-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { DiaKnop, huidigeIndex } from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import { leesWeergave } from "./weergave";
import {
  diaKeuze,
  leesVoetteksten,
  schrijfVoetteksten,
  VoettekstFout,
  type Voetteksten,
} from "./voetteksten";
import "./voetteksten.css";

interface Begin {
  opties: Voetteksten;
  index: number;
  aantal: number;
  selectie: number[];
}

/** De bediening staat los van het gedeelde presentatie-lint (#87). */
export function DiaVoetteksten() {
  const { t, i18n } = useTranslation("presentation");
  const { presentatie: api, herlaad } = useEditorApi();
  const meld = useContext(RibbonFout);
  const bewerkbaar = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const [begin, setBegin] = useState<Begin | null>(null),
    [laden, setLaden] = useState(false);
  const fout = (e: unknown) =>
    e instanceof VoettekstFout && e.code === "invalidSelection"
      ? t("footers.invalidSelection")
      : e instanceof VoettekstFout && e.code === "noSlides"
        ? t("print.noSlides")
        : t("sorter.packageFailed");
  async function openen() {
    if (!api || !herlaad || !bewerkbaar || laden) return;
    setLaden(true);
    try {
      const index = huidigeIndex(),
        bytes = await herlaad.bytes();
      const opties = leesVoetteksten(bytes, index);
      if (!opties.datum) opties.automatisch = true;
      if (!opties.datumTekst)
        opties.datumTekst = new Intl.DateTimeFormat(i18n.language).format(
          new Date(),
        );
      setBegin({
        opties,
        index,
        aantal: api.handle.snapshot().slides.length,
        selectie: leesWeergave(herlaad ?? api).selectie,
      });
    } catch (e) {
      meld(fout(e));
    } finally {
      setLaden(false);
    }
  }
  return (
    <>
      <DiaKnop
        naam={t("footers.title")}
        icoon={PanelBottom}
        uit={!bewerkbaar || !herlaad || laden}
        onClick={() => void openen()}
      />
      {begin && (
        <VoettekstVenster
          begin={begin}
          sluit={() => setBegin(null)}
          opslaan={async (opties, selectie) => {
            if (
              !herlaad ||
              !api ||
              !api.commands.getState("insertSlide").enabled
            )
              throw new VoettekstFout("invalidPresentation");
            const actueel = await herlaad.bytes();
            const bytes = schrijfVoetteksten(
              actueel,
              selectie,
              opties,
              new Date(),
              i18n.language,
            );
            setBegin(null);
            herlaad.vervang(bytes, { dia: begin.index });
          }}
          fout={fout}
        />
      )}
    </>
  );
}

function VoettekstVenster({
  begin,
  sluit,
  opslaan,
  fout,
}: {
  begin: Begin;
  sluit: () => void;
  opslaan: (opties: Voetteksten, selectie: number[]) => Promise<void>;
  fout: (e: unknown) => string;
}) {
  const { t } = useTranslation("presentation");
  const [opties, zet] = useState(begin.opties);
  const [doel, setDoel] = useState<"huidig" | "alle" | "keuze">(
    begin.selectie.length > 1 ? "keuze" : "huidig",
  );
  const [keuze, setKeuze] = useState(
    (begin.selectie.length ? begin.selectie : [begin.index])
      .map((i) => i + 1)
      .join(", "),
  );
  const [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  const wijzig = <K extends keyof Voetteksten>(
    key: K,
    waarde: Voetteksten[K],
  ) => zet((o) => ({ ...o, [key]: waarde }));
  async function toepassen() {
    setBezig(true);
    setMelding("");
    try {
      const selectie =
        doel === "huidig"
          ? [begin.index]
          : doel === "alle"
            ? Array.from({ length: begin.aantal }, (_, i) => i)
            : diaKeuze(keuze, begin.aantal);
      await opslaan(opties, selectie);
    } catch (e) {
      setMelding(fout(e));
    } finally {
      setBezig(false);
    }
  }
  return (
    <Dialoog
      titel={t("footers.title")}
      sluit={() => {
        if (!bezig) sluit();
      }}
      className="presentatie-voettekst"
      acties={
        <>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={bezig}
            onClick={sluit}
          >
            {t("common:cancel")}
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            disabled={bezig}
            onClick={() => void toepassen()}
          >
            {t(bezig ? "footers.applying" : "footers.apply")}
          </button>
        </>
      }
    >
      <fieldset
        disabled={bezig}
        style={{ border: 0, padding: 0, display: "grid", gap: 14 }}
      >
        <label className="werkruimte-vink">
          <input
            type="checkbox"
            checked={opties.dianummer}
            onChange={(e) => wijzig("dianummer", e.target.checked)}
          />
          {t("footers.slideNumber")}
        </label>
        <div>
          <label className="werkruimte-vink">
            <input
              type="checkbox"
              checked={opties.datum}
              onChange={(e) => wijzig("datum", e.target.checked)}
            />
            {t("footers.date")}
          </label>
          <div
            className="werkruimte-keuzes"
            role="radiogroup"
            aria-label={t("footers.dateKind")}
          >
            <label>
              <input
                type="radio"
                name="footer-date"
                disabled={!opties.datum}
                checked={opties.automatisch}
                onChange={() => wijzig("automatisch", true)}
              />
              {t("footers.automatic")}
            </label>
            <label>
              <input
                type="radio"
                name="footer-date"
                disabled={!opties.datum}
                checked={!opties.automatisch}
                onChange={() => wijzig("automatisch", false)}
              />
              {t("footers.fixed")}
            </label>
          </div>
          <p className="werkruimte-uitleg">{t("footers.automaticHint")}</p>
          <label className="werkruimte-veld">
            <span>{t("footers.dateText")}</span>
            <input
              type="text"
              value={opties.datumTekst}
              disabled={!opties.datum || opties.automatisch}
              onChange={(e) => wijzig("datumTekst", e.target.value)}
            />
          </label>
        </div>
        <div>
          <label className="werkruimte-vink">
            <input
              type="checkbox"
              checked={opties.voettekst}
              onChange={(e) => wijzig("voettekst", e.target.checked)}
            />
            {t("footers.footer")}
          </label>
          <label className="werkruimte-veld">
            <span>{t("footers.footerText")}</span>
            <textarea
              rows={2}
              value={opties.tekst}
              disabled={!opties.voettekst}
              onChange={(e) => wijzig("tekst", e.target.value)}
            />
          </label>
        </div>
        <label className="werkruimte-vink">
          <input
            type="checkbox"
            checked={opties.nietOpTitel}
            onChange={(e) => wijzig("nietOpTitel", e.target.checked)}
          />
          {t("footers.hideOnTitle")}
        </label>
        <fieldset>
          <legend>{t("footers.scope")}</legend>
          <div className="werkruimte-keuzes">
            <label>
              <input
                type="radio"
                name="footer-scope"
                checked={doel === "huidig"}
                onChange={() => setDoel("huidig")}
              />
              {t("footers.current", { number: begin.index + 1 })}
            </label>
            <label>
              <input
                type="radio"
                name="footer-scope"
                checked={doel === "alle"}
                onChange={() => setDoel("alle")}
              />
              {t("footers.all")}
            </label>
            <label>
              <input
                type="radio"
                name="footer-scope"
                checked={doel === "keuze"}
                onChange={() => setDoel("keuze")}
              />
              {t("footers.selected")}
            </label>
          </div>
          <label className="werkruimte-veld">
            <span>{t("footers.slideRange")}</span>
            <input
              type="text"
              disabled={doel !== "keuze"}
              value={keuze}
              onChange={(e) => { setKeuze(e.target.value); setMelding(""); }}
              placeholder={t("footers.rangeExample")}
            />
          </label>
        </fieldset>
      </fieldset>
      <p className="werkruimte-uitleg">{t("sorter.reloadHint")}</p>
      {melding && (
        <p className="werkruimte-fout" role="alert">
          {melding}
        </p>
      )}
    </Dialoog>
  );
}
