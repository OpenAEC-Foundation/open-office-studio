import { useContext, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { Mails } from "lucide-react";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi } from "../../lint/editorApi";
import { RibbonFout } from "../../Ribbon";
import { Dialoog } from "../../werkruimte/Dialoog";
import { leesGegevens, SamenvoegFout, type Gegevens } from "./gegevens";
import { samenvoegVelden, voegRecordSamen } from "./pakket";
import { voegSamenvoegveldIn } from "./invoegen";

async function bewaarKopie(bytes: Uint8Array, naam: string): Promise<boolean> {
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<string | null>("bewaar_kopie", bytes, { headers: { "x-office-naam": encodeURIComponent(naam) } })) !== null;
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const link = document.createElement("a"); link.href = url; link.download = naam;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

export function SamenvoegenKnop() {
  const { t } = useTranslation("writer"), apis = useEditorApi(), meld = useContext(RibbonFout);
  const [data, setData] = useState<Gegevens | null>(null), [bron, setBron] = useState("");
  const [open, setOpen] = useState<{ ref: DocxEditorRef; bytes: Uint8Array; velden: string[] } | null>(null);
  const [bezig, setBezig] = useState(false);
  return <>
    <EigenKnop naam={t("mailMerge.title")} icoon={Mails} groot disabled={!apis.herlaad || bezig} onClick={() => {
      const ref = apis.tekst(), herlaad = apis.herlaad;
      if (!ref || !herlaad || bezig) return;
      const sessie = ref.getEditorRef()?.getYrsSession();
      if (!sessie) return;
      setBezig(true);
      void ref.flushPendingInput().then(() => herlaad.bytes()).then(bytes => {
        // De React-refwrapper kan door flushPendingInput veranderen; de
        // documentidentiteit is de onderliggende sessie.
        if (apis.tekst()?.getEditorRef()?.getYrsSession() !== sessie) return;
        setOpen({ ref, bytes, velden: samenvoegVelden(bytes) });
      }).catch(() => meld(t("mailMerge.errors.template"))).finally(() => setBezig(false));
    }} />
    {open && <SamenvoegDialoog template={open} data={data} bron={bron} kies={(d, b) => { setData(d); setBron(b); }} sluit={() => { setOpen(null); apis.tekst()?.focus(); }} />}
  </>;
}

function SamenvoegDialoog({ template, data, bron, kies, sluit }: {
  template: { ref: DocxEditorRef; bytes: Uint8Array; velden: string[] }; data: Gegevens | null; bron: string;
  kies: (data: Gegevens | null, bron: string) => void; sluit: () => void;
}) {
  const { t } = useTranslation("writer"), id = useId();
  const { state } = useDocxCommand("insertImage");
  const [record, setRecord] = useState(0), [veld, setVeld] = useState(data?.kolommen[0] ?? "");
  const [status, setStatus] = useState(""), [bezig, setBezig] = useState(false);
  const fout = (e: unknown) => t(`mailMerge.errors.${e instanceof SamenvoegFout ? e.code : "template"}`, { name: e instanceof SamenvoegFout ? e.veld : "" });
  const ontbreekt = data ? template.velden.find(v => !data.kolommen.some(k => k.toLowerCase() === v.toLowerCase())) : undefined;
  return <Dialoog titel={t("mailMerge.title")} sluit={sluit} className="tw-venster is-breed" acties={<>
    <button type="button" className="werkruimte-knop" onClick={sluit}>{t("common:close")}</button>
    <button type="submit" form={id} className="werkruimte-knop is-primair" disabled={!data || !template.velden.length || !!ontbreekt || bezig}>{t("mailMerge.saveCopy")}</button>
  </>}>
    <form id={id} onSubmit={e => {
      e.preventDefault(); if (!data || bezig) return;
      setBezig(true); setStatus("");
      void Promise.resolve().then(() => voegRecordSamen(template.bytes, data, record))
        .then(bytes => bewaarKopie(bytes, `Record-${String(record + 1).padStart(4, "0")}.docx`))
        .then(bewaard => { if (bewaard) setStatus(t("mailMerge.saved")); })
        .catch(e => setStatus(fout(e))).finally(() => setBezig(false));
    }}>
      <p>{t("mailMerge.scope")}</p>
      <label className="werkruimte-veld"><span>{t("mailMerge.source")}</span>
        <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" disabled={bezig} onChange={e => {
          const bestand = e.currentTarget.files?.[0]; e.currentTarget.value = "";
          if (!bestand) return;
          kies(null, ""); setStatus(""); setRecord(0); setBezig(true);
          if (bestand.size > 2 * 1024 * 1024) { setStatus(t("mailMerge.errors.data")); setBezig(false); return; }
          void bestand.arrayBuffer().then(buffer => {
            const nieuw = leesGegevens(new Uint8Array(buffer)); kies(nieuw, bestand.name); setVeld(nieuw.kolommen[0]);
          }).catch(e => setStatus(fout(e))).finally(() => setBezig(false));
        }} />
      </label>
      {data && <>
        <p>{bron}</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
          <button type="button" className="werkruimte-knop" disabled={!record || bezig} onClick={() => setRecord(record - 1)}>{t("common:previous")}</button>
          <span>{t("mailMerge.record", { number: record + 1, total: data.records.length })}</span>
          <button type="button" className="werkruimte-knop" disabled={record >= data.records.length - 1 || bezig} onClick={() => setRecord(record + 1)}>{t("common:next")}</button>
        </div>
        <div style={{ maxHeight: 200, overflow: "auto" }}><table><tbody>{data.kolommen.map((k, i) => <tr key={k}><th scope="row" style={{ textAlign: "left", paddingRight: 16 }}>{k}</th><td style={{ whiteSpace: "pre-wrap" }}>{data.records[record][i]}</td></tr>)}</tbody></table></div>
        <label className="werkruimte-veld"><span>{t("mailMerge.field")}</span><select value={veld} onChange={e => setVeld(e.target.value)}>{data.kolommen.map(k => <option key={k}>{k}</option>)}</select></label>
        <button type="button" className="werkruimte-knop" disabled={!state.enabled || bezig} onClick={() => {
          if (!template.ref.commands.getState("insertImage").enabled || template.ref.commands.getState("editingMode").value === "suggesting") return setStatus(t("mailMerge.errors.cursor"));
          try { voegSamenvoegveldIn(template.ref, veld); sluit(); } catch (e) { setStatus(fout(e)); }
        }}>{t("mailMerge.insertField")}</button>
      </>}
      {!template.velden.length && <p>{t("mailMerge.noFields")}</p>}
      <p role="status">{status || (ontbreekt ? t("mailMerge.errors.missing", { name: ontbreekt }) : "")}</p>
    </form>
  </Dialoog>;
}
