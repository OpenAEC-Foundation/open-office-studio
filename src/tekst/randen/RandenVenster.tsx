import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../../i18n/opmaak";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import type { AlineaOpmaak, RandZijde } from "../opmaak";
import { GetalVeld, Keuze, KleurVeld, Sectie, Tabbladen } from "../velden";
import {
  arceringNaarModel,
  cssRand,
  metInstelling,
  metZijde,
  patroonNamen,
  randDiktes,
  randenNaarModel,
  randStijlen,
  zijdeNamen,
  type ArceringFormulier,
  type Instelling,
  type RandFormulier,
} from "./model";
import type { PaginaRand, PaginaRandWeergave } from "./pagina";

export type RandenTab = "randen" | "pagina" | "arcering";

export interface RandenBegin {
  alinea: RandFormulier;
  arcering: ArceringFormulier;
  pagina: RandFormulier;
  paginaWeergave: PaginaRandWeergave;
  paginakleur: string | null;
}

export interface RandenWijziging {
  alinea: AlineaOpmaak;
  pagina?: { rand?: PaginaRand | null; kleur?: string | null };
}

const gelijk = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Wat er in het venster veranderd is: alinea via de engine, pagina via het pakket. */
export function randenWijziging(begin: RandenBegin, nu: RandenBegin): RandenWijziging {
  const alinea: AlineaOpmaak = {};
  if (!gelijk(begin.alinea, nu.alinea)) alinea.borders = randenNaarModel(nu.alinea);
  if (!gelijk(begin.arcering, nu.arcering)) alinea.shading = arceringNaarModel(nu.arcering);
  const pagina: RandenWijziging["pagina"] = {};
  if (!gelijk(begin.pagina, nu.pagina) || begin.paginaWeergave !== nu.paginaWeergave) {
    const zijden = randenNaarModel(nu.pagina, ["top", "left", "bottom", "right"]);
    pagina.rand = zijden ? { ...zijden, display: nu.paginaWeergave, offsetFrom: "page" } : null;
  }
  if (begin.paginakleur !== nu.paginakleur) pagina.kleur = nu.paginakleur;
  return { alinea, pagina: Object.keys(pagina).length ? pagina : undefined };
}

/** Instellingen met de i18n-sleutel (namespace writer). */
const instellingNamen: readonly (readonly [Instelling, string])[] = [
  ["geen", "borders.setting.none"],
  ["kader", "borders.setting.box"],
  ["schaduw", "borders.setting.shadow"],
  ["aangepast", "borders.setting.custom"],
];

function RandBewerker({
  f,
  zet,
  zijden,
  afstandMax,
}: {
  f: RandFormulier;
  zet: (f: RandFormulier) => void;
  zijden: readonly RandZijde[];
  afstandMax: number;
}) {
  const { t } = useTranslation("writer");
  const { getal } = useOpmaak();
  const knop = (zijde: RandZijde) => (
    <button
      key={zijde}
      type="button"
      className="werkruimte-knop"
      aria-pressed={f.zijden[zijde]}
      onClick={() => zet(metZijde(f, zijde))}
    >
      {t(zijdeNamen[zijde])}
    </button>
  );
  const rand = cssRand(f);
  return (
    <>
      <Sectie titel={t("borders.border")}>
        <Keuze label={t("borders.settingLabel")} waarde={f.instelling} opties={instellingNamen.map(([w, k]) => [w, t(k)] as const)} wijzig={(w) => zet(metInstelling(f, w))} />
        <Keuze label={t("borders.styleLabel")} waarde={f.stijl} opties={randStijlen.map(([w, k]) => [w, t(k)] as const)} wijzig={(w) => zet({ ...f, stijl: w })} />
        <KleurVeld label={t("borders.color")} automatisch={t("borders.automatic")} waarde={f.kleur} wijzig={(w) => zet({ ...f, kleur: w })} />
        <Keuze
          label={t("borders.width")}
          waarde={String(f.dikte)}
          opties={randDiktes.map((d) => [String(d), `${getal(d)} pt`] as const)}
          wijzig={(w) => zet({ ...f, dikte: Number(w) })}
        />
        <GetalVeld label={t("borders.distanceFromText")} eenheid="pt" stap={1} decimalen={0} min={0} max={afstandMax} waarde={f.afstand} wijzig={(w) => zet({ ...f, afstand: w ?? 0 })} />
      </Sectie>
      <div className="tekstopmaak-zijden" aria-label={t("borders.sides")}>
        <span />
        {knop("top")}
        <span />
        {knop("left")}
        <div
          className="vlak"
          aria-hidden="true"
          style={{
            borderTop: f.zijden.top ? rand : "1px dashed #ccc",
            borderBottom: f.zijden.bottom ? rand : "1px dashed #ccc",
            borderLeft: f.zijden.left ? rand : "1px dashed #ccc",
            borderRight: f.zijden.right ? rand : "1px dashed #ccc",
            boxShadow: f.instelling === "schaduw" ? "3px 3px 0 #888" : undefined,
          }}
        >
          {t("borders.sample")}
          {zijden.includes("between") && (
            <div style={{ borderTop: f.zijden.between ? rand : "1px dashed #ccc", marginTop: 6, paddingTop: 6 }}>
              {t("borders.sampleNext")}
            </div>
          )}
        </div>
        {knop("right")}
        <span />
        {knop("bottom")}
        {zijden.includes("between") ? knop("between") : <span />}
      </div>
    </>
  );
}

export function RandenVenster({
  begin,
  tab: beginTab,
  paginaBeschikbaar,
  toepassen,
  sluit,
}: {
  begin: RandenBegin;
  tab: RandenTab;
  /** Zonder herlaadfunctie kunnen paginarand en paginakleur niet. */
  paginaBeschikbaar: boolean;
  toepassen: (wijziging: RandenWijziging) => void;
  sluit: () => void;
}) {
  const { t } = useTranslation(["writer", "common"]);
  const [tab, setTab] = useState<RandenTab>(beginTab);
  const [nu, setNu] = useState(begin);
  const wijziging = randenWijziging(begin, nu);
  const iets = Object.keys(wijziging.alinea).length > 0 || !!wijziging.pagina;
  return (
    <Dialoog
      titel={t("borders.title")}
      sluit={sluit}
      className="tekstopmaak"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={() => (iets ? toepassen(wijziging) : sluit())}>
            {t("common:ok")}
          </button>
        </>
      }
    >
      <Tabbladen
        tabs={[
          ["randen", t("borders.tabBorders")],
          ["pagina", t("borders.tabPage")],
          ["arcering", t("borders.tabShading")],
        ]}
        actief={tab}
        kies={setTab}
      >
        {tab === "randen" && (
          <RandBewerker f={nu.alinea} zet={(alinea) => setNu({ ...nu, alinea })} zijden={["top", "bottom", "left", "right", "between"]} afstandMax={31} />
        )}
        {tab === "arcering" && (
          <>
            <Sectie titel={t("borders.fill")}>
              <KleurVeld label={t("borders.fillColor")} automatisch={t("borders.noFill")} waarde={nu.arcering.opvulling} wijzig={(w) => setNu({ ...nu, arcering: { ...nu.arcering, opvulling: w } })} />
              <Keuze label={t("borders.patternLabel")} waarde={nu.arcering.patroon} opties={patroonNamen.map(([w, k]) => [w, t(k)] as const)} wijzig={(w) => setNu({ ...nu, arcering: { ...nu.arcering, patroon: w } })} />
              {nu.arcering.patroon !== "clear" && (
                <KleurVeld label={t("borders.patternColor")} automatisch={t("borders.automatic")} waarde={nu.arcering.patroonKleur} wijzig={(w) => setNu({ ...nu, arcering: { ...nu.arcering, patroonKleur: w } })} />
              )}
            </Sectie>
            <div
              className="tekstopmaak-voorbeeld"
              aria-hidden="true"
              style={{ background: nu.arcering.opvulling ? `#${nu.arcering.opvulling}` : "#fff" }}
            >
              {t("borders.shadingSample")}
            </div>
          </>
        )}
        {tab === "pagina" &&
          (paginaBeschikbaar ? (
            <>
              <p className="tekstopmaak-melding">{t("borders.pageNotice")}</p>
              <RandBewerker f={nu.pagina} zet={(pagina) => setNu({ ...nu, pagina })} zijden={["top", "bottom", "left", "right"]} afstandMax={31} />
              <Sectie titel={t("borders.page")}>
                <Keuze<PaginaRandWeergave>
                  label={t("borders.applyTo")}
                  waarde={nu.paginaWeergave}
                  opties={[
                    ["allPages", t("borders.allPages")],
                    ["firstPage", t("borders.firstPageOnly")],
                    ["notFirstPage", t("borders.allButFirst")],
                  ]}
                  wijzig={(w) => setNu({ ...nu, paginaWeergave: w })}
                />
                <KleurVeld label={t("borders.pageColor")} automatisch={t("borders.noColor")} waarde={nu.paginakleur} wijzig={(w) => setNu({ ...nu, paginakleur: w })} />
              </Sectie>
            </>
          ) : (
            <p className="tekstopmaak-melding">{t("borders.pageNotAvailable")}</p>
          ))}
      </Tabbladen>
    </Dialoog>
  );
}
