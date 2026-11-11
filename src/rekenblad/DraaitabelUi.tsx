import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TableProperties } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Actie, Groep } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { alleenLezen, leesSelectie } from "../lint/rekenblad-opdrachten";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { ontleedAdres } from "../lint/rekenblad-logica";
import { openRekenbladVenster } from "./RekenbladExtra";
import { a1, bevat } from "./werkboekXml";
import { leesTabellen } from "./tabellen";
import {
  draaitabelBereik,
  leesDraaibron,
  leesDraaitabellen,
  schrijfDraaitabel,
  type DraaiKeuze,
  type Draaitabel,
} from "./draaitabellen";
import {
  draaiVeldleden,
  Draaifout,
  type DraaiBron,
  type DraaiVeld,
  type DraaiWaarde,
} from "./draaitabelRekenen";
import "./draaitabellen.css";

type Vak = "rijen" | "kolommen" | "waarden" | "filters";
const vakken: Vak[] = ["rijen", "kolommen", "waarden", "filters"];
const functies = ["sum", "count", "average", "min", "max"] as const;
const weergaven = [
  "normal",
  "grandPercent",
  "rowPercent",
  "columnPercent",
] as const;
const id = () => crypto.randomUUID();

export function DraaitabelGroep() {
  const { t } = useTranslation("spreadsheet"),
    { rekenblad: api } = useEditorApi();
  return (
    <Groep naam={t("pivots.group")}>
      <Actie
        naam={t("pivots.title")}
        icoon={TableProperties}
        groot
        disabled={!api || alleenLezen(api)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => openRekenbladVenster({ soort: "draaitabel" })}
      />
    </Groep>
  );
}

export function DraaitabelVenster({
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
  const [cfg, setCfg] = useState<DraaiKeuze>(() => ({
    naam: "Pivot1",
    bron: { blad: sel?.blad ?? 0, ref: sel ? a1(sel.bereik) : "A1" },
    doel: { blad: null, nieuwBlad: "Pivot", cel: "A1" },
    rijen: [],
    kolommen: [],
    waarden: [],
    filters: [],
  }));
  const [snapshot, setSnapshot] = useState<Uint8Array | null>(null),
    [oud, setOud] = useState<Draaitabel | null>(null);
  const [bron, setBron] = useState<DraaiBron | null>(null),
    [bladen, setBladen] = useState<string[]>([]),
    [tabellen, setTabellen] = useState<
      { naam: string; blad: number; ref: string }[]
    >([]);
  const [status, setStatus] = useState(""),
    [bezig, setBezig] = useState(false),
    [gereed, setGereed] = useState(false),
    [veld, setVeld] = useState(0);
  const versie = useRef(""),
    actief = useRef(true),
    lopend = useRef(false),
    geladenBron = useRef("");
  const fout = (e: unknown) =>
    e instanceof Draaifout ? t(`pivots.errors.${e.code}`) : tekstVan(e);
  const bronKey = (k: DraaiKeuze) => JSON.stringify(k.bron);
  const uit =
    !gereed || bezig || !herlaad || alleenLezen(api) || (!!oud && !oud.keuze);
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
      const tables = leesDraaitabellen(bytes),
        existing = tables.find(
          (p) =>
            p.blad === sel.blad &&
            bevat(draaitabelBereik(p), sel.focus.row, sel.focus.col),
        );
      let k = cfg;
      if (existing) {
        setOud(existing);
        if (existing.keuze) k = existing.keuze;
        else setStatus(t("pivots.legacyHint"));
      } else {
        let n = 1;
        while (tables.some((p) => p.naam.toLowerCase() === `pivot${n}`)) n++;
        k = { ...cfg, naam: `Pivot${n}` };
      }
      setCfg(k);
      setSnapshot(bytes);
      setBladen(api.handle.sheetInfo().sheetNames);
      setTabellen(
        leesTabellen(bytes).flatMap((ts, blad) =>
          ts.map((p) => ({ naam: p.naam, blad, ref: p.ref })),
        ),
      );
      versie.current = v;
      if (!existing || existing.keuze) {
        try {
          setBron(leesDraaibron(api.handle, bytes, k.bron).bron);
          geladenBron.current = bronKey(k);
        } catch (e) {
          setStatus(fout(e));
        }
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

  function leesBron() {
    if (!snapshot || uit) return;
    try {
      const b = leesDraaibron(api.handle, snapshot, cfg.bron).bron;
      if (JSON.stringify(b.koppen) !== JSON.stringify(bron?.koppen))
        setCfg((k) => ({
          ...k,
          rijen: [],
          kolommen: [],
          waarden: [],
          filters: [],
        }));
      setBron(b);
      geladenBron.current = bronKey(cfg);
      setStatus("");
      setVeld(0);
    } catch (e) {
      setStatus(fout(e));
    }
  }
  function voeg(vak: Vak, kolom: number) {
    if (
      uit ||
      !bron ||
      bronKey(cfg) !== geladenBron.current ||
      !Number.isInteger(kolom) ||
      !bron.koppen[kolom]
    )
      return;
    setCfg((k) => {
      if (vak === "waarden") {
        const basis = `${t("pivots.functions.sum")} ${bron.koppen[kolom]}`;
        let naam = basis,
          n = 2;
        while (
          k.waarden.some((v) => v.naam.toLowerCase() === naam.toLowerCase())
        )
          naam = `${basis} (${n++})`;
        return {
          ...k,
          waarden: [
            ...k.waarden,
            { id: id(), kolom, functie: "sum", weergave: "normal", naam },
          ],
        };
      }
      // Moving an ungrouped field between axes retains distinct grouped instances.
      if (k[vak].some((v) => v.kolom === kolom && !v.groep)) return k;
      const next = {
        ...k,
        rijen: k.rijen.filter((v) => v.kolom !== kolom || !!v.groep),
        kolommen: k.kolommen.filter((v) => v.kolom !== kolom || !!v.groep),
        filters: k.filters.filter((v) => v.kolom !== kolom || !!v.groep),
      };
      return {
        ...next,
        [vak]: [
          ...next[vak],
          { id: id(), kolom, ...(vak === "filters" ? { gekozen: null } : {}) },
        ],
      };
    });
  }
  function wijzig(
    vak: Vak,
    index: number,
    patch: Partial<DraaiVeld & DraaiWaarde>,
  ) {
    setCfg((k) => ({
      ...k,
      [vak]: k[vak].map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  }
  function verplaats(vak: Vak, index: number, stap: number) {
    setCfg((k) => {
      const fields = [...k[vak]],
        j = index + stap;
      if (j < 0 || j >= fields.length) return k;
      [fields[index], fields[j]] = [fields[j], fields[index]];
      return { ...k, [vak]: fields };
    });
  }
  async function bewaar() {
    if (uit || lopend.current || !herlaad || !bron) return;
    lopend.current = true;
    setBezig(true);
    setStatus("");
    try {
      if (bronKey(cfg) !== geladenBron.current)
        throw new Error(t("pivots.readSourceFirst"));
      if (alleenLezen(api) || (await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const bytes = await herlaad.bytes();
      if (!actief.current) return;
      if (alleenLezen(api) || (await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const out = schrijfDraaitabel(bytes, oud?.pad ?? null, cfg);
      herlaad.vervang(out.bytes, {
        blad: out.blad,
        cel: ontleedAdres(cfg.doel.cel) ?? { row: 0, col: 0 },
      });
      sluiten();
    } catch (e) {
      if (actief.current) setStatus(fout(e));
    } finally {
      lopend.current = false;
      if (actief.current) setBezig(false);
    }
  }
  if (oud && !oud.keuze)
    return (
      <Paneel titel={t("pivots.title")} sluiten={sluiten}>
        <p>
          <strong>{oud.naam}</strong> · {bladen[oud.blad]}!{oud.ref}
        </p>
        <p role="status">{t("pivots.legacyHint")}</p>
        <button type="button" onClick={sluiten}>
          {t("common:close")}
        </button>
      </Paneel>
    );
  return (
    <Paneel titel={t("pivots.title")} sluiten={sluiten} breed>
      <form
        className="rekenblad-formulier draaitabel-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar();
        }}
      >
        <label>
          {t("pivots.name")}
          <input
            value={cfg.naam}
            disabled={uit}
            onChange={(e) => setCfg((k) => ({ ...k, naam: e.target.value }))}
          />
        </label>
        <fieldset disabled={uit}>
          <legend>{t("pivots.source")}</legend>
          <label>
            {t("pivots.sourceTable")}
            <select
              aria-label={t("pivots.sourceTable")}
              value={cfg.bron.tabel ?? ""}
              onChange={(e) => {
                const tb = tabellen.find((p) => p.naam === e.target.value);
                setCfg((k) => ({
                  ...k,
                  bron: tb
                    ? { blad: tb.blad, ref: tb.ref, tabel: tb.naam }
                    : { blad: k.bron.blad, ref: k.bron.ref },
                }));
              }}
            >
              <option value="">{t("pivots.range")}</option>
              {tabellen.map((p) => (
                <option key={p.naam} value={p.naam}>
                  {p.naam}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("pivots.sourceSheet")}
            <select
              aria-label={t("pivots.sourceSheet")}
              disabled={!!cfg.bron.tabel}
              value={cfg.bron.blad}
              onChange={(e) =>
                setCfg((k) => ({
                  ...k,
                  bron: { ...k.bron, blad: Number(e.target.value) },
                }))
              }
            >
              {bladen.map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("pivots.sourceRange")}
            <input
              disabled={!!cfg.bron.tabel}
              value={cfg.bron.ref}
              onChange={(e) =>
                setCfg((k) => ({
                  ...k,
                  bron: { ...k.bron, ref: e.target.value },
                }))
              }
            />
          </label>
          <button type="button" onClick={leesBron}>
            {t("pivots.readFields")}
          </button>
        </fieldset>
        <fieldset disabled={uit || !!oud}>
          <legend>{t("pivots.target")}</legend>
          <label>
            {t("pivots.targetSheet")}
            <select
              aria-label={t("pivots.targetSheet")}
              value={cfg.doel.blad ?? "new"}
              onChange={(e) =>
                setCfg((k) => ({
                  ...k,
                  doel: {
                    ...k.doel,
                    blad:
                      e.target.value === "new" ? null : Number(e.target.value),
                  },
                }))
              }
            >
              <option value="new">{t("pivots.newSheet")}</option>
              {bladen.map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {cfg.doel.blad === null && (
            <label>
              {t("pivots.newSheetName")}
              <input
                value={cfg.doel.nieuwBlad}
                onChange={(e) =>
                  setCfg((k) => ({
                    ...k,
                    doel: { ...k.doel, nieuwBlad: e.target.value },
                  }))
                }
              />
            </label>
          )}
          <label>
            {t("pivots.targetCell")}
            <input
              value={cfg.doel.cel}
              onChange={(e) =>
                setCfg((k) => ({
                  ...k,
                  doel: { ...k.doel, cel: e.target.value },
                }))
              }
            />
          </label>
        </fieldset>
        <fieldset
          disabled={uit || !bron || bronKey(cfg) !== geladenBron.current}
        >
          <legend>{t("pivots.fields")}</legend>
          <p>{t("pivots.dragHint")}</p>
          <div className="draaitabel-bronvelden">
            {bron?.koppen.map((n, i) => (
              <span
                key={i}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData(
                    "application/x-oos-pivot-field",
                    String(i),
                  )
                }
              >
                {n}
              </span>
            ))}
          </div>
          <div className="draaitabel-toevoegen">
            <label>
              {t("pivots.field")}
              <select
                aria-label={t("pivots.field")}
                value={veld}
                onChange={(e) => setVeld(Number(e.target.value))}
              >
                {bron?.koppen.map((n, i) => (
                  <option key={i} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {vakken.map((v) => (
              <button key={v} type="button" onClick={() => voeg(v, veld)}>
                {t(`pivots.add.${v}`)}
              </button>
            ))}
          </div>
          <div className="draaitabel-vakken">
            {vakken.map((vak) => (
              <section
                className="draaitabel-vak"
                data-pivot-zone={vak}
                aria-label={t(`pivots.zones.${vak}`)}
                key={vak}
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes(
                      "application/x-oos-pivot-field",
                    )
                  )
                    e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData(
                    "application/x-oos-pivot-field",
                  );
                  if (/^\d+$/.test(raw)) voeg(vak, Number(raw));
                }}
              >
                <h3>{t(`pivots.zones.${vak}`)}</h3>
                {cfg[vak].map((v, i) => (
                  <div
                    className="draaitabel-veld"
                    key={v.id}
                    data-pivot-field={bron?.koppen[v.kolom]}
                  >
                    <strong>{bron?.koppen[v.kolom]}</strong>
                    <div className="draaitabel-veldknoppen">
                      <button
                        type="button"
                        title={t("pivots.up")}
                        aria-label={t("pivots.up")}
                        disabled={i === 0}
                        onClick={() => verplaats(vak, i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title={t("pivots.down")}
                        aria-label={t("pivots.down")}
                        disabled={i === cfg[vak].length - 1}
                        onClick={() => verplaats(vak, i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCfg((k) => ({
                            ...k,
                            [vak]: k[vak].filter((_, j) => j !== i),
                          }))
                        }
                      >
                        {t("pivots.remove")}
                      </button>
                    </div>
                    {vak === "waarden" ? (
                      <>
                        <label>
                          {t("pivots.caption")}
                          <input
                            value={(v as DraaiWaarde).naam}
                            onChange={(e) =>
                              wijzig(vak, i, { naam: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          {t("pivots.aggregate")}
                          <select
                            aria-label={t("pivots.aggregate")}
                            value={(v as DraaiWaarde).functie}
                            onChange={(e) =>
                              wijzig(vak, i, {
                                functie: e.target
                                  .value as DraaiWaarde["functie"],
                              })
                            }
                          >
                            {functies.map((f) => (
                              <option key={f} value={f}>
                                {t(`pivots.functions.${f}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t("pivots.showAs")}
                          <select
                            aria-label={t("pivots.showAs")}
                            value={(v as DraaiWaarde).weergave}
                            onChange={(e) =>
                              wijzig(vak, i, {
                                weergave: e.target
                                  .value as DraaiWaarde["weergave"],
                              })
                            }
                          >
                            {weergaven.map((f) => (
                              <option key={f} value={f}>
                                {t(`pivots.show.${f}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <>
                        <label>
                          {t("pivots.sort")}
                          <select
                            aria-label={t("pivots.sort")}
                            value={(v as DraaiVeld).aflopend ? "desc" : "asc"}
                            onChange={(e) =>
                              wijzig(vak, i, {
                                aflopend: e.target.value === "desc",
                              })
                            }
                          >
                            <option value="asc">{t("pivots.ascending")}</option>
                            <option value="desc">
                              {t("pivots.descending")}
                            </option>
                          </select>
                        </label>
                        <label>
                          {t("pivots.grouping")}
                          <select
                            aria-label={t("pivots.grouping")}
                            value={
                              (v as DraaiVeld).groep?.soort === "getal"
                                ? "interval"
                                : (v as DraaiVeld).groep?.soort === "datum"
                                  ? (
                                      (v as DraaiVeld).groep as {
                                        eenheid: string;
                                      }
                                    ).eenheid
                                  : "none"
                            }
                            onChange={(e) =>
                              wijzig(vak, i, {
                                groep:
                                  e.target.value === "none"
                                    ? undefined
                                    : e.target.value === "interval"
                                      ? { soort: "getal", stap: 10 }
                                      : {
                                          soort: "datum",
                                          eenheid: e.target.value as
                                            | "year"
                                            | "quarter"
                                            | "month",
                                        },
                                gekozen: null,
                              })
                            }
                          >
                            {[
                              "none",
                              "year",
                              "quarter",
                              "month",
                              "interval",
                            ].map((g) => (
                              <option key={g} value={g}>
                                {t(`pivots.groupingOptions.${g}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {(v as DraaiVeld).groep?.soort === "getal" && (
                          <label>
                            {t("pivots.interval")}
                            <input
                              type="number"
                              min="0.00000001"
                              step="any"
                              value={
                                ((v as DraaiVeld).groep as { stap: number })
                                  .stap
                              }
                              onChange={(e) =>
                                wijzig(vak, i, {
                                  groep: {
                                    soort: "getal",
                                    stap: Number(e.target.value),
                                  },
                                  gekozen: null,
                                })
                              }
                            />
                          </label>
                        )}
                        {bron && (
                          <Leden
                            bron={bron}
                            veld={v as DraaiVeld}
                            wijzig={(patch) => wijzig(vak, i, patch)}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </fieldset>
        <p className="rekenblad-hint">{t("pivots.reloadHint")}</p>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:close")}
          </button>
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={uit || !bron || !cfg.waarden.length}
          >
            {oud ? t("pivots.refresh") : t("pivots.create")}
          </button>
        </div>
      </form>
    </Paneel>
  );
}

function Leden({
  bron,
  veld,
  wijzig,
}: {
  bron: DraaiBron;
  veld: DraaiVeld;
  wijzig: (p: Partial<DraaiVeld>) => void;
}) {
  const { t } = useTranslation("spreadsheet"),
    [zoek, setZoek] = useState(""),
    [open, setOpen] = useState(false);
  let leden: ReturnType<typeof draaiVeldleden> = [];
  try {
    if (open) leden = draaiVeldleden(bron, veld);
  } catch {
    return null;
  }
  const zichtbaar = leden
    .filter((m) =>
      m.tekst.toLocaleLowerCase().includes(zoek.toLocaleLowerCase()),
    )
    .slice(0, 200);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t("pivots.members")}</summary>
      <label>
        {t("pivots.searchMembers")}
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} />
      </label>
      <button type="button" onClick={() => wijzig({ gekozen: null })}>
        {t("pivots.selectAll")}
      </button>
      <button type="button" onClick={() => wijzig({ gekozen: [] })}>
        {t("pivots.selectNone")}
      </button>
      <div className="draaitabel-leden">
        {zichtbaar.map((m) => (
          <label key={m.sleutel}>
            <input
              type="checkbox"
              checked={veld.gekozen == null || veld.gekozen.includes(m.sleutel)}
              onChange={(e) => {
                const s = new Set(veld.gekozen ?? leden.map((m) => m.sleutel));
                if (e.target.checked) s.add(m.sleutel);
                else s.delete(m.sleutel);
                wijzig({ gekozen: [...s] });
              }}
            />
            {m.tekst || t("data.filter.blanks")}
          </label>
        ))}
      </div>
      {leden.length > 200 && <p>{t("pivots.searchHint")}</p>}
    </details>
  );
}
