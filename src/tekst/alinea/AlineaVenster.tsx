import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../../i18n/opmaak";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import type { EersteRegel, RegelSoort, Regelafstand } from "../eenheden";
import type { AlineaOpmaak } from "../opmaak";
import { GetalVeld, Keuze, Sectie, Tabbladen, Vink } from "../velden";
import {
  opvulNamen,
  tabUitlijningNamen,
  uitlijningNamen,
  volgendeTabPositie,
  wijzigingUit,
  type AlineaFormulier,
} from "./model";

export type AlineaTab = "afstand" | "einden" | "tabs";
type Tab = AlineaTab;

/** Speciale inspringing met de i18n-sleutel (namespace writer). */
const speciaalNamen: readonly (readonly [EersteRegel, string])[] = [
  ["geen", "paragraph.special.none"],
  ["eerste", "paragraph.special.firstLine"],
  ["verkeerd", "paragraph.special.hanging"],
];

/** Regelafstandsoorten (`RegelSoort`) met de i18n-sleutel (namespace writer). */
const regelSoortNamen: readonly (readonly [RegelSoort, string])[] = [
  ["enkel", "paragraph.lineSpacingRule.single"],
  ["anderhalf", "paragraph.lineSpacingRule.onePointFive"],
  ["dubbel", "paragraph.lineSpacingRule.double"],
  ["minimaal", "paragraph.lineSpacingRule.atLeast"],
  ["exact", "paragraph.lineSpacingRule.exactly"],
  ["meerdere", "paragraph.lineSpacingRule.multiple"],
];

function nieuweRegel(soort: RegelSoort, oud: Regelafstand): Regelafstand {
  switch (soort) {
    case "meerdere":
      return { soort, regels: oud.soort === "meerdere" ? oud.regels : 1.15 };
    case "minimaal":
    case "exact":
      return { soort, pt: "pt" in oud ? oud.pt : 12 };
    default:
      return { soort };
  }
}

/** Een verkleinde alinea tussen grijze buren, zoals het voorbeeld in Word. */
export function AlineaVoorbeeld({ f }: { f: AlineaFormulier }) {
  const { t } = useTranslation("writer");
  const schaal = 4; // px per cm in het voorbeeld
  const regel =
    f.regel.soort === "anderhalf"
      ? 1.5
      : f.regel.soort === "dubbel"
        ? 2
        : f.regel.soort === "meerdere"
          ? f.regel.regels
          : f.regel.soort === "enkel"
            ? 1.15
            : undefined;
  const eersteRegel = f.speciaal === "geen" ? 0 : (f.speciaal === "eerste" ? 1 : -1) * f.speciaalCm * schaal;
  return (
    <div className="tekstopmaak-voorbeeld" aria-hidden="true">
      <p className="grijs">{t("paragraph.sample.previous")}</p>
      <p
        style={{
          textAlign: f.uitlijning === "both" ? "justify" : f.uitlijning,
          marginLeft: Math.max(0, f.links * schaal + Math.max(0, -eersteRegel)),
          marginRight: Math.max(0, f.rechts * schaal),
          textIndent: eersteRegel,
          marginTop: Math.min(30, f.voor / 2),
          marginBottom: Math.min(30, f.na / 2),
          lineHeight: regel ?? (f.regel.soort !== "enkel" && "pt" in f.regel ? `${f.regel.pt / 1.3}px` : undefined),
        }}
      >
        {t("paragraph.sample.current")}
      </p>
      <p className="grijs">{t("paragraph.sample.next")}</p>
    </div>
  );
}

export function AlineaVenster({
  begin,
  tab: beginTab,
  meerdere,
  toepassen,
  sluit,
}: {
  begin: AlineaFormulier;
  /** Het tabblad bij het openen (dubbelklik op de liniaal opent ‘Tabs’). */
  tab?: AlineaTab;
  /** De selectie raakt meerdere alinea's: alleen gewijzigde velden gelden voor allemaal. */
  meerdere: boolean;
  toepassen: (wijziging: AlineaOpmaak) => void;
  sluit: () => void;
}) {
  const { t } = useTranslation(["writer", "common"]);
  const { getal } = useOpmaak();
  const opties = <T extends string>(lijst: readonly (readonly [T, string])[]) => lijst.map(([w, k]) => [w, t(k)] as const);
  const [tab, setTab] = useState<Tab>(beginTab ?? "afstand");
  const [f, setF] = useState(begin);
  const [nieuweTab, setNieuweTab] = useState(() => volgendeTabPositie(begin.tabs));
  const zet = <K extends keyof AlineaFormulier>(k: K, w: AlineaFormulier[K]) => setF((o) => ({ ...o, [k]: w }));
  const wijziging = wijzigingUit(begin, f);
  const leeg = Object.keys(wijziging).length === 0;
  return (
    <Dialoog
      titel={t("paragraph.title")}
      sluit={sluit}
      className="tekstopmaak"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            onClick={() => (leeg ? sluit() : toepassen(wijziging))}
          >
            {t("common:ok")}
          </button>
        </>
      }
    >
      {meerdere && (
        <p className="tekstopmaak-melding">{t("paragraph.multipleSelected")}</p>
      )}
      <Tabbladen
        tabs={[
          ["afstand", t("paragraph.tabIndents")],
          ["einden", t("paragraph.tabBreaks")],
          ["tabs", t("paragraph.tabTabs")],
        ]}
        actief={tab}
        kies={setTab}
      >
        {tab === "afstand" && (
          <>
            <Sectie titel={t("paragraph.general")}>
              <Keuze label={t("paragraph.alignmentLabel")} waarde={f.uitlijning} wijzig={(w) => zet("uitlijning", w)} opties={opties(uitlijningNamen)} />
            </Sectie>
            <Sectie titel={t("paragraph.indentation")}>
              <GetalVeld label={t("paragraph.left")} eenheid="cm" waarde={f.links} min={-20} max={50} wijzig={(w) => zet("links", w ?? 0)} />
              <GetalVeld label={t("paragraph.right")} eenheid="cm" waarde={f.rechts} min={-20} max={50} wijzig={(w) => zet("rechts", w ?? 0)} />
              <Keuze label={t("paragraph.specialLabel")} waarde={f.speciaal} wijzig={(w) => zet("speciaal", w)} opties={opties(speciaalNamen)} />
              <GetalVeld
                label={t("paragraph.by")}
                eenheid="cm"
                waarde={f.speciaalCm}
                min={0}
                max={50}
                uit={f.speciaal === "geen"}
                wijzig={(w) => zet("speciaalCm", w ?? 0)}
              />
            </Sectie>
            <Sectie titel={t("paragraph.spacing")}>
              <GetalVeld label={t("paragraph.before")} eenheid="pt" stap={6} decimalen={1} min={0} max={1584} waarde={f.voor} wijzig={(w) => zet("voor", w ?? 0)} />
              <GetalVeld label={t("paragraph.after")} eenheid="pt" stap={6} decimalen={1} min={0} max={1584} waarde={f.na} wijzig={(w) => zet("na", w ?? 0)} />
              <Keuze
                label={t("paragraph.lineSpacing")}
                waarde={f.regel.soort}
                wijzig={(s) => zet("regel", nieuweRegel(s, f.regel))}
                opties={opties(regelSoortNamen)}
              />
              {f.regel.soort === "meerdere" ? (
                <GetalVeld
                  label={t("paragraph.at")}
                  eenheid="×"
                  stap={0.25}
                  min={0.06}
                  max={132}
                  waarde={f.regel.regels}
                  wijzig={(w) => zet("regel", { soort: "meerdere", regels: w ?? 1 })}
                />
              ) : f.regel.soort === "minimaal" || f.regel.soort === "exact" ? (
                <GetalVeld
                  label={t("paragraph.at")}
                  eenheid="pt"
                  stap={1}
                  decimalen={1}
                  min={f.regel.soort === "exact" ? 0.7 : 0}
                  max={1584}
                  waarde={f.regel.pt}
                  wijzig={(w) => f.regel.soort !== "enkel" && zet("regel", { soort: f.regel.soort as "exact", pt: w ?? 12 })}
                />
              ) : (
                <span />
              )}
              <Vink
                label={t("paragraph.contextualSpacing")}
                waarde={f.contextueel}
                wijzig={(w) => zet("contextueel", w)}
              />
            </Sectie>
          </>
        )}
        {tab === "einden" && (
          <Sectie titel={t("paragraph.pagination")}>
            <Vink label={t("paragraph.widowControl")} waarde={f.zwevend} wijzig={(w) => zet("zwevend", w)} />
            <Vink label={t("paragraph.keepWithNext")} waarde={f.volgende} wijzig={(w) => zet("volgende", w)} />
            <Vink label={t("paragraph.keepLinesTogether")} waarde={f.bijeen} wijzig={(w) => zet("bijeen", w)} />
            <Vink label={t("paragraph.pageBreakBefore")} waarde={f.paginaEinde} wijzig={(w) => zet("paginaEinde", w)} />
          </Sectie>
        )}
        {tab === "tabs" && (
          <>
            <table className="tekstopmaak-tabel">
              <thead>
                <tr>
                  <th>{t("paragraph.tabs.position")}</th>
                  <th>{t("paragraph.alignmentLabel")}</th>
                  <th>{t("paragraph.tabs.leader")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.tabs.length === 0 && (
                  <tr>
                    <td colSpan={4}>{t("paragraph.tabs.none")}</td>
                  </tr>
                )}
                {f.tabs.map((tab, i) => {
                  const wijzigTab = (n: Partial<typeof tab>) =>
                    zet("tabs", f.tabs.map((x, j) => (j === i ? { ...x, ...n } : x)));
                  return (
                    <tr key={i}>
                      <td>
                        <GetalVeld label={t("paragraph.tabs.positionOf", { n: i + 1 })} eenheid="cm" min={0} max={55} waarde={tab.cm} wijzig={(w) => wijzigTab({ cm: w ?? 0 })} />
                      </td>
                      <td>
                        <Keuze label={t("paragraph.alignmentLabel")} waarde={tab.uitlijning} opties={opties(tabUitlijningNamen)} wijzig={(w) => wijzigTab({ uitlijning: w })} />
                      </td>
                      <td>
                        <Keuze label={t("paragraph.tabs.leader")} waarde={tab.opvul} opties={opties(opvulNamen)} wijzig={(w) => wijzigTab({ opvul: w })} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="werkruimte-knop"
                          aria-label={t("paragraph.tabs.remove", { position: `${getal(tab.cm)} cm` })}
                          onClick={() => zet("tabs", f.tabs.filter((_, j) => j !== i))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="tekstopmaak-rij">
              <GetalVeld label={t("paragraph.tabs.newAt")} eenheid="cm" min={0} max={55} waarde={nieuweTab} wijzig={(w) => setNieuweTab(w ?? 0)} />
              <button
                type="button"
                className="werkruimte-knop"
                onClick={() => {
                  const tabs = [...f.tabs.filter((x) => x.cm !== nieuweTab), { cm: nieuweTab, uitlijning: "left" as const, opvul: "none" as const }].sort(
                    (a, b) => a.cm - b.cm,
                  );
                  zet("tabs", tabs);
                  setNieuweTab(volgendeTabPositie(tabs));
                }}
              >
                <Plus size={14} /> {t("paragraph.tabs.add")}
              </button>
              <button type="button" className="werkruimte-knop" disabled={!f.tabs.length} onClick={() => zet("tabs", [])}>
                {t("paragraph.tabs.clearAll")}
              </button>
            </div>
          </>
        )}
      </Tabbladen>
      <p className="tekstopmaak-voorbeeld-titel">{t("paragraph.preview")}</p>
      <AlineaVoorbeeld f={f} />
    </Dialoog>
  );
}
