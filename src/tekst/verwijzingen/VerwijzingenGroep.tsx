import { useContext, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { Bookmark, Link2, ListOrdered, RefreshCw } from "lucide-react";
import { Groep, RibbonFout } from "../../Ribbon";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi } from "../../lint/editorApi";
import { Dialoog } from "../../werkruimte/Dialoog";
import { engine } from "../gedeeld/engine";
import { bladwijzers, gaNaar, hernoemBladwijzer, nieuweBladwijzer, verwijderBladwijzer } from "./document";
import { bijschriftIn, kruisverwijzingIn, verwijsDoelen } from "./opdrachten";
import { werkDocumentVeldenBij } from "../veldenDocument/opdrachten";

type Venster = "bookmarks" | "caption" | "reference";
export function VerwijzingenGroep() {
  const { t } = useTranslation("writer"), api = useEditorApi().tekst, melding = useContext(RibbonFout);
  const { state } = useDocxCommand("insertImage");
  const [open, setOpen] = useState<{ type: Venster; ref: DocxEditorRef } | null>(null);
  const [bezig, setBezig] = useState(false);
  const bewerkbaar = state.enabled && api()?.commands.getState("editingMode").value !== "suggesting";
  const toon = (type: Venster) => { const ref = api(); if (ref) setOpen({ type, ref }); };
  return <Groep naam={t("references.group")}>
    <EigenKnop naam={t("references.caption")} icoon={ListOrdered} groot disabled={!bewerkbaar || bezig} onClick={() => toon("caption")} />
    <div className="ribbon-stapel">
      <EigenKnop naam={t("references.reference")} icoon={Link2} disabled={!bewerkbaar || bezig} onClick={() => toon("reference")} />
      <EigenKnop naam={t("references.bookmarks")} icoon={Bookmark} disabled={!api() || bezig} onClick={() => toon("bookmarks")} />
      <EigenKnop naam={t("references.update")} icoon={RefreshCw} disabled={!bewerkbaar || bezig} onClick={async () => {
        const ref = api(); if (!ref) return;
        setBezig(true);
        try { const r = await werkDocumentVeldenBij(ref); if (r.onopgelost.length) melding(t("references.unresolved", { names: r.onopgelost.join(", ") })); }
        catch (e) { melding(t(e instanceof Error ? e.message : "references.failed")); }
        finally { setBezig(false); }
      }} />
    </div>
    {open && <VerwijsDialoog type={open.type} refApi={open.ref} bewerkbaar={!!bewerkbaar} sluit={() => {
      const ref = api(), sessie = ref?.getEditorRef()?.getYrsSession(), selectie = sessie?.selection();
      setOpen(null);
      requestAnimationFrame(() => {
        if (!ref || !sessie || ref.getEditorRef()?.getYrsSession() !== sessie) return;
        if (selectie) gaNaar(ref, selectie.anchor, selectie.head); else ref.focus();
      });
    }} />}
  </Groep>;
}
function VerwijsDialoog({ type, refApi, bewerkbaar, sluit }: { type: Venster; refApi: DocxEditorRef; bewerkbaar: boolean; sluit: () => void }) {
  const { t } = useTranslation("writer"), form = useId();
  const [naam, setNaam] = useState(""), [keuze, setKeuze] = useState("");
  const [label, setLabel] = useState(t("references.figure")), [omschrijving, setOmschrijving] = useState("");
  const [onder, setOnder] = useState(true), [hoofdstuk, setHoofdstuk] = useState(0);
  const [vorm, setVorm] = useState<"text" | "number" | "page">("text");
  const [intern, setIntern] = useState(false), [tick, setTick] = useState(0), [fout, setFout] = useState(""), [bezig, setBezig] = useState(false);
  const bs = bladwijzers(engine(refApi).sessie).filter(b => intern || !b.naam.startsWith("_"));
  const doelen = type === "reference" ? verwijsDoelen(refApi) : [];
  const doe = async (werk: () => unknown | Promise<unknown>, einde = false) => {
    setBezig(true); setFout("");
    try { await werk(); if (einde) sluit(); else setTick(tick + 1); }
    catch (e) { setFout(t(e instanceof Error ? e.message : "references.failed")); }
    finally { setBezig(false); }
  };
  return <Dialoog titel={t(`references.${type === "caption" ? "caption" : type === "reference" ? "reference" : "bookmarks"}`)} sluit={sluit} className="tw-venster is-breed" acties={<>
    <button type="button" className="werkruimte-knop" onClick={sluit}>{t("common:close")}</button>
    {type !== "bookmarks" && <button type="submit" form={form} className="werkruimte-knop is-primair" disabled={bezig || !bewerkbaar || (type === "reference" && !keuze)}>{t("references.insert")}</button>}
  </>}>
    <form id={form} onSubmit={e => { e.preventDefault(); if (!bewerkbaar || bezig) return;
      void doe(() => type === "caption" ? bijschriftIn(refApi, label, omschrijving, onder, hoofdstuk) : kruisverwijzingIn(refApi, keuze, vorm), true);
    }}>
      {type === "bookmarks" ? <>
        <label className="werkruimte-veld"><span>{t("references.name")}</span><input data-autofocus="" value={naam} maxLength={40} onChange={e => setNaam(e.target.value)} /></label>
        <p>{t("references.nameHint")}</p>
        <label className="werkruimte-veld"><span>{t("references.bookmarks")}</span><select aria-label={t("references.bookmarks")} size={8} value={keuze} onChange={e => { setKeuze(e.target.value); setNaam(e.target.value); }}>
          {bs.map(b => <option key={b.naam} value={b.naam}>{b.naam}</option>)}
        </select></label>
        <label><input type="checkbox" checked={intern} onChange={e => setIntern(e.target.checked)} /> {t("references.hidden")}</label>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" className="werkruimte-knop" disabled={bezig || !bewerkbaar || !naam} onClick={() => void doe(() => nieuweBladwijzer(refApi, naam))}>{t("references.add")}</button>
          <button type="button" className="werkruimte-knop" disabled={bezig || !keuze} onClick={() => { const b = bs.find(b => b.naam === keuze); if (b) { gaNaar(refApi, b.start, b.einde); sluit(); } }}>{t("references.go")}</button>
          <button type="button" className="werkruimte-knop" disabled={bezig || !bewerkbaar || !keuze || !naam || keuze === naam} onClick={() => void doe(() => { hernoemBladwijzer(refApi, keuze, naam); setKeuze(naam); })}>{t("references.rename")}</button>
          <button type="button" className="werkruimte-knop" disabled={bezig || !bewerkbaar || !keuze} onClick={() => void doe(() => { verwijderBladwijzer(refApi, keuze); setKeuze(""); })}>{t("common:delete")}</button>
        </div>
      </> : type === "caption" ? <>
        <label className="werkruimte-veld"><span>{t("references.label")}</span><input list={`${form}-labels`} value={label} onChange={e => setLabel(e.target.value)} maxLength={40} data-autofocus="" /></label>
        <datalist id={`${form}-labels`}>{["figure", "table", "equation"].map(k => <option key={k} value={t(`references.${k}`)} />)}</datalist>
        <label className="werkruimte-veld"><span>{t("references.description")}</span><input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} maxLength={500} /></label>
        <label className="werkruimte-veld"><span>{t("references.position")}</span><select aria-label={t("references.position")} value={onder ? "below" : "above"} onChange={e => setOnder(e.target.value === "below")}><option value="below">{t("references.below")}</option><option value="above">{t("references.above")}</option></select></label>
        <label className="werkruimte-veld"><span>{t("references.chapter")}</span><select aria-label={t("references.chapter")} value={hoofdstuk} onChange={e => setHoofdstuk(Number(e.target.value))}><option value={0}>{t("references.noChapter")}</option>{Array.from({ length: 9 }, (_, n) => <option key={n} value={n + 1}>{t("references.headingLevel", { level: n + 1 })}</option>)}</select></label>
        <p>{t("references.objectHint")}</p>
      </> : <>
        <label className="werkruimte-veld"><span>{t("references.target")}</span><select aria-label={t("references.target")} data-autofocus="" size={10} value={keuze} onChange={e => setKeuze(e.target.value)}>
          {(["heading", "caption", "bookmark", "note"] as const).map(soort => <optgroup key={soort} label={t(`references.targets.${soort}`)}>{doelen.filter(d => d.soort === soort).map(d => <option key={d.id} value={d.id}>{d.naam || "…"}</option>)}</optgroup>)}
        </select></label>
        <label className="werkruimte-veld"><span>{t("references.show")}</span><select aria-label={t("references.show")} value={vorm} onChange={e => setVorm(e.target.value as typeof vorm)}>{["text", "number", "page"].map(v => <option key={v} value={v}>{t(`references.forms.${v}`)}</option>)}</select></label>
      </>}
      <p role="status">{bezig ? t("references.busy") : fout}</p>
    </form>
  </Dialoog>;
}
