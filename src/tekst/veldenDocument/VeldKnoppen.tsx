import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Braces, RefreshCw } from "lucide-react";
import { useDocxCommand } from "@betteroffice/docx-react";
import type { YrsStoryRange } from "@betteroffice/docx/yrs";
import { RibbonFout } from "../../Ribbon";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi, zichtbaarElement, meldWijziging } from "../../lint/editorApi";
import { useSneltoetsen } from "../../lint/sneltoetsen";
import { Dialoog } from "../../werkruimte/Dialoog";
import { VELDEN, voegVeldIn, type VeldSoort } from "./model";
import { veldOmgeving, werkDocumentVeldenBij } from "./opdrachten";

export function VeldSneltoets() {
  const { t } = useTranslation("writer"), api = useEditorApi(), meld = useContext(RibbonFout);
  useSneltoetsen(() => {
    const actief = document.activeElement;
    return actief instanceof HTMLElement && actief.classList.contains("paged-editor__yrs-input") ? actief : zichtbaarElement<HTMLElement>(".office-tekst");
  }, [{ toets: "F9", omschrijving: t("fields.update"), uitvoeren: () => {
    const ref = api.tekst(); if (ref) void werkDocumentVeldenBij(ref).then(r => { if (r.onopgelost.length) meld(t("fields.unresolved", { count: r.onopgelost.length })); }).catch(e => meld(String(e)));
  } }], "tekst");
  return null;
}

export function VeldKnoppen() {
  const { t } = useTranslation(["writer", "common"]), api = useEditorApi(), meld = useContext(RibbonFout);
  const enabled = useDocxCommand("insertPageBreak").state.enabled;
  const [open, setOpen] = useState(false), [soort, setSoort] = useState<VeldSoort>("PAGE"), [patroon, setPatroon] = useState("yyyy-MM-dd");
  const [doel, setDoel] = useState<{ range: YrsStoryRange; versie: string } | null>(null), [fout, setFout] = useState("");
  const kan = enabled || !!zichtbaarElement(".office-tekst .hf-inline-editor");
  function toon() {
    const ed = api.tekst()?.getEditorRef(), s = ed?.getYrsSession(), r = ed?.getSelectionRange();
    const start = r ? ed?.displayPositionToYrsLoc(Math.min(r.from, r.to)) : null, end = r ? ed?.displayPositionToYrsLoc(Math.max(r.from, r.to)) : null;
    if (!s || !start || !end || start.story !== end.story) return meld(t("fields.cursor"));
    setDoel({ range: { story: start.story, start: { paraId: start.paraId, offset: start.offset }, end: { paraId: end.paraId, offset: end.offset } }, versie: s.version() }); setFout(""); setOpen(true);
  }
  function invoegen() {
    try {
      const ref = api.tekst(), ed = ref?.getEditorRef(), s = ed?.getYrsSession();
      if (!ref || !ed || !s || !doel || s.version() !== doel.versie) throw new Error(t("fields.stale"));
      voegVeldIn(s, doel.range, soort, veldOmgeving(ref), soort === "DATE" || soort === "TIME" ? patroon : undefined);
      ed.syncYrsInputState(true, [doel.range.story]); meldWijziging(ref); setOpen(false); ref.focus();
    } catch (e) { setFout(e instanceof Error ? e.message : String(e)); }
  }
  return <>
    <div className="ribbon-stapel">
      <EigenKnop naam={t("fields.insert")} icoon={Braces} disabled={!kan} onClick={toon}/>
      <EigenKnop naam={t("fields.update")} icoon={RefreshCw} sneltoets="F9" disabled={!api.tekst()} onClick={() => { const ref = api.tekst(); if (ref) void werkDocumentVeldenBij(ref).then(r => { if (r.onopgelost.length) meld(t("fields.unresolved", { count: r.onopgelost.length })); }).catch(e => meld(String(e))); }}/>
    </div>
    {open && <Dialoog titel={t("fields.title")} sluit={() => setOpen(false)} acties={<>
      <button type="button" className="werkruimte-knop" onClick={() => setOpen(false)}>{t("common:cancel")}</button>
      <button type="button" className="werkruimte-knop is-primair" onClick={invoegen}>{t("fields.insert")}</button>
    </>}>
      <label className="werkruimte-veld"><span>{t("fields.kind")}</span><select data-autofocus value={soort} onChange={e => { const s = e.target.value as VeldSoort; setSoort(s); if (s === "TIME") setPatroon("HH:mm"); if (s === "DATE") setPatroon("yyyy-MM-dd"); }}>{VELDEN.map(v => <option key={v} value={v}>{t(`fields.names.${v}`)} ({v})</option>)}</select></label>
      {(soort === "DATE" || soort === "TIME") && <label className="werkruimte-veld"><span>{t("fields.pattern")}</span><input value={patroon} maxLength={250} onChange={e => setPatroon(e.target.value)}/></label>}
      <p className="werkruimte-uitleg">{t("fields.hint")}</p>
      {fout && <p role="alert" className="werkruimte-fout">{fout}</p>}
    </Dialoog>}
  </>;
}
