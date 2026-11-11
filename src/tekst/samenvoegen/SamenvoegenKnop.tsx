import { useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { Mails } from "lucide-react";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi } from "../../lint/editorApi";
import { RibbonFout } from "../../Ribbon";
import { Dialoog } from "../../werkruimte/Dialoog";
import { gegevensUitRijen, SamenvoegFout, type Gegevens } from "./gegevens";
import { samenvoegVelden, voegRecordSamen } from "./pakket";
import { voegSamenvoegveldIn } from "./invoegen";
import { leesSamenvoegBron, type GegevensBlad } from "./bronnen";
import { kiesRecords, type RecordKeuze } from "./records";
import { maakSamenvoegDocument, STANDAARD_INDELING, type SamenvoegIndeling } from "./documenten";
import { maakSamenvoegPaginas } from "./paginas";
import { voerSamenvoegenUit, type SamenvoegUitvoer } from "./uitvoer";
import { leesDatabaseBronnen, volgDatabaseBronnen, leesDatabaseTabel } from "../../gegevensbronnen/database";
import type { AfdrukDocument } from "../../afdrukken/model";

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
      setBezig(true);
      let sessie: object | undefined;
      void ref.whenLayoutComplete({ timeoutMs: 15000 }).then(() => ref.flushPendingInput()).then(() => {
        sessie = ref.getEditorRef()?.getYrsSession() ?? undefined;
        if (!sessie) throw new Error("notReady");
        return herlaad.bytes();
      }).then(bytes => {
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
  const [bladen, setBladen] = useState<GegevensBlad[]>([]), [bronType, setBronType] = useState("file");
  const databases = useSyncExternalStore(volgDatabaseBronnen, leesDatabaseBronnen, leesDatabaseBronnen);
  const [databaseId, setDatabaseId] = useState(""), [tabellen, setTabellen] = useState<string[]>([]), [tabel, setTabel] = useState("");
  const [keuze, setKeuze] = useState<RecordKeuze>({ filterKolom: "", filter: "", vergelijking: "contains", sorteerKolom: "", aflopend: false });
  const [uitgesloten, setUitgesloten] = useState<Set<number>>(new Set()), [indeling, setIndeling] = useState<SamenvoegIndeling>(STANDAARD_INDELING);
  const [uitvoer, setUitvoer] = useState<SamenvoegUitvoer>("document"), [bereik, setBereik] = useState("all");
  const [previewAan, setPreviewAan] = useState(false), [preview, setPreview] = useState<AfdrukDocument | null>(null), [previewBezig, setPreviewBezig] = useState(false);
  const werk = useRef<AbortController | null>(null), generatie = useRef(0);
  const zichtbaar = useMemo(() => data ? kiesRecords(data, keuze) : [], [data, keuze]);
  const geselecteerd = useMemo(() => zichtbaar.filter(i => !uitgesloten.has(i)), [zichtbaar, uitgesloten]);
  const current = zichtbaar[Math.min(record, Math.max(0, zichtbaar.length - 1))];
  const uitvoerRecords = bereik === "current" ? current === undefined ? [] : [current] : geselecteerd;
  const fout = (e: unknown) => e instanceof DOMException && e.name === "AbortError" ? t("mailMerge.cancelled") : e instanceof Error && e.message.startsWith("mailMerge.errors.") ? t(e.message) : t(`mailMerge.errors.${e instanceof SamenvoegFout ? e.code : e instanceof Error && ["data", "records"].includes(e.message) ? e.message : "render"}`, { name: e instanceof SamenvoegFout ? e.veld : "" });
  const neem = (d: Gegevens, naam: string) => { kies(d, naam); setVeld(d.kolommen[0]); setRecord(0); setKeuze({ filterKolom: "", filter: "", vergelijking: "contains", sorteerKolom: "", aflopend: false }); setUitgesloten(new Set()); setPreview(null); };
  useEffect(() => () => { generatie.current++; werk.current?.abort(); }, []);
  useEffect(() => {
    const db = databases.find(d => String(d.id) === databaseId);
    if (bronType !== "database" || !db) { setTabellen([]); return; }
    let actief = true; setTabellen([]); setTabel("");
    void db.werkkopie.tabellen().then(ts => { if (actief) { setTabellen(ts.map(t => t.naam)); setTabel(ts[0]?.naam ?? ""); } }).catch(e => { if (actief) setStatus(fout(e)); });
    return () => { actief = false; };
  }, [bronType, databaseId, databases]);
  useEffect(() => {
    if (!previewAan || !data || current === undefined || !template.velden.length) { setPreview(null); return; }
    const stop = new AbortController(); setPreviewBezig(true);
    const timer = setTimeout(() => {
      try {
        const bytes = maakSamenvoegDocument(template.bytes, data, [current], indeling);
        void maakSamenvoegPaginas(bytes, `Record-${current + 1}`, stop.signal).then(d => { if (!stop.signal.aborted) setPreview(d); }).catch(e => { if (!stop.signal.aborted) setStatus(fout(e)); }).finally(() => { if (!stop.signal.aborted) setPreviewBezig(false); });
      } catch (e) { setPreviewBezig(false); setStatus(fout(e)); }
    }, 150);
    return () => { clearTimeout(timer); stop.abort(); };
  }, [previewAan, data, current, indeling, template]);
  const uitvoeren = async () => {
    if (!data || !uitvoerRecords.length || bezig) return;
    setPreviewAan(false); setBezig(true); setStatus(""); const stop = new AbortController(); werk.current = stop;
    try { await voerSamenvoegenUit(uitvoer, { template: template.bytes, data, records: uitvoerRecords, indeling, signal: stop.signal, voortgang: (done, total) => setStatus(t("mailMerge.progress", { done, total })), voorOpenen: sluit }); if (!stop.signal.aborted) setStatus(t("mailMerge.saved")); }
    catch (e) { setStatus(fout(e)); } finally { setBezig(false); werk.current = null; }
  };
  const ontbreekt = data ? template.velden.find(v => !data.kolommen.some(k => k.toLowerCase() === v.toLowerCase())) : undefined;
  return <Dialoog titel={t("mailMerge.title")} sluit={sluit} className="tw-venster is-breed" acties={<>
    <button type="button" className="werkruimte-knop" onClick={sluit}>{t("common:close")}</button>
    <button type="button" className="werkruimte-knop" disabled={!data || current === undefined || !template.velden.length || !!ontbreekt || bezig} onClick={() => {
      if (!data || current === undefined) return;
      setBezig(true); void Promise.resolve().then(() => voegRecordSamen(template.bytes, data, current)).then(bytes => bewaarKopie(bytes, `Record-${String(current + 1).padStart(4, "0")}.docx`)).then(ok => { if (ok) setStatus(t("mailMerge.saved")); }).catch(e => setStatus(fout(e))).finally(() => setBezig(false));
    }}>{t("mailMerge.saveCopy")}</button>
    {bezig ? <button type="button" className="werkruimte-knop" onClick={() => { if (werk.current) werk.current.abort(); else { generatie.current++; setBezig(false); setStatus(t("mailMerge.cancelled")); } }}>{t("common:cancel")}</button> : <button type="submit" form={id} className="werkruimte-knop is-primair" disabled={!data || !uitvoerRecords.length || !template.velden.length || !!ontbreekt}>{t("mailMerge.finish")}</button>}
  </>}>
    <form id={id} onSubmit={e => {
      e.preventDefault(); void uitvoeren();
    }}>
      <p>{t("mailMerge.scope")}</p>
      <label className="werkruimte-veld"><span>{t("mailMerge.sourceType")}</span><select aria-label={t("mailMerge.sourceType")} value={bronType} disabled={bezig} onChange={e => { setBronType(e.target.value); if (e.target.value === "database" && !databaseId) setDatabaseId(String(databases[0]?.id ?? "")); }}><option value="file">{t("mailMerge.fileSource")}</option><option value="database">{t("mailMerge.databaseSource")}</option></select></label>
      {bronType === "file" ? <><label className="werkruimte-veld"><span>{t("mailMerge.source")}</span>
        <input type="file" accept=".csv,.tsv,.xlsx,.ods,text/csv,text/tab-separated-values" disabled={bezig} onChange={e => {
          const bestand = e.currentTarget.files?.[0]; e.currentTarget.value = "";
          if (!bestand) return;
          setStatus(""); setRecord(0); setBezig(true); const g = ++generatie.current;
          if (bestand.size > 10_000_000) { setStatus(t("mailMerge.errors.data")); setBezig(false); return; }
          void bestand.arrayBuffer().then(buffer => leesSamenvoegBron(new Uint8Array(buffer), bestand.name)).then(nieuw => {
            if (g !== generatie.current) return;
            setBladen(nieuw); neem(nieuw[0].gegevens, `${bestand.name} — ${nieuw[0].naam}`);
          }).catch(e => { if (g === generatie.current) setStatus(fout(e)); }).finally(() => { if (g === generatie.current) setBezig(false); });
        }} />
      </label>
      {bladen.length > 1 && <label className="werkruimte-veld"><span>{t("mailMerge.sheet")}</span><select aria-label={t("mailMerge.sheet")} disabled={bezig} onChange={e => { const b = bladen[Number(e.target.value)]; neem(b.gegevens, b.naam); }}>{bladen.map((b, i) => <option key={i} value={i}>{b.naam}</option>)}</select></label>}</> : <>
        {!databases.length && <p>{t("mailMerge.noDatabase")}</p>}
        <label className="werkruimte-veld"><span>{t("mailMerge.database")}</span><select aria-label={t("mailMerge.database")} value={databaseId} disabled={bezig} onChange={e => setDatabaseId(e.target.value)}>{databases.map(d => <option key={d.id} value={d.id}>{d.naam}</option>)}</select></label>
        <label className="werkruimte-veld"><span>{t("mailMerge.table")}</span><select aria-label={t("mailMerge.table")} value={tabel} disabled={bezig} onChange={e => setTabel(e.target.value)}>{tabellen.map(n => <option key={n}>{n}</option>)}</select></label>
        <button type="button" className="werkruimte-knop" disabled={!tabel || bezig} onClick={() => {
          const db = databases.find(d => String(d.id) === databaseId); if (!db) return;
          setBezig(true); setStatus(""); const g = ++generatie.current;
          void leesDatabaseTabel(db, tabel).then(rows => { if (g === generatie.current) neem(gegevensUitRijen(rows), `${db.naam} — ${tabel}`); }).catch(e => { if (g === generatie.current) setStatus(fout(e)); }).finally(() => { if (g === generatie.current) setBezig(false); });
        }}>{t("mailMerge.useTable")}</button>
      </>}
      {data && <>
        <p>{bron}</p>
        <fieldset><legend>{t("mailMerge.filterSort")}</legend>
          <label className="werkruimte-veld"><span>{t("mailMerge.filterColumn")}</span><select aria-label={t("mailMerge.filterColumn")} value={keuze.filterKolom} disabled={bezig} onChange={e => { setKeuze({ ...keuze, filterKolom: e.target.value }); setRecord(0); }}><option value="">{t("mailMerge.allRecords")}</option>{data.kolommen.map(k => <option key={k}>{k}</option>)}</select></label>
          {keuze.filterKolom && <><label className="werkruimte-veld"><span>{t("mailMerge.condition")}</span><select aria-label={t("mailMerge.condition")} value={keuze.vergelijking} disabled={bezig} onChange={e => { setKeuze({ ...keuze, vergelijking: e.target.value as RecordKeuze["vergelijking"] }); setRecord(0); }}>{["contains", "equals", "notEquals", "empty", "notEmpty"].map(v => <option key={v} value={v}>{t(`mailMerge.conditions.${v}`)}</option>)}</select></label><label className="werkruimte-veld"><span>{t("mailMerge.filterValue")}</span><input type="text" value={keuze.filter} disabled={bezig || ["empty", "notEmpty"].includes(keuze.vergelijking)} onChange={e => { setKeuze({ ...keuze, filter: e.target.value }); setRecord(0); }} /></label></>}
          <label className="werkruimte-veld"><span>{t("mailMerge.sortColumn")}</span><select aria-label={t("mailMerge.sortColumn")} value={keuze.sorteerKolom} disabled={bezig} onChange={e => { setKeuze({ ...keuze, sorteerKolom: e.target.value }); setRecord(0); }}><option value="">{t("mailMerge.sourceOrder")}</option>{data.kolommen.map(k => <option key={k}>{k}</option>)}</select></label>
          <label><input type="checkbox" checked={keuze.aflopend} disabled={bezig || !keuze.sorteerKolom} onChange={e => { setKeuze({ ...keuze, aflopend: e.target.checked }); setRecord(0); }} /> {t("mailMerge.descending")}</label>
        </fieldset>
        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
          <button type="button" className="werkruimte-knop" disabled={!record || bezig} onClick={() => setRecord(record - 1)}>{t("common:previous")}</button>
          <span>{t("mailMerge.record", { number: zichtbaar.length ? Math.min(record + 1, zichtbaar.length) : 0, total: zichtbaar.length })}</span>
          <button type="button" className="werkruimte-knop" disabled={record >= zichtbaar.length - 1 || bezig} onClick={() => setRecord(record + 1)}>{t("common:next")}</button>
        </div>
        <div style={{ maxHeight: 200, overflow: "auto" }}><table><tbody>{data.kolommen.map((k, i) => <tr key={k}><th scope="row" style={{ textAlign: "left", paddingRight: 16 }}>{k}</th><td style={{ whiteSpace: "pre-wrap" }}>{current === undefined ? "" : data.records[current][i]}</td></tr>)}</tbody></table></div>
        {current !== undefined && <label><input type="checkbox" checked={!uitgesloten.has(current)} disabled={bezig} onChange={e => setUitgesloten(old => { const next = new Set(old); if (e.target.checked) next.delete(current); else next.add(current); return next; })} /> {t("mailMerge.includeRecord")}</label>}
        <label className="werkruimte-veld"><span>{t("mailMerge.field")}</span><select aria-label={t("mailMerge.field")} value={veld} disabled={bezig} onChange={e => setVeld(e.target.value)}>{data.kolommen.map(k => <option key={k}>{k}</option>)}</select></label>
        <button type="button" className="werkruimte-knop" disabled={!state.enabled || bezig} onClick={() => {
          if (!template.ref.commands.getState("insertImage").enabled || template.ref.commands.getState("editingMode").value === "suggesting") return setStatus(t("mailMerge.errors.cursor"));
          try { voegSamenvoegveldIn(template.ref, veld); sluit(); } catch (e) { setStatus(fout(e)); }
        }}>{t("mailMerge.insertField")}</button>
        <fieldset><legend>{t("mailMerge.layout")}</legend>
          <label className="werkruimte-veld"><span>{t("mailMerge.documentType")}</span><select aria-label={t("mailMerge.documentType")} value={indeling.soort} disabled={bezig} onChange={e => setIndeling({ ...indeling, soort: e.target.value as SamenvoegIndeling["soort"] })}>{["letters", "labels", "envelopes"].map(v => <option key={v} value={v}>{t(`mailMerge.types.${v}`)}</option>)}</select></label>
          {indeling.soort === "labels" && <><p>{t("mailMerge.labelHint")}</p>{(["kolommen", "rijen", "breedte", "hoogte", "links", "boven", "tussen"] as const).map(k => <label key={k} className="werkruimte-veld"><span>{t(`mailMerge.labelSize.${k}`)}</span><input type="number" step={k === "kolommen" || k === "rijen" ? 1 : 0.05} min={k === "kolommen" || k === "rijen" ? 1 : 0} max={k === "kolommen" || k === "rijen" ? 20 : 297} value={indeling[k]} disabled={bezig} onChange={e => setIndeling({ ...indeling, [k]: Number(e.target.value) })} /></label>)}</>}
          {indeling.soort === "envelopes" && <p>{t("mailMerge.envelopeHint")}</p>}
          <button type="button" className="werkruimte-knop" disabled={bezig || !template.velden.length || !!ontbreekt || current === undefined} onClick={() => setPreviewAan(!previewAan)}>{t(previewAan ? "mailMerge.hidePreview" : "mailMerge.preview")}</button>
          {previewAan && <div aria-label={t("mailMerge.preview")} style={{ maxHeight: 480, overflow: "auto", marginTop: 10, background: "var(--w-bg-zacht)", padding: 12 }}>{previewBezig ? <p role="status">{t("mailMerge.rendering")}</p> : preview && <SamenvoegVoorbeeld doc={preview} />}</div>}
        </fieldset>
        <fieldset><legend>{t("mailMerge.output")}</legend>
          <label className="werkruimte-veld"><span>{t("mailMerge.range")}</span><select aria-label={t("mailMerge.range")} value={bereik} disabled={bezig} onChange={e => setBereik(e.target.value)}><option value="all">{t("mailMerge.selectedRecords", { count: geselecteerd.length })}</option><option value="current">{t("mailMerge.currentRecord")}</option></select></label>
          <label className="werkruimte-veld"><span>{t("mailMerge.outputType")}</span><select aria-label={t("mailMerge.outputType")} value={uitvoer} disabled={bezig} onChange={e => setUitvoer(e.target.value as SamenvoegUitvoer)}>{["document", "docx", "pdf", "pdfPerRecord", "printer"].map(v => <option key={v} value={v}>{t(`mailMerge.outputs.${v}`)}</option>)}</select></label>
        </fieldset>
      </>}
      {!template.velden.length && <p>{t("mailMerge.noFields")}</p>}
      <p role="status">{status || (ontbreekt ? t("mailMerge.errors.missing", { name: ontbreekt }) : "")}</p>
    </form>
  </Dialoog>;
}

function SamenvoegVoorbeeld({ doc }: { doc: AfdrukDocument }) {
  const { t } = useTranslation("writer");
  const [urls, setUrls] = useState<string[]>([]);
  const [mislukt, setMislukt] = useState(false);
  useEffect(() => {
    let actief = true; const gemaakt: string[] = [];
    setUrls([]); setMislukt(false);
    void (async () => { for (const page of doc.paginas) { if (!actief) return; const { canvas } = await page.teken(96); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("preview")), "image/png")); if (!actief) return; gemaakt.push(URL.createObjectURL(blob)); } if (actief) setUrls([...gemaakt]); })().catch(() => { if (actief) setMislukt(true); gemaakt.forEach(u => URL.revokeObjectURL(u)); });
    return () => { actief = false; gemaakt.forEach(u => URL.revokeObjectURL(u)); };
  }, [doc]);
  return <>{mislukt && <p role="alert">{t("mailMerge.errors.render")}</p>}{urls.map((u, i) => <img key={u} src={u} alt={`${doc.titel}, ${i + 1}`} style={{ display: "block", maxWidth: "100%", height: "auto", margin: "0 auto 12px", boxShadow: "0 1px 5px #999" }} />)}</>;
}
