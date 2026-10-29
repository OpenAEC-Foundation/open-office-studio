/**
 * Formulierweergave: één record tegelijk met navigatie, nieuw en verwijderen,
 * plus een gegevensbladweergave. Gekoppelde VBA (`Form_<naam>`) krijgt via
 * `FormulierRegister` toegang tot `Me`, velden en knoppen. Gebeurtenissen lopen
 * alleen als de gebruiker VBA voor deze database heeft toegestaan.
 */
import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Plus, Save, Table2, Trash2, Undo2, X, LayoutTemplate } from "lucide-react";
import type { HostWaarde } from "../../../vba/src/host.ts";
import type { QueryResultaat, TabelSchema, VeldSchema, Veldsoort, Waarde, Werkkopie } from "../werkkopie/contract.ts";
import { bewerkbaar, bewerkTekst, leesbareFout, leesInvoer, SOORTNAMEN } from "./invoer.ts";
import { kan, navigeer, naVerwijderen, positieTekst, type FormulierDefinitie, type Navigatie, type Navigatieactie } from "./formulier-logica.ts";
import { laadBron, bronsoort } from "./bron.ts";
import { useDialogen } from "./Dialoog.tsx";
import { Raster } from "./Raster.tsx";
import { TabelWeergave } from "./TabelWeergave.tsx";
import { naarHostWaarde, vanHostWaarde, type VbaModule } from "./vba-sessie.ts";
import type { VbaBediening } from "./useVba.tsx";

/** Bestaat deze procedure in de module, en hoeveel parameters heeft hij? */
export function procedureIn(bron: string, naam: string): { parameters: number } | null {
  const m = new RegExp(`^[ \\t]*(?:(?:Public|Private|Friend|Static)[ \\t]+)*Sub[ \\t]+${naam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*\\(([^)]*)\\)`, "im").exec(bron);
  if (!m) return null;
  return { parameters: m[1].trim() ? m[1].split(",").length : 0 };
}

interface Bron {
  soort: "tabel" | "resultaat";
  /** Tabel waarin bewerkt wordt (bij een query: de basistabel als die bekend is). */
  tabel: TabelSchema | null;
  resultaat: QueryResultaat | null;
}
interface Huidig {
  rowid: number | null;
  waarden: Record<string, Waarde>;
}
interface Toestand {
  bron: Bron | null;
  bronnaam: string;
  nav: Navigatie;
  huidig: Huidig;
  concept: Record<string, string>;
  dirty: boolean;
  caption: string;
  eigenschappen: Map<string, { visible?: boolean; enabled?: boolean; locked?: boolean; caption?: string; tag?: string }>;
  ongebonden: Map<string, HostWaarde>;
}

export function Formulier({
  werkkopie,
  naam,
  bronnaam,
  definitie,
  tabellen,
  vba,
  module,
  metVba,
  onSluit,
  onOntwerp,
  onGewijzigd,
  onExporteer,
}: {
  werkkopie: Werkkopie;
  naam: string;
  bronnaam: string;
  definitie: FormulierDefinitie;
  tabellen: TabelSchema[];
  vba: VbaBediening;
  module: VbaModule | null;
  /** Gebeurtenissen uit de formuliermodule uitvoeren (na toestemming). */
  metVba: boolean;
  onSluit: () => void;
  onOntwerp?: () => void;
  onGewijzigd: () => void;
  onExporteer: (kolommen: string[], rijen: Waarde[][], soorten: (Veldsoort | null)[]) => void;
}) {
  const { t } = useTranslation("database");
  const dialogen = useDialogen();
  const id = useId();
  const [, teken] = useReducer((x: number) => x + 1, 0);
  const [fout, setFout] = useState("");
  const [laden, setLaden] = useState(true);
  const [gegevensblad, setGegevensblad] = useState(!!definitie.gegevensblad);
  const st = useRef<Toestand>({
    bron: null,
    bronnaam,
    nav: { index: 0, totaal: 0 },
    huidig: { rowid: null, waarden: {} },
    concept: {},
    dirty: false,
    caption: definitie.titel || naam,
    eigenschappen: new Map(),
    ongebonden: new Map(),
  });
  const s = st.current;
  const vbaRef = useRef(vba);
  vbaRef.current = vba;
  const gesloten = useRef(false);

  const soortVan = useCallback(
    (veld: string): Veldsoort | null => {
      const b = st.current.bron;
      const v = b?.tabel?.velden.find((x) => x.naam.toLowerCase() === veld.toLowerCase());
      if (v) return v.soort;
      const i = b?.resultaat?.kolommen.findIndex((k) => k.toLowerCase() === veld.toLowerCase()) ?? -1;
      return i >= 0 ? (b?.resultaat?.kolomsoorten?.[i] ?? null) : null;
    },
    [],
  );
  const schemaVan = (veld: string): VeldSchema | null =>
    st.current.bron?.tabel?.velden.find((x) => x.naam.toLowerCase() === veld.toLowerCase()) ?? null;
  const bewerkbaarVeld = (veld: string) => {
    const v = schemaVan(veld);
    return !!v && bewerkbaar(v.soort) && (st.current.bron?.soort === "tabel" || !!st.current.bron?.resultaat?.bron);
  };

  // ------------------------------------------------------------ VBA-gebeurtenissen
  async function gebeurtenis(procedure: string): Promise<{ geannuleerd: boolean }> {
    // Geneste gebeurtenissen (bv. Form_Current na Me.Requery in Form_Load) slaan we over.
    if (!metVba || !module || vbaRef.current.isBezig()) return { geannuleerd: false };
    const p = procedureIn(module.bron, procedure);
    if (!p) return { geannuleerd: false };
    const r = await vbaRef.current.voerUit(module.naam, procedure, p.parameters ? Array(p.parameters).fill(0) : []);
    teken();
    if (!r || !r.ok) return { geannuleerd: false };
    const cancel = p.parameters ? vanHostWaarde(r.argumenten[0] ?? null) : 0;
    return { geannuleerd: !!cancel && cancel !== "0" };
  }

  // ------------------------------------------------------------ gegevens
  async function laadBronOpnieuw(): Promise<boolean> {
    const naamBron = st.current.bronnaam;
    const soort = await bronsoort(werkkopie, naamBron);
    if (soort === "tabel") {
      const tabel = (await werkkopie.tabellen()).find((t) => t.naam.toLowerCase() === naamBron.toLowerCase())!;
      const { totaal } = await werkkopie.rijen(tabel.naam, { aantal: 0 });
      st.current.bron = { soort: "tabel", tabel, resultaat: null };
      st.current.nav = { index: Math.min(st.current.nav.index, totaal), totaal };
      return true;
    }
    const r = await laadBron(werkkopie, naamBron, dialogen);
    if (!r) return false;
    const tabel = r.bron ? (tabellen.find((t) => t.naam.toLowerCase() === r.bron!.tabel.toLowerCase()) ?? null) : null;
    st.current.bron = { soort: "resultaat", tabel, resultaat: r };
    st.current.nav = { index: Math.min(st.current.nav.index, r.rijen.length), totaal: r.rijen.length };
    return true;
  }

  async function haalRecord(index: number): Promise<Huidig> {
    const b = st.current.bron!;
    if (index >= st.current.nav.totaal) return { rowid: null, waarden: {} };
    if (b.soort === "tabel") {
      const { rijen } = await werkkopie.rijen(b.tabel!.naam, { start: index, aantal: 1 });
      return rijen[0] ? { rowid: rijen[0].rowid, waarden: rijen[0].waarden } : { rowid: null, waarden: {} };
    }
    const r = b.resultaat!;
    return {
      rowid: r.bron?.rowids[index] ?? null,
      waarden: Object.fromEntries(r.kolommen.map((k, i) => [k, r.rijen[index][i]])),
    };
  }

  function waardeVan(veld: string, waarden: Record<string, Waarde>): Waarde {
    const k = Object.keys(waarden).find((x) => x.toLowerCase() === veld.toLowerCase());
    return k === undefined ? null : waarden[k];
  }

  function zetConcept(h: Huidig) {
    st.current.huidig = h;
    st.current.dirty = false;
    st.current.concept = Object.fromEntries(definitie.velden.map((v) => [v.veld, bewerkTekst(waardeVan(v.veld, h.waarden), soortVan(v.veld))]));
  }

  /** Bewaart het huidige record; false bij een fout (die dan zichtbaar is). */
  async function bewaar(): Promise<boolean> {
    const tk = st.current;
    if (!tk.dirty) return true;
    const tabel = tk.bron?.tabel;
    if (!tabel) {
      setFout(t("form.readOnlyForm"));
      return false;
    }
    const waarden: Record<string, Waarde> = {};
    for (const v of definitie.velden) {
      const schema = schemaVan(v.veld);
      if (!schema || !bewerkbaar(schema.soort)) continue;
      const tekst = tk.concept[v.veld] ?? "";
      const oud = bewerkTekst(waardeVan(v.veld, tk.huidig.waarden), schema.soort);
      if (tk.huidig.rowid !== null && tekst === oud) continue;
      if (tk.huidig.rowid === null && !tekst.trim() && !schema.verplicht) continue;
      const r = leesInvoer(tekst, schema);
      if (!r.ok) {
        setFout(r.fout);
        document.getElementById(`${id}-${v.besturing}`)?.focus();
        return false;
      }
      waarden[schema.naam] = r.waarde;
    }
    if ((await gebeurtenis("Form_BeforeUpdate")).geannuleerd) {
      setFout(t("form.saveCancelled"));
      return false;
    }
    try {
      if (tk.huidig.rowid === null) {
        const rowid = await werkkopie.voegToe(tabel.naam, waarden);
        await laadBronOpnieuw();
        const rij = await werkkopie.rij(tabel.naam, rowid);
        if (tk.bron?.soort === "tabel") tk.nav = { ...tk.nav, index: tk.nav.totaal - 1 };
        zetConcept({ rowid, waarden: rij?.waarden ?? waarden });
      } else {
        if (Object.keys(waarden).length) await werkkopie.wijzig(tabel.naam, tk.huidig.rowid, waarden);
        const rij = await werkkopie.rij(tabel.naam, tk.huidig.rowid);
        zetConcept({ rowid: tk.huidig.rowid, waarden: rij?.waarden ?? tk.huidig.waarden });
      }
      setFout("");
      onGewijzigd();
      teken();
      await gebeurtenis("Form_AfterUpdate");
      return true;
    } catch (e) {
      setFout(leesbareFout(e));
      return false;
    }
  }

  async function gaNaar(actie: Navigatieactie | { naar: number }, opties: { bewaren?: boolean } = {}) {
    if (opties.bewaren !== false && !(await bewaar())) return;
    const nav = navigeer(st.current.nav, actie);
    setLaden(true);
    try {
      const h = await haalRecord(nav.index);
      st.current.nav = nav;
      zetConcept(h);
      setFout("");
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setLaden(false);
      teken();
    }
    await gebeurtenis("Form_Current");
  }

  async function requery() {
    st.current.dirty = false;
    setLaden(true);
    try {
      if (await laadBronOpnieuw()) {
        const h = await haalRecord(st.current.nav.index);
        zetConcept(h);
      }
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setLaden(false);
      teken();
    }
  }

  async function verwijderRecord() {
    const tk = st.current;
    if (!tk.bron?.tabel || tk.huidig.rowid === null) return;
    const ja = await dialogen.bevestig({
      titel: t("form.deleteTitle"),
      tekst: t("form.deleteText", { table: tk.bron.tabel.naam }),
      ja: t("common:delete"),
      gevaarlijk: true,
    });
    if (!ja) return;
    try {
      await werkkopie.verwijder(tk.bron.tabel.naam, tk.huidig.rowid);
      onGewijzigd();
      if (tk.bron.soort === "resultaat") {
        await laadBronOpnieuw();
        tk.nav = { ...tk.nav, index: Math.min(tk.nav.index, Math.max(0, tk.nav.totaal - 1)) };
      } else tk.nav = naVerwijderen(tk.nav);
      tk.dirty = false;
      await gaNaar({ naar: tk.nav.index }, { bewaren: false });
    } catch (e) {
      setFout(leesbareFout(e));
    }
  }

  async function sluit() {
    if (!(await bewaar())) {
      const ja = await dialogen.bevestig({
        titel: t("form.unsavedTitle"),
        tekst: t("form.unsavedText"),
        ja: t("form.closeWithoutSaving"),
        gevaarlijk: true,
      });
      if (!ja) return;
    }
    if (!gesloten.current) {
      gesloten.current = true;
      await gebeurtenis("Form_Close");
      onSluit();
    }
  }

  async function knop(naamKnop: string) {
    if (!module || !procedureIn(module.bron, `${naamKnop}_Click`)) {
      setFout(module ? t("form.buttonNoEvent", { button: naamKnop }) : t("form.buttonNoEventNoModule", { button: naamKnop, form: naam }));
      return;
    }
    if (!metVba) {
      setFout(t("form.vbaNotAllowed"));
      return;
    }
    await gebeurtenis(`${naamKnop}_Click`);
  }

  // ------------------------------------------------------------ registratie bij de VBA-runtime
  const sluitRef = useRef(sluit);
  sluitRef.current = sluit;
  const hostRef = useRef({ requery, gaNaar, bewaar });
  hostRef.current = { requery, gaNaar, bewaar };
  useEffect(() => {
    const zoekVeld = (b: string) => definitie.velden.find((v) => v.besturing.toLowerCase() === b.toLowerCase() || v.veld.toLowerCase() === b.toLowerCase());
    const zoekKnop = (b: string) => definitie.knoppen.find((k) => k.naam.toLowerCase() === b.toLowerCase());
    const eig = (b: string) => {
      const k = b.toLowerCase();
      let e = st.current.eigenschappen.get(k);
      if (!e) st.current.eigenschappen.set(k, (e = {}));
      return e;
    };
    const register = vba.sessie?.formulieren;
    if (!register) return;
    const weg = register.registreer({
      naam,
      heeftBesturing: (b) => !!zoekVeld(b) || !!zoekKnop(b) || st.current.ongebonden.has(b.toLowerCase()),
      lees(b, eigenschap) {
        const t = st.current;
        if (!b) {
          switch (eigenschap) {
            case "recordsource":
              return t.bronnaam;
            case "caption":
              return t.caption;
            case "name":
              return naam;
            case "dirty":
              return t.dirty;
            case "newrecord":
              return t.nav.index >= t.nav.totaal;
            case "currentrecord":
              return t.nav.index + 1;
            case "allowedits":
            case "allowadditions":
            case "allowdeletions":
            case "visible":
            case "hasmodule":
              return true;
            case "dataentry":
            case "modal":
            case "popup":
            case "filteron":
            case "orderbyon":
              return false;
            case "filter":
            case "orderby":
            case "tag":
              return "";
            case "openargs":
              return null;
          }
          throw new Error(i18next.t("database:form.runtime.formPropertyUnsupported", { property: eigenschap }));
        }
        const veld = zoekVeld(b);
        const knopDef = zoekKnop(b);
        const e = eig(b);
        switch (eigenschap) {
          case "value":
          case "text": {
            if (veld) {
              const tekst = t.concept[veld.veld] ?? "";
              const schema = schemaVan(veld.veld);
              if (!schema) return naarHostWaarde(waardeVan(veld.veld, t.huidig.waarden));
              const r = leesInvoer(tekst, { ...schema, verplicht: false });
              return eigenschap === "text" ? tekst : naarHostWaarde(r.ok ? r.waarde : tekst);
            }
            if (knopDef) return null;
            return st.current.ongebonden.get(b.toLowerCase()) ?? null;
          }
          case "visible":
            return e.visible ?? true;
          case "enabled":
            return e.enabled ?? true;
          case "locked":
            return e.locked ?? (veld ? !bewerkbaarVeld(veld.veld) : false);
          case "caption":
            return e.caption ?? veld?.label ?? knopDef?.label ?? "";
          case "tag":
            return e.tag ?? "";
          case "name":
            return veld?.besturing ?? knopDef?.naam ?? b;
          case "controlsource":
            return veld?.veld ?? "";
          case "oldvalue":
            return veld ? naarHostWaarde(waardeVan(veld.veld, t.huidig.waarden)) : null;
        }
        throw new Error(i18next.t("database:form.runtime.controlPropertyUnsupported", { property: eigenschap, control: b }));
      },
      zet(b, eigenschap, waarde) {
        const t = st.current;
        if (!b) {
          if (eigenschap === "caption") t.caption = String(vanHostWaarde(waarde) ?? "");
          else if (eigenschap === "recordsource") {
            t.bronnaam = String(vanHostWaarde(waarde) ?? "");
            t.nav = { index: 0, totaal: 0 };
            return hostRef.current.requery();
          } else if (eigenschap === "dirty") {
            if (!waarde) return hostRef.current.bewaar().then(() => undefined);
          } else throw new Error(i18next.t("database:form.runtime.formPropertyNotSettable", { property: eigenschap }));
          teken();
          return;
        }
        const veld = zoekVeld(b);
        const e = eig(b);
        switch (eigenschap) {
          case "value":
          case "text":
            if (veld) {
              t.concept[veld.veld] = bewerkTekst(vanHostWaarde(waarde), soortVan(veld.veld));
              t.dirty = true;
            } else st.current.ongebonden.set(b.toLowerCase(), waarde);
            break;
          case "visible":
            e.visible = !!waarde;
            break;
          case "enabled":
            e.enabled = !!waarde;
            break;
          case "locked":
            e.locked = !!waarde;
            break;
          case "caption":
            e.caption = String(vanHostWaarde(waarde) ?? "");
            break;
          case "tag":
            e.tag = String(vanHostWaarde(waarde) ?? "");
            break;
          case "backcolor":
          case "forecolor":
          case "fontbold":
            break; // opmaak wordt genegeerd
          default:
            throw new Error(i18next.t("database:form.runtime.controlPropertyNotSettable", { property: eigenschap, control: b }));
        }
        teken();
      },
      async roepAan(b, methode, args) {
        if (!b) {
          switch (methode) {
            case "requery":
              await hostRef.current.requery();
              return null;
            case "refresh":
            case "recalc":
            case "repaint":
            case "setfocus":
              teken();
              return null;
            case "undo":
              zetConcept(st.current.huidig);
              teken();
              return null;
            case "gotorecord": {
              const actie = String(vanHostWaarde(args[0] ?? null));
              const n = Number(vanHostWaarde(args[1] ?? null) ?? 1);
              if (actie === "naar") await hostRef.current.gaNaar({ naar: n - 1 });
              else await hostRef.current.gaNaar(actie as Navigatieactie);
              return null;
            }
          }
          throw new Error(i18next.t("database:form.runtime.formMethodUnsupported", { method: methode }));
        }
        switch (methode) {
          case "setfocus":
            document.getElementById(`${id}-${b}`)?.focus();
            return null;
          case "undo": {
            const veld = zoekVeld(b);
            if (veld) st.current.concept[veld.veld] = bewerkTekst(waardeVan(veld.veld, st.current.huidig.waarden), soortVan(veld.veld));
            teken();
            return null;
          }
          case "requery":
            return null;
        }
        throw new Error(i18next.t("database:form.runtime.controlMethodUnsupported", { method: methode, control: b }));
      },
    });
    return weg;
  }, [vba.sessie, naam, definitie, id, soortVan]);

  // ------------------------------------------------------------ openen
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        // StrictMode monteert twee keer: alleen de laatste montage opent het formulier.
        await Promise.resolve();
        if (!actief) return;
        if (!(await laadBronOpnieuw())) {
          onSluit();
          return;
        }
        if (!actief) return;
        zetConcept(await haalRecord(0));
        setLaden(false);
        teken();
        if ((await gebeurtenis("Form_Open")).geannuleerd) {
          gesloten.current = true;
          onSluit();
          return;
        }
        await gebeurtenis("Form_Load");
        await gebeurtenis("Form_Current");
      } catch (e) {
        if (actief) {
          setFout(t("form.loadFailed", { error: leesbareFout(e) }));
          setLaden(false);
        }
      }
    })();
    return () => {
      actief = false;
    };
    // Alleen bij openen; latere wijzigingen lopen via requery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = s.nav;
  const nieuw = n.index >= n.totaal;
  const alleenLezen = !s.bron?.tabel || (s.bron.soort === "resultaat" && !s.bron.resultaat?.bron);

  return (
    <div className="database-formulier" onKeyDown={(e) => {
      if (e.key === "PageDown" && !gegevensblad) {
        e.preventDefault();
        void gaNaar("volgende");
      } else if (e.key === "PageUp" && !gegevensblad) {
        e.preventDefault();
        void gaNaar("vorige");
      }
    }}>
      <div className="database-werkbalk" role="toolbar" aria-label={t("form.toolbar")}>
        <h3 className="database-formulier-titel">{s.caption}</h3>
        <button onClick={() => setGegevensblad(!gegevensblad)} aria-pressed={gegevensblad}>
          <Table2 size={16} /> {t("form.datasheet")}
        </button>
        {onOntwerp && (
          <button onClick={onOntwerp}>
            <LayoutTemplate size={16} /> {t("form.design")}
          </button>
        )}
        <button onClick={() => void sluit()}>
          <X size={16} /> {t("common:close")}
        </button>
      </div>
      {module && (
        <p className="muted">
          {metVba
            ? t("form.vbaLinked", { module: module.naam })
            : t("form.vbaSkipped", { module: module.naam })}
        </p>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {gegevensblad ? (
        s.bron?.soort === "tabel" && s.bron.tabel ? (
          <TabelWeergave
            werkkopie={werkkopie}
            schema={s.bron.tabel}
            onGewijzigd={() => {
              onGewijzigd();
              void requery();
            }}
            onExporteer={() => {
              void (async () => {
                const r = await werkkopie.query(`SELECT * FROM [${s.bron!.tabel!.naam}]`, { limiet: 1_000_000 });
                onExporteer(r.kolommen, r.rijen, r.kolommen.map((k) => soortVan(k)));
              })();
            }}
          />
        ) : s.bron?.resultaat ? (
          <Raster
            label={t("form.datasheetLabel", { name: naam })}
            kolommen={s.bron.resultaat.kolommen.map((k, i) => ({ naam: k, soort: s.bron!.resultaat!.kolomsoorten?.[i] ?? null }))}
            rijen={s.bron.resultaat.rijen.map((w, i) => ({ sleutel: i, waarden: w }))}
          />
        ) : null
      ) : (
        <form
          className="database-formulier-vlak"
          aria-label={s.caption}
          aria-busy={laden}
          onSubmit={(e) => {
            e.preventDefault();
            void bewaar();
          }}
        >
          {definitie.velden.map((v) => {
            const e = s.eigenschappen.get(v.besturing.toLowerCase()) ?? {};
            if (e.visible === false) return null;
            const soort = soortVan(v.veld);
            const vergrendeld = alleenLezen || e.locked || !bewerkbaarVeld(v.veld);
            const veldId = `${id}-${v.besturing}`;
            return (
              <label key={v.besturing} className="database-formulierveld" htmlFor={veldId}>
                <span>{e.caption ?? v.label}</span>
                {soort === "jaNee" ? (
                  <input
                    id={veldId}
                    type="checkbox"
                    disabled={vergrendeld || e.enabled === false || laden}
                    checked={/^(ja|waar|true|-1|1)$/i.test(s.concept[v.veld] ?? "")}
                    onChange={(ev) => {
                      s.concept[v.veld] = ev.target.checked ? "Ja" : "Nee";
                      s.dirty = true;
                      teken();
                    }}
                  />
                ) : soort === "memo" ? (
                  <textarea
                    id={veldId}
                    rows={4}
                    readOnly={vergrendeld}
                    disabled={e.enabled === false || laden}
                    value={s.concept[v.veld] ?? ""}
                    onChange={(ev) => {
                      s.concept[v.veld] = ev.target.value;
                      s.dirty = true;
                      teken();
                    }}
                  />
                ) : (
                  <input
                    id={veldId}
                    readOnly={vergrendeld}
                    disabled={e.enabled === false || laden}
                    placeholder={soort === "autonummer" && nieuw ? t("form.autoNumberPlaceholder") : soort === "datum" ? t("form.datePlaceholder") : undefined}
                    value={s.concept[v.veld] ?? ""}
                    onFocus={(ev) => (ev.currentTarget.dataset.begin = ev.currentTarget.value)}
                    onBlur={(ev) => {
                      if (ev.currentTarget.dataset.begin !== ev.currentTarget.value) void gebeurtenis(`${v.besturing}_AfterUpdate`);
                    }}
                    onChange={(ev) => {
                      s.concept[v.veld] = ev.target.value;
                      s.dirty = true;
                      teken();
                    }}
                  />
                )}
                {soort && <small>{SOORTNAMEN[soort]}</small>}
              </label>
            );
          })}
          {!!definitie.knoppen.length && (
            <div className="database-formulierknoppen">
              {definitie.knoppen.map((k) => {
                const e = s.eigenschappen.get(k.naam.toLowerCase()) ?? {};
                if (e.visible === false) return null;
                return (
                  <button key={k.naam} type="button" disabled={e.enabled === false || laden || !!vba.bezig} onClick={() => void knop(k.naam)}>
                    {e.caption ?? k.label}
                  </button>
                );
              })}
            </div>
          )}
          <button type="submit" hidden />
        </form>
      )}
      {!gegevensblad && (
        <nav className="database-recordnavigatie" aria-label={t("form.navigation")}>
          <button type="button" aria-label={t("form.firstRecord")} disabled={laden || !kan(n, "eerste")} onClick={() => void gaNaar("eerste")}>
            <ChevronFirst size={16} />
          </button>
          <button type="button" aria-label={t("form.previousRecord")} disabled={laden || !kan(n, "vorige")} onClick={() => void gaNaar("vorige")}>
            <ChevronLeft size={16} />
          </button>
          <span role="status" aria-live="polite">
            {laden ? t("common:loading") : positieTekst(n)}
            {s.dirty ? ` · ${t("form.modified")}` : ""}
          </span>
          <button type="button" aria-label={t("form.nextRecord")} disabled={laden || !kan(n, "volgende")} onClick={() => void gaNaar("volgende")}>
            <ChevronRight size={16} />
          </button>
          <button type="button" aria-label={t("form.lastRecord")} disabled={laden || !kan(n, "laatste")} onClick={() => void gaNaar("laatste")}>
            <ChevronLast size={16} />
          </button>
          <button type="button" disabled={laden || alleenLezen || !kan(n, "nieuw")} onClick={() => void gaNaar("nieuw")}>
            <Plus size={16} /> {t("form.new")}
          </button>
          <button type="button" className="primary" disabled={laden || !s.dirty} onClick={() => void bewaar()}>
            <Save size={16} /> {t("common:save")}
          </button>
          <button
            type="button"
            disabled={laden || !s.dirty}
            onClick={() => {
              zetConcept(s.huidig);
              setFout("");
              teken();
            }}
          >
            <Undo2 size={16} /> {t("form.undo")}
          </button>
          <button type="button" disabled={laden || alleenLezen || !kan(n, "verwijderen")} onClick={() => void verwijderRecord()}>
            <Trash2 size={16} /> {t("common:delete")}
          </button>
        </nav>
      )}
      {alleenLezen && s.bron && (
        <p className="muted">{t("form.readOnlyNote")}</p>
      )}
    </div>
  );
}
