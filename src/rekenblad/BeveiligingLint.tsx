import { useTranslation } from "react-i18next";
import { Lock, Sheet, Shield } from "lucide-react";
import { Groep, Actie } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { alleenLezen } from "../lint/rekenblad-opdrachten";
import { openRekenbladVenster } from "./RekenbladExtra";
export function BeveiligingGroep() {
  const { t } = useTranslation("spreadsheet"),
    { rekenblad: api } = useEditorApi();
  return (
    <Groep naam={t("protection.title")}>
      {(
        [
          ["blad", Sheet],
          ["werkmap", Shield],
          ["cellen", Lock],
        ] as const
      ).map(([soort, Icoon]) => (
        <Actie
          key={soort}
          naam={t(
            "protection." +
              { blad: "sheet", werkmap: "workbook", cellen: "cells" }[soort],
          )}
          icoon={Icoon}
          groot
          disabled={!api || alleenLezen(api)}
          onClick={() =>
            openRekenbladVenster({ soort: "beveiliging", beveiliging: soort })
          }
        />
      ))}
    </Groep>
  );
}
