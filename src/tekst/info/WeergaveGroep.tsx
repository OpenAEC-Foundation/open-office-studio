import { BookOpen, FileText, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Actie, Groep } from "../../Ribbon";
import { useTekstExtra } from "./winkel";
import { wijzigInstellingen } from "../../instellingen";
import { useDocumentWeergave } from "./documentWeergave";

/** Lintgroep ‘Weergaven’ (Beeld): afdrukweergave en leesmodus. */
export function WeergaveGroep() {
  const extra = useTekstExtra();
  const { t } = useTranslation("writer");
  const { t: ts } = useTranslation("settings");
  const { donker } = useDocumentWeergave();
  return (
    <Groep naam={t("info.views.group")}>
      <Actie
        naam={t("info.views.printLayout")}
        icoon={FileText}
        groot
        actief={extra?.weergave !== "lees"}
        onClick={() => extra?.zetWeergave("afdruk")}
      />
      <Actie
        naam={t("info.views.readMode")}
        icoon={BookOpen}
        groot
        actief={extra?.weergave === "lees"}
        title={t("info.views.readModeTipEsc")}
        onClick={() => extra?.zetWeergave("lees")}
      />
      <Actie
        naam={ts("appearance.documentViewOptions.donker")}
        title={ts("appearance.documentViewHelp")}
        icoon={Moon}
        groot
        actief={donker}
        onClick={() => wijzigInstellingen({ tekst: { documentWeergave: donker ? "papier" : "donker" } })}
      />
    </Groep>
  );
}
