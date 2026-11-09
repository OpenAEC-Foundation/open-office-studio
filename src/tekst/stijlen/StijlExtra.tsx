import { useTranslation } from "react-i18next";
import type { StijlEigenschappen, StijlSoort } from "./stijlenxml";
import type { Randen, Tabstop } from "../opmaak";

/** Advanced properties belong to the style definition, not direct formatting. */
export function StijlExtra({ soort, waarde: e, wijzig }: { soort: StijlSoort; waarde: StijlEigenschappen; wijzig: (e: StijlEigenschappen) => void }) {
  const { t } = useTranslation("writer");
  const tabel = soort === "table", randen = (tabel ? e.tabelRanden : e.randen) ?? {};
  const tabs = e.tabs ?? [];
  function tab(i: number, delta: Partial<Tabstop>) { wijzig({ tabs: tabs.map((v, n) => n === i ? { ...v, ...delta } : v) }); }
  function rand(zijde: string, aan: boolean) {
    const nieuw = { ...randen } as Record<string, unknown>;
    nieuw[zijde] = aan ? { style: "single", size: 4, color: { rgb: "000000" } } : { style: "nil" };
    wijzig(tabel ? { tabelRanden: nieuw as Randen } : { randen: nieuw as Randen });
  }
  return <fieldset className="werkruimte-groep"><legend>{t("styles.manage.advanced")}</legend>
    <label className="werkruimte-veld"><span>{t("styles.manage.language")}</span><input type="text" value={e.taal ?? ""} placeholder="nl-NL" onChange={v => wijzig({ taal: v.target.value || null })}/></label>
    {soort !== "character" && <>
      <details><summary>{t("styles.manage.tabs")}</summary>
        {tabs.map((v, i) => <div className="werkruimte-rij" key={i}>
          <label>{t("styles.manage.position")} (cm)<input type="number" step="0.1" min="0" max="100" value={Math.round(v.position / (1440 / 2.54) * 100) / 100} onChange={ev => tab(i, { position: Math.round(Number(ev.target.value) * 1440 / 2.54) })}/></label>
          <label>{t("styles.editor.alignment")}<select value={v.alignment} onChange={ev => tab(i, { alignment: ev.target.value as Tabstop["alignment"] })}>{["left", "center", "right", "decimal", "bar", "clear"].map(a => <option key={a} value={a}>{t(`styles.manage.tabAlignment.${a}`)}</option>)}</select></label>
          <label>{t("styles.manage.leader")}<select value={v.leader ?? "none"} onChange={ev => tab(i, { leader: ev.target.value as Tabstop["leader"] })}>{["none", "dot", "hyphen", "underscore", "middleDot", "heavy"].map(a => <option key={a} value={a}>{t(`styles.manage.tabLeader.${a}`)}</option>)}</select></label>
          <button type="button" className="werkruimte-knop" aria-label={t("styles.manage.removeTab")} onClick={() => wijzig({ tabs: tabs.map((t, n) => n === i ? { position: t.position, alignment: "clear" } : t) })}>×</button>
        </div>)}
        <button type="button" className="werkruimte-knop" onClick={() => wijzig({ tabs: [...tabs, { position: (tabs.at(-1)?.position ?? 0) + 720, alignment: "left" }] })}>{t("styles.manage.addTab")}</button>
      </details>
      <details><summary>{t("styles.manage.borders")}</summary>
        {["top", "bottom", "left", "right", ...(tabel ? ["insideH", "insideV"] : ["between"])].map(z => {
          const r = (randen as Record<string, { style: string; size?: number; color?: { rgb?: string } }>)[z];
          const zet = (delta: Record<string, unknown>) => wijzig(tabel ? { tabelRanden: { ...randen, [z]: { ...r, ...delta } } } : { randen: { ...randen, [z]: { ...r, ...delta } } });
          return <div key={z} className="werkruimte-rij"><label><input type="checkbox" checked={!!r && r.style !== "nil" && r.style !== "none"} onChange={ev => rand(z, ev.target.checked)}/>{t(`styles.manage.side.${z}`)}</label>
            {r && <><label>{t("styles.manage.borderStyle")}<select value={r.style} onChange={ev => zet({ style: ev.target.value })}>{["single", "double", "dotted", "dashed", "nil"].map(s => <option key={s} value={s}>{t(`styles.manage.line.${s}`)}</option>)}</select></label>
              <label>{t("styles.manage.width")} (pt)<input type="number" min="0.25" max="12" step="0.25" value={(r.size ?? 4) / 8} onChange={ev => zet({ size: Math.round(Number(ev.target.value) * 8) })}/></label>
              <label>{t("styles.editor.color")}<input type="color" value={`#${r.color?.rgb ?? "000000"}`} onChange={ev => zet({ color: { rgb: ev.target.value.slice(1) } })}/></label></>}
          </div>;
        })}
        <label className="werkruimte-veld"><span>{t("styles.manage.shading")}</span><input type="color" value={`#${(tabel ? e.tabelArcering : e.arcering)?.fill?.rgb ?? "FFFFFF"}`} onChange={ev => wijzig(tabel ? { tabelArcering: { pattern: "clear", fill: { rgb: ev.target.value.slice(1) } } } : { arcering: { pattern: "clear", fill: { rgb: ev.target.value.slice(1) } } })}/></label>
      </details>
    </>}
  </fieldset>;
}
