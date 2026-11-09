import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialoog } from "../../werkruimte/Dialoog";
import { useStijlen, type StijlVenster } from "./StijlenBeheer";
import { importeerDocumentStijlen, verwijderDocumentStijl } from "./beheer";
import { leesStijlOnderdelen } from "./pakket";
import { leesStijlen, type StijlInfo } from "./stijlenxml";
import { stijlNaam } from "./model";
import { converteer } from "../../formaten";

export function StijlBeheerDialoog({ venster }: { venster: Extract<StijlVenster, { soort: "importeer" | "verwijder" }> }) {
  const { t } = useTranslation(["writer", "common"]), staat = useStijlen();
  const stijl = venster.soort === "verwijder" ? staat.stijlen?.styles.find(s => s.styleId === venster.styleId) : undefined;
  const [bron, setBron] = useState<Uint8Array | null>(null), [stijlen, setStijlen] = useState<StijlInfo[]>([]);
  const [selectie, setSelectie] = useState<string[]>([]), [vervanging, setVervanging] = useState(stijl?.basedOn ?? "");
  const [overschrijven, setOverschrijven] = useState(false), [bezig, setBezig] = useState(false), [fout, setFout] = useState("");
  async function lees(file?: File) {
    setFout(""); setBron(null); setStijlen([]); setSelectie([]);
    if (!file) return;
    setBezig(true);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error(t("styles.manage.fileTooLarge"));
      const origineel = new Uint8Array(await file.arrayBuffer()), ext = file.name.split(".").at(-1)?.toLowerCase();
      const bytes = ext === "odt" || ext === "ott" ? await converteer(origineel, ext, "docx", "docx") : origineel;
      const lijst = leesStijlen(leesStijlOnderdelen(bytes).stijlen);
      setBron(bytes); setStijlen(lijst); setSelectie(lijst.map(s => s.styleId));
    } catch (e) { setFout(String(e instanceof Error ? e.message : e)); }
    finally { setBezig(false); }
  }
  async function bevestig() {
    setBezig(true); setFout("");
    try {
      await staat.herlaadPakket(async bytes => venster.soort === "verwijder"
        ? verwijderDocumentStijl(bytes, venster.styleId, vervanging || undefined)
        : (await importeerDocumentStijlen(bytes, bron!, selectie, overschrijven)).bytes);
      staat.sluit();
    } catch (e) { setFout(String(e instanceof Error ? e.message : e)); setBezig(false); }
  }
  return <Dialoog titel={t(venster.soort === "verwijder" ? "styles.manage.deleteTitle" : "styles.manage.importTitle")} sluit={staat.sluit} acties={<>
    <button type="button" className="werkruimte-knop" onClick={staat.sluit}>{t("common:cancel")}</button>
    <button type="button" className="werkruimte-knop is-primair" disabled={bezig || (venster.soort === "importeer" && (!bron || !selectie.length))} onClick={() => void bevestig()}>{t(venster.soort === "verwijder" ? "styles.manage.delete" : "styles.manage.import")}</button>
  </>}>
    {venster.soort === "verwijder" ? <>
      <p>{t("styles.manage.deleteNotice", { name: stijl ? stijlNaam(stijl) : venster.styleId })}</p>
      <label className="werkruimte-veld"><span>{t("styles.manage.replacement")}</span><select value={vervanging} onChange={e => setVervanging(e.target.value)}>
        <option value="">{t("styles.manage.inherit")}</option>
        {staat.stijlen?.styles.filter(s => s.type === stijl?.type && s.styleId !== stijl?.styleId).map(s => <option key={s.styleId} value={s.styleId}>{stijlNaam(s)}</option>)}
      </select></label>
    </> : <>
      <label className="werkruimte-veld"><span>{t("styles.manage.source")}</span><input type="file" disabled={bezig} accept=".docx,.dotx,.docm,.dotm,.odt,.ott" onChange={e => void lees(e.target.files?.[0])}/></label>
      <label className="werkruimte-vink"><input type="checkbox" checked={overschrijven} onChange={e => setOverschrijven(e.target.checked)}/>{t("styles.manage.overwrite")}</label>
      <p className="werkruimte-uitleg">{t("styles.manage.importNotice")}</p>
      <div style={{ maxHeight: 300, overflow: "auto" }}>
        {stijlen.map(s => <label className="werkruimte-vink" key={s.styleId}><input type="checkbox" checked={selectie.includes(s.styleId)} onChange={e => setSelectie(oud => e.target.checked ? [...oud, s.styleId] : oud.filter(id => id !== s.styleId))}/>{s.naam} ({t(`styles.manage.type.${s.soort}`)})</label>)}
      </div>
    </>}
    {fout && <p role="alert" className="werkruimte-fout">{fout}</p>}
    <p className="werkruimte-uitleg">{t("styles.reloadNotice")}</p>
  </Dialoog>;
}
