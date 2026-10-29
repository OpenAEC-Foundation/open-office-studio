/** VBA-module: bron, procedures met “Uitvoeren”, en het uitvoervenster. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Code2, Eraser, Pencil, Play, Save, Square, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LaadResultaat, ProcedureInfo } from "../../../vba/src/protocol.ts";
import { kleurTokens } from "../syntaxis.ts";
import type { VbaModule } from "./vba-sessie.ts";
import type { Uitvoerregel, VbaBediening } from "./useVba.tsx";
import { MODI } from "./extern-logica.ts";
import type { OntbrekendModus } from "../../../vba/src/extern-typen.ts";

/** Broncode met kleuren; `markeer` (regelnummer, 1 = eerste) markeert een regel en scrolt erheen. */
export function Bron({ bron, taal, markeer }: { bron: string; taal: "vba" | "sql"; markeer?: number }) {
  const pre = useRef<HTMLPreElement>(null);
  const markering = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const p = pre.current;
    const m = markering.current;
    if (!p || !m || !markeer) return;
    const stijl = getComputedStyle(p);
    const hoogte = parseFloat(stijl.lineHeight) || 20;
    m.style.top = `${parseFloat(stijl.paddingTop) + (markeer - 1) * hoogte}px`;
    m.style.height = `${hoogte}px`;
    p.scrollTop = Math.max(0, (markeer - 1) * hoogte - p.clientHeight / 3);
    m.scrollIntoView?.({ block: "nearest" });
  }, [markeer, bron]);
  return (
    <pre ref={pre} className={`database-bron${markeer ? " heeft-markering" : ""}`}>
      {!!markeer && <span ref={markering} className="database-bron-markering" aria-hidden />}
      <code>
        {kleurTokens(bron, taal).map((token, index) =>
          token.soort === "gewoon" ? (
            token.tekst
          ) : (
            <span key={index} className={`syntax-${token.soort}`}>
              {token.tekst}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}

/** Sleutel per categorie afgeschermde constructies (`vbaPanel.category.*`). */
const CATEGORIE: Record<string, string> = {
  proces: "process",
  bestand: "file",
  com: "com",
  "windows-api": "windowsApi",
  toetsenbord: "keyboard",
  omgeving: "environment",
  register: "registry",
  hyperlink: "hyperlink",
  export: "export",
};

export function VbaPaneel({
  module,
  vba,
  modules,
  onWijzig,
  onVerwijder,
  regel,
}: {
  module: VbaModule;
  /** Regel om te markeren (sprong vanuit Externe verwijzingen). */
  regel?: number;
  vba: VbaBediening;
  modules: VbaModule[];
  /** Bewaart de bron in de werkkopie (`bewaarModule`); een fout blijft in de editor staan. */
  onWijzig: (bron: string) => void | Promise<void>;
  /** Verwijdert de module uit de werkkopie (na bevestiging door de aanroeper). */
  onVerwijder?: () => void | Promise<void>;
}) {
  const { t } = useTranslation("database");
  const [info, setInfo] = useState<{ procedures: ProcedureInfo[]; laad: LaadResultaat } | null>(null);
  const [fout, setFout] = useState("");
  const [bewaarFout, setBewaarFout] = useState("");
  const [bewaren, setBewaren] = useState(false);
  const [bewerken, setBewerken] = useState(false);
  const [concept, setConcept] = useState(module.bron);
  const sessie = vba.sessie;

  useEffect(() => {
    setConcept(module.bron);
    setBewerken(false);
    setBewaarFout("");
  }, [module.naam, module.bron]);

  useEffect(() => {
    let actief = true;
    setInfo(null);
    setFout("");
    if (!sessie) return;
    // Alleen ontleden (laden); er wordt hier niets uitgevoerd.
    sessie.procedures(modules).then(
      (r) => actief && setInfo(r),
      (e) => actief && setFout(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      actief = false;
    };
  }, [sessie, modules]);

  const eigen = info?.procedures.filter((p) => p.module.toLowerCase() === module.naam.toLowerCase()) ?? [];
  const parseerfouten = info?.laad.fouten.filter((f) => f.module?.toLowerCase() === module.naam.toLowerCase()) ?? [];
  const afgeschermd = info?.laad.afscherming.filter((b) => b.module.toLowerCase() === module.naam.toLowerCase()) ?? [];
  const formulier = module.soort === "formulier" ? module.naam.replace(/^(form|report)_/i, "") : null;
  const modusId = useId();

  return (
    <div className="database-vba">
      <section className="database-vba-procedures" aria-label={t("vbaPanel.procedures")}>
        <h3>{t("vbaPanel.procedures")}</h3>
        {!sessie && <p className="muted">{t("vbaPanel.noSession")}</p>}
        {sessie && (
          <div className="database-vba-modus">
            <label>
              {t("vbaPanel.whenMissing")}
              <select
                value={vba.ontbrekend}
                disabled={!!vba.bezig}
                aria-describedby={modusId}
                onChange={(e) => vba.setOntbrekend(e.target.value as OntbrekendModus)}
              >
                {MODI.map((m) => (
                  <option key={m.waarde} value={m.waarde}>
                    {m.naam}
                  </option>
                ))}
              </select>
            </label>
            <small id={modusId}>{t("vbaPanel.modeHint", { description: MODI.find((m) => m.waarde === vba.ontbrekend)?.uitleg ?? "" })}</small>
          </div>
        )}
        {sessie && !info && !fout && <p role="status">{t("vbaPanel.parsing")}</p>}
        {fout && (
          <p className="melding fout" role="alert">
            {fout}
          </p>
        )}
        {parseerfouten.map((f, i) => (
          <p key={i} className="melding fout" role="alert">
            {t("vbaPanel.syntaxError", { line: f.regel ?? "?", description: f.beschrijving })}
          </p>
        ))}
        {!!afgeschermd.length && (
          <p className="melding">
            {t("vbaPanel.sandboxed", {
              count: afgeschermd.length,
              list: [...new Set(afgeschermd.map((b) => `${b.naam} (${CATEGORIE[b.categorie] ? t(`vbaPanel.category.${CATEGORIE[b.categorie]}`) : b.categorie})`))]
                .slice(0, 6)
                .join(", "),
            })}
          </p>
        )}
        {info && !eigen.length && !parseerfouten.length && (
          <p className="muted">{t("vbaPanel.noProcedures")}</p>
        )}
        <ul>
          {eigen.map((p) => {
            const uitvoerbaar = !p.gebeurtenis && module.soort === "module";
            return (
              <li key={p.naam}>
                <span>
                  <Code2 size={14} aria-hidden /> {p.naam}
                  <small>
                    {p.type === "function" ? "Function" : "Sub"}
                    {p.gebeurtenis ? ` · ${t("vbaPanel.event")}` : ""}
                  </small>
                </span>
                {uitvoerbaar ? (
                  <button
                    disabled={!!vba.bezig}
                    onClick={() => void vba.voerUit(module.naam, p.naam)}
                    aria-label={t("vbaPanel.runLabel", { name: p.naam })}
                  >
                    <Play size={14} /> {t("vbaPanel.run")}
                  </button>
                ) : (
                  <small className="muted">{formulier ? t("vbaPanel.viaForm", { name: formulier }) : module.soort === "klasse" ? t("vbaPanel.classModule") : t("vbaPanel.eventProcedure")}</small>
                )}
              </li>
            );
          })}
        </ul>
        {formulier && (
          <p className="muted">
            {t("vbaPanel.formModuleHint", { name: formulier })}
          </p>
        )}
      </section>
      <section className="database-vba-bron" aria-label={t("vbaPanel.sourceCode")}>
        <div className="database-werkbalk">
          <h3>{t("vbaPanel.sourceCode")}</h3>
          {bewerken ? (
            <>
              <button
                className="primary"
                disabled={bewaren}
                onClick={async () => {
                  setBewaren(true);
                  setBewaarFout("");
                  try {
                    await onWijzig(concept);
                    setBewerken(false);
                  } catch (e) {
                    setBewaarFout(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBewaren(false);
                  }
                }}
              >
                <Save size={14} /> {t("vbaPanel.saveInWorkingCopy")}
              </button>
              <button
                disabled={bewaren}
                onClick={() => {
                  setConcept(module.bron);
                  setBewerken(false);
                  setBewaarFout("");
                }}
              >
                <X size={14} /> {t("common:cancel")}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setBewerken(true)}>
                <Pencil size={14} /> {t("common:edit")}
              </button>
              {onVerwijder && (
                <button className="is-gevaar" onClick={() => void onVerwijder()}>
                  <Trash2 size={14} /> {t("vbaPanel.deleteModule")}
                </button>
              )}
            </>
          )}
        </div>
        {bewaarFout && (
          <p className="melding fout" role="alert">
            {bewaarFout}
          </p>
        )}
        {bewerken ? (
          <textarea className="database-vba-editor" aria-label={t("vbaPanel.sourceCodeOf", { name: module.naam })} spellCheck={false} value={concept} onChange={(e) => setConcept(e.target.value)} />
        ) : (
          <>
            {!!regel && <p className="muted">{t("vbaPanel.lineMarked", { line: regel })}</p>}
            <Bron bron={module.bron} taal="vba" markeer={regel} />
          </>
        )}
        <p className="muted">
          {module.herkomst === "access"
            ? module.gewijzigd
              ? t("vbaPanel.origin.accessEdited")
              : t("vbaPanel.origin.access")
            : t("vbaPanel.origin.own")}{" "}
          {t("vbaPanel.saveHint")}
        </p>
      </section>
    </div>
  );
}

export function VbaUitvoer({ vba }: { vba: VbaBediening }) {
  const { t } = useTranslation("database");
  const lijst = useRef<HTMLDivElement>(null);
  useEffect(() => {
    lijst.current?.scrollTo({ top: lijst.current.scrollHeight });
  }, [vba.uitvoer.length]);
  if (!vba.uitvoer.length && !vba.bezig) return null;
  return (
    <section className="database-vba-uitvoer" aria-label={t("vbaPanel.outputWindow")}>
      <div className="database-werkbalk">
        <h3>{t("vbaPanel.immediateWindow")}</h3>
        {vba.bezig && (
          <span role="status" className="database-vba-bezig">
            {t("vbaPanel.busy", { task: vba.bezig })}
          </span>
        )}
        <button onClick={vba.stop} disabled={!vba.bezig} className={vba.bezig ? "is-gevaar" : ""}>
          <Square size={14} /> {t("vbaPanel.stop")}
        </button>
        <button onClick={vba.wisUitvoer} disabled={!!vba.bezig}>
          <Eraser size={14} /> {t("vbaPanel.clear")}
        </button>
      </div>
      <div ref={lijst} className="database-vba-log" role="log" aria-live="polite">
        {vba.uitvoer.map((r: Uitvoerregel, i) => (
          <div key={i} className={`regel-${r.soort}`}>
            {r.tekst}
          </div>
        ))}
      </div>
    </section>
  );
}
