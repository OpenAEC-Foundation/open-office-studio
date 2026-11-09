import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ListChecks, CircleAlert, CircleOff } from "lucide-react";
import { Groep, Actie, RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { alleenLezen } from "../lint/rekenblad-opdrachten";
import { openRekenbladVenster } from "./RekenbladExtra";
import { omcirkelOngeldig } from "./ValidatieUi";

export function ValidatieGroep() {
  const { t } = useTranslation("spreadsheet"),
    { rekenblad: api } = useEditorApi(),
    meld = useContext(RibbonFout);
  return (
    <Groep naam={t("validation.title")}>
      <Actie
        naam={t("validation.title")}
        icoon={ListChecks}
        groot
        disabled={!api || alleenLezen(api)}
        onClick={() => openRekenbladVenster({ soort: "validatie" })}
      />
      <div className="ribbon-stapel">
        <Actie
          naam={t("validation.circle")}
          icoon={CircleAlert}
          disabled={!api}
          onClick={() => {
            try {
              if (api) omcirkelOngeldig(api);
            } catch (f) {
              meld(f instanceof Error ? f.message : String(f));
            }
          }}
        />
        <Actie
          naam={t("validation.clear")}
          icoon={CircleOff}
          disabled={!api}
          onClick={() => api && omcirkelOngeldig(api, true)}
        />
      </div>
    </Groep>
  );
}
