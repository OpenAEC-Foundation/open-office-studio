import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Table2, ChevronDown, Filter } from "lucide-react";
import type {
  XlsxEditorApi,
  XlsxPluginGeometry,
} from "@betteroffice/xlsx-react";
import { Actie, Groep } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import {
  alleenLezen,
  leesSelectie,
  bewerktTekst,
} from "../lint/rekenblad-opdrachten";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { ontleedAdres } from "../lint/rekenblad-logica";
import { FilterMenu } from "../lint/rekenblad-filtermenu";
import { zichtbareRijen, type KolomFilter } from "../lint/rekenblad-filter";
import { a1, bevat, gebied } from "./werkboekXml";
import { openRekenbladVenster } from "./RekenbladExtra";
import { leesBeveiliging } from "./beveiliging";
import { type Tabelstijl } from "./tabelstijl";
import {
  gegevensTabelRef,
  leesTabellen,
  nieuweTabelkeuze,
  schrijfTabel,
  schrijfTabelFilter,
  sorteerTabel,
  tabellen,
  tabelFilter,
  tabelFilterCellen,
  Tabelfout,
  type Tabel,
  type Tabelkeuze,
  type Totaalfunctie,
} from "./tabellen";
import "./celstijlen.css";

export function TabelGroep() {
  const { t } = useTranslation("spreadsheet"),
    { rekenblad: api } = useEditorApi();
  return (
    <Groep naam={t("tables.group")}>
      <Actie
        naam={t("tables.title")}
        icoon={Table2}
        groot
        disabled={!api || alleenLezen(api)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => openRekenbladVenster({ soort: "tabel" })}
      />
    </Groep>
  );
}
export function TabelVenster({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet"),
    { herlaad } = useEditorApi();
  const [sel] = useState(() => {
    try {
      return leesSelectie(api);
    } catch {
      return null;
    }
  });
  const [keuze, setKeuze] = useState<Tabelkeuze>(() =>
    nieuweTabelkeuze(sel ? a1(sel.bereik) : ""),
  );
  const [bestaand, setBestaand] = useState<Tabel | null>(null),
    [status, setStatus] = useState(""),
    [gereed, setGereed] = useState(false),
    [bezig, setBezig] = useState(false);
  const versie = useRef(""),
    actief = useRef(true),
    lopend = useRef(false);
  const uit = !sel || !herlaad || !gereed || bezig || alleenLezen(api);
  const fout = (e: unknown) =>
    e instanceof Tabelfout ? t(`tables.errors.${e.code}`) : tekstVan(e);
  useEffect(() => {
    let stop = false;
    actief.current = true;
    void (async () => {
      if (!sel || !herlaad) throw new Error(t("styles.errors.noSelection"));
      const v = await api.version(),
        bytes = await herlaad.bytes();
      if (stop) return;
      if ((await api.version()) !== v)
        throw new Error(t("notes.errors.changed"));
      if (leesBeveiliging(bytes).bladen[sel.blad].actief)
        throw new Tabelfout("protectedSheet");
      const lijst = leesTabellen(bytes),
        oud = lijst[sel.blad].find((t) =>
          bevat(gebied(t.ref), sel.focus.row, sel.focus.col),
        );
      versie.current = v;
      if (oud) {
        setBestaand(oud);
        setKeuze({
          naam: oud.naam,
          ref: gegevensTabelRef(oud),
          kop: oud.kop,
          totaal: oud.totaal,
          filters: oud.filters,
          banden: oud.banden,
          stijl: "existing",
        });
      } else {
        let n = 1;
        while (lijst.flat().some((t) => t.naam.toLowerCase() === `table${n}`))
          n++;
        setKeuze((k) => ({ ...k, naam: `Table${n}` }));
      }
      setGereed(true);
    })().catch((e) => {
      if (!stop) setStatus(fout(e));
    });
    return () => {
      stop = true;
      actief.current = false;
    };
  }, [api, herlaad, sel]);
  function wijzig<K extends keyof Tabelkeuze>(key: K, value: Tabelkeuze[K]) {
    setKeuze((k) => ({ ...k, [key]: value }));
  }
  async function bewaar() {
    if (uit || lopend.current || !sel || !herlaad) return;
    lopend.current = true;
    setBezig(true);
    setStatus("");
    try {
      if (alleenLezen(api) || (await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const bytes = await herlaad.bytes();
      if (!actief.current) return;
      if (alleenLezen(api) || (await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const uit = schrijfTabel(bytes, sel.blad, bestaand?.id ?? null, keuze);
      herlaad.vervang(uit, { blad: sel.blad, cel: sel.focus });
      sluiten();
    } catch (e) {
      if (actief.current) setStatus(fout(e));
    } finally {
      lopend.current = false;
      if (actief.current) setBezig(false);
    }
  }
  const kolommen = bestaand?.kolommen ?? [];
  return (
    <Paneel titel={t("tables.title")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier celstijl-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar();
        }}
      >
        <label>
          {t("tables.name")}
          <input
            value={keuze.naam}
            disabled={uit || !!bestaand}
            onChange={(e) => wijzig("naam", e.target.value)}
          />
        </label>
        <label>
          {t("tables.range")}
          <input
            value={keuze.ref}
            disabled={uit}
            onChange={(e) => wijzig("ref", e.target.value)}
          />
        </label>
        <label>
          {t("tables.style")}
          <select
            aria-label={t("tables.style")}
            value={keuze.stijl}
            disabled={uit}
            onChange={(e) => wijzig("stijl", e.target.value as Tabelstijl)}
          >
            {bestaand && (
              <option value="existing">
                {t("tables.existingStyle", {
                  style: bestaand.stijl || t("tables.styles.none"),
                })}
              </option>
            )}
            {(["blue", "green", "orange", "none"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`tables.styles.${s}`)}
              </option>
            ))}
          </select>
        </label>
        {(["kop", "totaal", "banden", "filters"] as const).map((k) => (
          <label className="celstijl-vink" key={k}>
            <input
              type="checkbox"
              checked={keuze[k]}
              disabled={uit || (k === "filters" && !keuze.kop)}
              onChange={(e) => wijzig(k, e.target.checked)}
            />
            {t(`tables.${k}`)}
          </label>
        ))}
        {keuze.totaal && kolommen.length > 0 && (
          <fieldset>
            <legend>{t("tables.totals")}</legend>
            {kolommen.map((k, i) => (
              <label key={k.id}>
                {k.naam}
                <select
                  aria-label={k.naam}
                  disabled={uit}
                  value={
                    keuze.totalen?.[i] ??
                    (bestaand?.totaal ? k.totaal : i > 0 ? "sum" : "none")
                  }
                  onChange={(e) => {
                    const totaal = kolommen.map(
                      (k, j) =>
                        keuze.totalen?.[j] ??
                        (bestaand?.totaal ? k.totaal : j > 0 ? "sum" : "none"),
                    );
                    totaal[i] = e.target.value as Totaalfunctie;
                    wijzig("totalen", totaal);
                  }}
                >
                  {(
                    ["none", "sum", "count", "average", "min", "max"] as const
                  ).map((f) => (
                    <option key={f} value={f}>
                      {t(`tables.functions.${f}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        )}
        <p className="rekenblad-hint">{t("tables.growHint")}</p>
        <p className="rekenblad-hint">{t("tables.reloadHint")}</p>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:close")}
          </button>
          <button type="submit" className="rekenblad-primair" disabled={uit}>
            {t("common:save")}
          </button>
        </div>
      </form>
    </Paneel>
  );
}

export function TabelLaag({
  api,
  blad,
  geometry,
  focus,
}: {
  api: XlsxEditorApi;
  blad: number;
  geometry: XlsxPluginGeometry;
  focus: { row: number; col: number } | null;
}) {
  const { t } = useTranslation("spreadsheet"),
    { herlaad } = useEditorApi();
  const [, ververs] = useState(0),
    [open, setOpen] = useState<{
      tabel: Tabel;
      kolom: number;
      anker: DOMRect;
      versie: string;
    } | null>(null);
  const host = useRef<HTMLSpanElement>(null),
    lopend = useRef(false);
  useEffect(
    () =>
      api.handle.onUpdate(() => {
        setOpen(null);
        ververs((n) => n + 1);
      }),
    [api],
  );
  useEffect(() => setOpen(null), [blad]);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (
        !e.altKey ||
        e.key !== "ArrowDown" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        bewerktTekst()
      )
        return;
      const editor = host.current?.closest(".office-rekenblad-host"),
        actief = document.activeElement;
      if (
        !editor ||
        editor.closest("[hidden]") ||
        (actief && actief !== document.body && !editor.contains(actief))
      )
        return;
      // The selection can advance before React has replaced this listener.
      const cel =
        ontleedAdres(
          editor.querySelector<HTMLInputElement>(
            '[data-testid="xlsx-name-box"]',
          )?.value ?? "",
        ) ?? focus;
      if (!cel) return;
      const knop = editor.querySelector<HTMLButtonElement>(
        `.rekenblad-tabelpijl[data-rij="${cel.row}"][data-kolom="${cel.col}"]`,
      );
      if (knop) {
        e.preventDefault();
        e.stopPropagation();
        knop.click();
      }
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, [focus]);
  let lijst: Tabel[];
  try {
    lijst = tabellen(api.handle, blad);
  } catch {
    return null;
  }
  async function vervang(maak: (bytes: Uint8Array) => Uint8Array) {
    if (!open || !herlaad || alleenLezen(api) || lopend.current) return;
    lopend.current = true;
    try {
      const bytes = await herlaad.bytes();
      if ((await api.version()) !== open.versie || alleenLezen(api))
        throw new Error(t("notes.errors.changed"));
      herlaad.vervang(maak(bytes), {
        blad,
        cel: focus ?? {
          row: gebied(open.tabel.ref).top,
          col: gebied(open.tabel.ref).left,
        },
      });
    } finally {
      lopend.current = false;
    }
  }
  async function pasToe(kf: KolomFilter | null) {
    if (open)
      return vervang((bytes) =>
        schrijfTabelFilter(bytes, blad, open.tabel.id, open.kolom, kf),
      );
  }
  return (
    <>
      <span ref={host} />
      {lijst
        .filter((t) => t.kop && t.filters)
        .flatMap((tabel) => {
          const b = gebied(tabel.ref);
          return tabel.kolommen.map((k, i) => {
            const r = geometry.getCellRect({
              sheetId: geometry.layout.sheetId,
              row: b.top,
              col: b.left + i,
            });
            if (!r || r.width < 8 || r.height < 8) return null;
            const size = Math.min(17, r.height - 2, r.width - 2),
              actief = tabel.criteria.has(i),
              Icon = actief ? Filter : ChevronDown;
            return (
              <button
                key={`${tabel.id}-${k.id}`}
                className={`rekenblad-filterpijl rekenblad-tabelpijl${actief ? " is-actief" : ""}`}
                data-rij={b.top}
                data-kolom={b.left + i}
                type="button"
                aria-label={t("data.filter.menuLabel", { column: k.naam })}
                title={t("data.filter.menuLabel", { column: k.naam })}
                disabled={!herlaad || alleenLezen(api)}
                style={{
                  left: r.x + r.width - size - 1,
                  top: r.y + (r.height - size) / 2,
                  width: size,
                  height: size,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen({
                    tabel,
                    kolom: i,
                    anker: e.currentTarget.getBoundingClientRect(),
                    versie: api.handle.version(),
                  });
                }}
              >
                <Icon size={12} />
              </button>
            );
          });
        })}
      {open && (
        <FilterMenu
          key={`${open.tabel.id}-${open.kolom}`}
          api={api}
          blad={blad}
          sheetId={geometry.layout.sheetId}
          kolom={gebied(open.tabel.ref).left + open.kolom}
          anker={open.anker}
          sluit={() => {
            setOpen(null);
            api.focus();
          }}
          tabel={{
            filter: tabelFilter(open.tabel),
            hint: t("tables.reloadHint"),
            toepassen: pasToe,
            sorteren: (aflopend) =>
              vervang((bytes) =>
                sorteerTabel(bytes, blad, open.tabel.id, open.kolom, aflopend),
              ),
            cellen: async () => {
              const f = tabelFilter(open.tabel),
                cellen = tabelFilterCellen(api.handle, blad, f),
                andere = new Map(
                  [...f.kolommen].filter(([k]) => k !== open.kolom),
                ),
                eigen = cellen.get(open.kolom) ?? [],
                zicht = zichtbareRijen(eigen.length, cellen, andere);
              return { cellen: eigen.filter((_, i) => zicht[i]) };
            },
          }}
        />
      )}
    </>
  );
}
