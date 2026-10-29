import { useContext, useId, useMemo, useState } from "react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { useTranslation } from "react-i18next";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { DocumentLettertypen } from "../../lettertypen/context";
import { lettertypeGroepen, recenteLettertypen } from "../../lettertypen/LettertypeKeuze";
import { bekendeSysteemLettertypen } from "../../lettertypen/systeem";
import type { TekenOpmaak } from "../opmaak";
import { GetalVeld, Keuze, KleurVeld, Sectie, Tabbladen, Vink } from "../velden";
import {
  metEffect,
  onderstrepingNamen,
  stijlNamen,
  voorbeeldStijl,
  wijzigingUit,
  type Hoogte,
  type LettertypeFormulier,
  type Richting,
} from "./model";

type Tab = "lettertype" | "geavanceerd";

function FamilieKeuze({ waarde, wijzig }: { waarde: string; wijzig: (familie: string) => void }) {
  const { t } = useTranslation("writer");
  const id = useId();
  const engine = useDocxCommand("fontFamily").state.options?.map((o) => o.label) ?? [];
  const document = useContext(DocumentLettertypen);
  const groepen = useMemo(
    () =>
      lettertypeGroepen({
        document: [waarde, ...document],
        recent: recenteLettertypen(),
        engine,
        systeem: bekendeSysteemLettertypen(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, engine.length],
  );
  return (
    <div className="tekstopmaak-veld">
      <label htmlFor={id}>{t("font.font")}</label>
      <select id={id} value={waarde} onChange={(e) => wijzig(e.target.value)} data-autofocus>
        {groepen.map((g) => (
          <optgroup key={g.naam} label={g.naam}>
            {g.regels.map((r) => (
              <option key={`${g.naam}:${r.familie}`} value={r.familie} style={{ fontFamily: `"${r.familie}"` }}>
                {r.familie}
                {r.vervanger ? ` (→ ${r.vervanger})` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export function LettertypeVenster({
  begin,
  voorbeeldTekst,
  toepassen,
  sluit,
}: {
  begin: LettertypeFormulier;
  voorbeeldTekst: string;
  toepassen: (wijziging: TekenOpmaak) => void;
  sluit: () => void;
}) {
  const { t } = useTranslation(["writer", "common"]);
  const [tab, setTab] = useState<Tab>("lettertype");
  const [f, setF] = useState(begin);
  const zet = <K extends keyof LettertypeFormulier>(k: K, w: LettertypeFormulier[K]) => setF((o) => ({ ...o, [k]: w }));
  const effect = (k: keyof LettertypeFormulier) => (aan: boolean) => setF((o) => metEffect(o, k, aan));
  const wijziging = wijzigingUit(begin, f);
  return (
    <Dialoog
      titel={t("font.title")}
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
            onClick={() => (Object.keys(wijziging).length ? toepassen(wijziging) : sluit())}
          >
            {t("common:ok")}
          </button>
        </>
      }
    >
      <Tabbladen
        tabs={[
          ["lettertype", t("font.tabFont")],
          ["geavanceerd", t("font.tabAdvanced")],
        ]}
        actief={tab}
        kies={setTab}
      >
        {tab === "lettertype" ? (
          <>
            <Sectie titel={t("font.font")}>
              <FamilieKeuze waarde={f.familie} wijzig={(w) => zet("familie", w)} />
              <Keuze label={t("font.styleLabel")} waarde={f.stijl} opties={stijlNamen.map(([w, k]) => [w, t(k)] as const)} wijzig={(w) => zet("stijl", w)} />
              <GetalVeld label={t("font.size")} eenheid="pt" stap={1} decimalen={1} min={1} max={1638} waarde={f.grootte} wijzig={(w) => zet("grootte", w ?? 11)} />
              <KleurVeld label={t("font.color")} automatisch={t("font.automatic")} waarde={f.kleur} wijzig={(w) => zet("kleur", w)} />
              <Keuze label={t("font.underlineLabel")} waarde={f.onderstreping} opties={onderstrepingNamen.map(([w, k]) => [w, t(k)] as const)} wijzig={(w) => zet("onderstreping", w)} />
              {f.onderstreping !== "geen" && (
                <KleurVeld label={t("font.underlineColor")} automatisch={t("font.automatic")} waarde={f.onderstrepingKleur} wijzig={(w) => zet("onderstrepingKleur", w)} />
              )}
            </Sectie>
            <Sectie titel={t("font.effects")}>
              <Vink label={t("font.strikethrough")} waarde={f.doorhalen} wijzig={effect("doorhalen")} />
              <Vink label={t("font.doubleStrikethrough")} waarde={f.dubbelDoorhalen} wijzig={effect("dubbelDoorhalen")} />
              <Vink label={t("font.superscript")} waarde={f.superscript} wijzig={effect("superscript")} />
              <Vink label={t("font.subscript")} waarde={f.subscript} wijzig={effect("subscript")} />
              <Vink label={t("font.smallCaps")} waarde={f.kleinkapitalen} wijzig={effect("kleinkapitalen")} />
              <Vink label={t("font.allCaps")} waarde={f.hoofdletters} wijzig={effect("hoofdletters")} />
              <Vink label={t("font.hidden")} waarde={f.verborgen} wijzig={effect("verborgen")} />
            </Sectie>
          </>
        ) : (
          <Sectie titel={t("font.characterSpacing")}>
            <GetalVeld label={t("font.scale")} eenheid="%" stap={10} decimalen={0} min={1} max={600} waarde={f.schaal} wijzig={(w) => zet("schaal", w ?? 100)} />
            <Keuze<Richting>
              label={t("font.spacing")}
              waarde={f.afstand}
              opties={[
                ["normaal", t("font.spacingNormal")],
                ["breder", t("font.spacingExpanded")],
                ["smaller", t("font.spacingCondensed")],
              ]}
              wijzig={(w) => zet("afstand", w)}
            />
            <GetalVeld label={t("font.by")} eenheid="pt" stap={0.1} decimalen={2} min={0} max={1584} uit={f.afstand === "normaal"} waarde={f.afstandPt} wijzig={(w) => zet("afstandPt", w ?? 0)} />
            <Keuze<Hoogte>
              label={t("font.position")}
              waarde={f.positie}
              opties={[
                ["normaal", t("font.positionNormal")],
                ["verhoogd", t("font.positionRaised")],
                ["verlaagd", t("font.positionLowered")],
              ]}
              wijzig={(w) => zet("positie", w)}
            />
            <GetalVeld label={t("font.by")} eenheid="pt" stap={0.5} decimalen={1} min={0} max={1584} uit={f.positie === "normaal"} waarde={f.positiePt} wijzig={(w) => zet("positiePt", w ?? 0)} />
            <Vink label={t("font.kerning")} waarde={f.spatieren} wijzig={(w) => zet("spatieren", w)} />
            <GetalVeld label={t("font.kerningFrom")} eenheid="pt" stap={1} decimalen={1} min={1} max={1638} uit={!f.spatieren} waarde={f.spatierenVanaf} wijzig={(w) => zet("spatierenVanaf", w ?? 11)} />
          </Sectie>
        )}
      </Tabbladen>
      <p className="tekstopmaak-voorbeeld-titel">{t("font.preview")}</p>
      <div className="tekstopmaak-voorbeeld tekstopmaak-lettervoorbeeld" aria-hidden="true">
        <span style={voorbeeldStijl(f)}>{voorbeeldTekst || f.familie}</span>
      </div>
    </Dialoog>
  );
}
