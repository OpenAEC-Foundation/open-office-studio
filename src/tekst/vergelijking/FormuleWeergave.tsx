import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RibbonFout } from "../../Ribbon";
import { useEditorApi, useEditorZichtbaar } from "../../lint/editorApi";
import { werkFormuleWeergaveBij } from "./weergave";

export function FormuleWeergave() {
  const api = useEditorApi().tekst, zichtbaar = useEditorZichtbaar(), melding = useContext(RibbonFout), { t } = useTranslation("writer");
  useEffect(() => {
    if (!zichtbaar) return;
    let stop = false, timer: ReturnType<typeof setTimeout>, unsubscribe: (() => void) | undefined;
    let bezig = false, opnieuw = false;
    const werk = async () => {
      const ref = api(), s = ref?.getEditorRef()?.getYrsSession();
      if (!s || !ref) { if (!stop) timer = setTimeout(werk, 150); return; }
      if (!unsubscribe) unsubscribe = s.onUpdate(() => { if (bezig) opnieuw = true; else { clearTimeout(timer); timer = setTimeout(werk, 100); } });
      if (bezig || stop) return;
      bezig = true;
      try { await werkFormuleWeergaveBij(ref); }
      catch { if (!stop) melding(t("math.renderFailed")); }
      finally { bezig = false; if (opnieuw && !stop) { opnieuw = false; timer = setTimeout(werk, 100); } }
    };
    void werk();
    return () => { stop = true; clearTimeout(timer); unsubscribe?.(); };
  }, [api, zichtbaar, melding, t]);
  return null;
}
