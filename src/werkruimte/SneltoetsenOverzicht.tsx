import { useMemo, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/config";
import { formatLijst, useOpmaak } from "../i18n/opmaak";
import { Dialoog } from "./Dialoog";
import { useInstellingen } from "../instellingen";
import { heeftOpdracht, volgOpdrachten } from "../tekst/menu/opdrachten";
import {
  alleSneltoetsen,
  geldtIn,
  inProfiel,
  moduleNamen,
  profielNamen,
  registratieVersie,
  toetsDelen,
  volgRegistraties,
  zoekSneltoetsen,
  type SneltoetsInfo,
  type SneltoetsModule,
} from "../lint/sneltoetsenlijst";

const volgorde: SneltoetsModule[] = [
  "algemeen",
  "tekst",
  "rekenblad",
  "presentatie",
  "database",
  "email",
  "notities",
];

/**
 * Modulenaam in de interfacetaal. De lijst in src/lint blijft Nederlands;
 * die naam is alleen de terugval.
 */
export function sneltoetsModuleNaam(module: SneltoetsModule) {
  return module === "algemeen"
    ? i18next.t("workspace:shortcuts.general", { defaultValue: moduleNamen.algemeen })
    : i18next.t(`common:modules.${module}`, { defaultValue: moduleNamen[module] });
}

/** Modules als opsomming volgens de taal: "Tekst, Rekenblad". */
const moduleLijst = (modules: readonly SneltoetsModule[]) =>
  formatLijst(modules.map(sneltoetsModuleNaam), { type: "unit", style: "short" });

/** Secties voor het overzicht: de actieve module eerst, dan Algemeen, dan de rest. */
export function sneltoetsSecties(
  lijst: readonly SneltoetsInfo[],
  module: SneltoetsModule | null,
) {
  const eerst = module && module !== "algemeen" ? [module, "algemeen" as const] : ["algemeen" as const];
  const modules = [...eerst, ...volgorde.filter((m) => !eerst.includes(m as never))];
  return modules
    .map((m) => ({
      module: m,
      naam: sneltoetsModuleNaam(m),
      toetsen: lijst.filter((info) => info.module === m),
    }))
    .filter((sectie) => sectie.toetsen.length > 0);
}

export function Toets({ toets }: { toets: string }) {
  const delen = toetsDelen(toets);
  return (
    <span className="werkruimte-toets">
      {delen.map((deel, i) => (
        <kbd key={i}>{deel}</kbd>
      ))}
    </span>
  );
}

export function SneltoetsenOverzicht({
  module,
  sluit,
}: {
  module: SneltoetsModule | null;
  sluit: () => void;
}) {
  const { t } = useTranslation("workspace");
  const { taal, getal } = useOpmaak();
  const [zoek, setZoek] = useState("");
  const versie = useSyncExternalStore(volgRegistraties, registratieVersie);
  // Aangemelde opdrachten (bijv. het filter van Rekenblad): een toets wordt dan beschikbaar.
  const opdrachten = useSyncExternalStore(volgOpdrachten, () =>
    alleSneltoetsen()
      .map((i) => (i.opdracht && heeftOpdracht(i.opdracht) ? i.opdracht : ""))
      .join("|"),
  );
  // Tekst: alleen het gekozen sneltoetsprofiel (instellingen).
  const profiel = useInstellingen().tekst.sneltoetsprofiel;
  const secties = useMemo(
    () =>
      sneltoetsSecties(
        zoekSneltoetsen(alleSneltoetsen(), zoek).filter((info) => inProfiel(info, profiel)),
        module,
      ),
    // taal: de sectienamen volgen de interfacetaal.
    [zoek, module, versie, profiel, taal, opdrachten],
  );
  const aantal = secties.reduce((som, s) => som + s.toetsen.length, 0);
  return (
    <Dialoog titel={t("common:shortcuts")} sluit={sluit} className="werkruimte-sneltoetsen">
      <label className="werkruimte-zoek">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          data-autofocus
          value={zoek}
          onChange={(event) => setZoek(event.target.value)}
          placeholder={t("shortcuts.searchPlaceholder")}
          aria-label={t("shortcuts.searchLabel")}
          aria-describedby="sneltoetsen-aantal"
        />
      </label>
      <p id="sneltoetsen-aantal" className="werkruimte-aantal" role="status">
        {aantal === 0
          ? t("shortcuts.noResults")
          : t("shortcuts.count", { count: aantal, shortcuts: getal(aantal) })}
      </p>
      <div className="werkruimte-sneltoetslijst">
        {secties.map((sectie) => (
          <section key={sectie.module} aria-labelledby={`sneltoetsen-${sectie.module}`}>
            <h3 id={`sneltoetsen-${sectie.module}`}>
              {sectie.naam}
              {sectie.module === module && <small> · {t("shortcuts.currentModule")}</small>}
              {sectie.module === "tekst" && <small>
                  {" · "}
                  {t("shortcuts.profile", {
                    profile: t(`settings:editing.profiles.${profiel}`, {
                      defaultValue: profielNamen[profiel],
                    }),
                  })}
                </small>}
            </h3>
            <table>
              <thead className="werkruimte-verborgen">
                <tr>
                  <th scope="col">{t("shortcuts.command")}</th>
                  <th scope="col">{t("shortcuts.key")}</th>
                </tr>
              </thead>
              <tbody>
                {sectie.toetsen.map((info) => (
                  <tr
                    key={`${info.module}-${info.toets}`}
                    data-elders={module && sectie.module === "algemeen" && !geldtIn(info, module) ? "" : undefined}
                    data-uit={info.opdracht && !heeftOpdracht(info.opdracht) ? "" : undefined}
                  >
                    <td>
                      {info.omschrijving}
                      {info.opdracht && !heeftOpdracht(info.opdracht) && (
                        <small>
                          {" · "}
                          {t("shortcuts.unavailable")}
                        </small>
                      )}
                      {info.alleen && (
                        <small>
                          {" · "}
                          {t("shortcuts.onlyIn", { modules: moduleLijst(info.alleen) })}
                        </small>
                      )}
                      {info.behalve && (
                        <small>
                          {" · "}
                          {t("shortcuts.notIn", { modules: moduleLijst(info.behalve) })}
                        </small>
                      )}
                    </td>
                    <td>
                      <Toets toets={info.toets} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <p className="werkruimte-voetnoot">
        {t("shortcuts.footnote")}
      </p>
    </Dialoog>
  );
}
