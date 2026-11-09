import { useContext, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { Sigma } from "lucide-react";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi } from "../../lint/editorApi";
import { RibbonFout } from "../../Ribbon";
import { Dialoog } from "../../werkruimte/Dialoog";
import { leesFormule, mathml } from "./model";
import { bewaarFormule, formuleDoel, type FormuleDoel } from "./opdrachten";

export function VergelijkingKnop() {
  const { t } = useTranslation("writer"), api = useEditorApi().tekst;
  const melding = useContext(RibbonFout);
  const { state } = useDocxCommand("insertImage");
  const [doel, setDoel] = useState<{ ref: DocxEditorRef; doel: FormuleDoel } | null>(null);
  return <>
    <EigenKnop naam={t("math.title")} icoon={Sigma} groot disabled={!state.enabled} onClick={() => {
      const ref = api();
      if (!ref || ref.commands.getState("editingMode").value === "suggesting") return melding(t("math.select"));
      try { setDoel({ ref, doel: formuleDoel(ref) }); }
      catch (e) { melding(t(e instanceof Error && e.message === "unsupported" ? "math.unsupported" : "math.select")); }
    }} />
    {doel && <VergelijkingDialoog refApi={doel.ref} doel={doel.doel} sluit={() => { setDoel(null); api()?.focus(); }} />}
  </>;
}

function VergelijkingDialoog({ refApi, doel, sluit }: { refApi: DocxEditorRef; doel: FormuleDoel; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const formId = useId();
  const [invoer, setInvoer] = useState(doel.invoer), [display, setDisplay] = useState(doel.display);
  const [melding, setMelding] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(() => { try { return mathml(leesFormule(invoer)); } catch { return null; } }, [invoer]);
  const voegIn = (tekst: string) => {
    const start = input.current?.selectionStart ?? invoer.length, end = input.current?.selectionEnd ?? start;
    setInvoer(invoer.slice(0, start) + tekst + invoer.slice(end));
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + tekst.length, start + tekst.length); });
  };
  return <Dialoog titel={t("math.title")} sluit={sluit} className="tw-venster is-breed" acties={<>
    <button type="button" className="werkruimte-knop" onClick={sluit}>{t("common:cancel")}</button>
    <button type="submit" form={formId} className="werkruimte-knop is-primair" disabled={!preview}>{t("common:apply")}</button>
  </>}>
    <form id={formId} onSubmit={e => {
      e.preventDefault();
      if (!preview || !refApi.commands.getState("insertImage").enabled) return;
      try { bewaarFormule(refApi, doel, invoer, display); sluit(); }
      catch (error) { setMelding(t(error instanceof Error && error.message === "changed" ? "math.changed" : "math.invalid")); }
    }}>
      <label className="werkruimte-veld"><span>{t("math.expression")}</span>
        <textarea ref={input} data-autofocus="" value={invoer} maxLength={2048} rows={3} onChange={e => setInvoer(e.target.value)} />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
        {[["a/b", "frac(a,b)"], ["x²", "sup(x,2)"], ["xᵢ", "sub(x,i)"], ["√x", "sqrt(x)"], ["α", "α"], ["β", "β"], ["π", "π"]].map(([label, code]) =>
          <button key={label} type="button" className="werkruimte-knop" title={code} onMouseDown={e => e.preventDefault()} onClick={() => voegIn(code)}>{label}</button>)}
      </div>
      <p><code>frac(a,b) · sup(x,2) · sub(x,i) · sqrt(x)</code></p>
      <p>{t("math.viewHint")}</p>
      <label className="werkruimte-veld"><span><input type="checkbox" checked={display} onChange={e => setDisplay(e.target.checked)} /> {t("math.block")}</span></label>
      <div aria-label={t("font.preview")} style={{ padding: 20, minHeight: 70, fontSize: 24 }} dangerouslySetInnerHTML={{ __html: preview ?? "" }} />
      <p role="status">{melding || (invoer && !preview ? t("math.invalid") : "")}</p>
    </form>
  </Dialoog>;
}
