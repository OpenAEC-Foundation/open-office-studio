import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  XlsxEditorApi,
  XlsxPluginGeometry,
} from "@betteroffice/xlsx-react";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { RibbonFout } from "../Ribbon";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { useEditorApi, meldWijziging } from "../lint/editorApi";
import { alleenLezen, leesSelectie } from "../lint/rekenblad-opdrachten";
import { adres, type Cel } from "../lint/rekenblad-logica";
import { a1, bevat, gebied } from "./werkboekXml";
import {
  leesValidaties,
  lijstWaarden,
  nieuweValidatie,
  schrijfValidatie,
  validaties,
  voldoetValidatie,
  type Validatieregel,
  type ValidatieType,
} from "./gegevensvalidatie";
import "./validatie.css";

const markeringen = new WeakMap<
  WorkbookHandle,
  { blad: number; cellen: Cel[] }
>();
const luisteraars = new Set<() => void>();
export function omcirkelOngeldig(api: XlsxEditorApi, wissen = false) {
  if (wissen) {
    markeringen.delete(api.handle);
    luisteraars.forEach((l) => l());
    return;
  }
  const blad = api.handle.sheetInfo().activeSheet;
  const regels = validaties(api.handle)[blad] ?? [];
  let aantal = 0;
  for (const r of regels)
    for (const ref of r.ref.split(/\s+/)) {
      const b = gebied(ref);
      aantal += (b.bottom - b.top + 1) * (b.right - b.left + 1);
    }
  if (aantal > 100000)
    throw new Error(
      "De validatiecontrole is begrensd tot 100.000 cellen per blad.",
    );
  const h = openWorkbook(api.save());
  try {
    const fout = new Map<string, Cel>();
    for (const regel of regels)
      for (const ref of regel.ref.split(/\s+/)) {
        const b = gebied(ref);
        for (let row = b.top; row <= b.bottom; row++)
          for (let col = b.left; col <= b.right; col++)
            if (!voldoetValidatie(h, blad, row, col, regel))
              fout.set(adres({ row, col }), { row, col });
      }
    markeringen.set(api.handle, { blad, cellen: [...fout.values()] });
  } finally {
    h.dispose();
  }
  luisteraars.forEach((l) => l());
}

export function ValidatieLaag({
  api,
  blad,
  geometry,
  focus,
}: {
  api: XlsxEditorApi;
  blad: number;
  geometry: XlsxPluginGeometry;
  focus: Cel | null;
}) {
  const { t } = useTranslation("spreadsheet");
  const meld = useContext(RibbonFout);
  const [, ververs] = useState(0),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const l = () => ververs((n) => n + 1);
    luisteraars.add(l);
    const stop = api.handle.onUpdate(() => {
      markeringen.delete(api.handle);
      l();
    });
    return () => {
      luisteraars.delete(l);
      stop();
    };
  }, [api]);
  useEffect(() => setOpen(false), [blad, focus?.row, focus?.col]);
  const r =
    focus &&
    validaties(api.handle)[blad]?.find((r) =>
      r.ref.split(/\s+/).some((b) => bevat(gebied(b), focus.row, focus.col)),
    );
  const rect =
    focus &&
    geometry.getCellRect({ sheetId: geometry.layout.sheetId, ...focus });
  const waarden = useMemo(() => {
    if (!r || r.type !== "list") return [];
    try {
      return [...new Set(lijstWaarden(api.handle, blad, r.formule1))];
    } catch {
      return [];
    }
  }, [r, api, blad, geometry.layout.version]);
  return (
    <>
      {(markeringen.get(api.handle)?.blad === blad
        ? markeringen.get(api.handle)!.cellen
        : []
      ).map((c) => {
        const p = geometry.getCellRect({
          sheetId: geometry.layout.sheetId,
          ...c,
        });
        return p ? (
          <div
            key={adres(c)}
            className="validatie-ongeldig"
            style={{ left: p.x, top: p.y, width: p.width, height: p.height }}
            title={t("validation.invalid")}
          />
        ) : null;
      })}
      {r && rect && (
        <div
          className="validatie-anker"
          style={{ left: rect.x, top: rect.y + rect.height }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {r.type === "list" && r.keuzelijst && (
            <>
              <button
                className="validatie-pijl"
                style={{
                  left: Math.max(0, rect.width - 20),
                  top: -rect.height,
                }}
                aria-label={t("validation.dropdown")}
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                ▾
              </button>
              {open && (
                <select
                  aria-label={t("validation.dropdown")}
                  size={Math.min(10, Math.max(2, waarden.length))}
                  onChange={(e) => {
                    try {
                      api.handle.editCell(
                        blad,
                        focus!.row,
                        focus!.col,
                        "'" + e.target.value,
                      );
                      meldWijziging(api.handle);
                      setOpen(false);
                    } catch (f) {
                      meld(tekstVan(f));
                    }
                  }}
                >
                  <option disabled>{t("validation.choose")}</option>
                  {waarden.map((v) => (
                    <option key={v} value={v}>
                      {v || t("validation.empty")}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {r.invoerTonen && (r.invoerTitel || r.invoer) && !open && (
            <div className="validatie-bericht" role="note">
              <strong>{r.invoerTitel}</strong>
              <div>{r.invoer}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function ValidatieVenster({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet"),
    { herlaad } = useEditorApi();
  const sel = useRef(leesSelectie(api)).current;
  const [regels, setRegels] = useState<Validatieregel[]>([]),
    [index, setIndex] = useState<number | null>(null);
  const [regel, setRegel] = useState(() => nieuweValidatie(a1(sel.bereik)));
  const [status, setStatus] = useState(""),
    [bezig, setBezig] = useState(false),
    [gereed, setGereed] = useState(false);
  const versie = useRef("");
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        versie.current = await api.version();
        const bytes = await herlaad!.bytes();
        if (!actief) return;
        const lijst = leesValidaties(bytes)[sel.blad] ?? [];
        setRegels(lijst);
        const i = lijst.findIndex((r) =>
          r.ref
            .split(/\s+/)
            .some((b) => bevat(gebied(b), sel.focus.row, sel.focus.col)),
        );
        if (i >= 0) {
          setIndex(i);
          setRegel(lijst[i]);
        }
        setGereed(true);
      } catch (f) {
        if (actief) setStatus(tekstVan(f));
      }
    })();
    return () => {
      actief = false;
    };
  }, [api, herlaad, sel]);
  const wijzig = <K extends keyof Validatieregel>(k: K, v: Validatieregel[K]) =>
    setRegel((r) => ({ ...r, [k]: v }));
  const alleen =
    alleenLezen(api) || !herlaad || !gereed || bezig || !!regel.uitgebreid;
  async function bewaar(verwijder = false) {
    if (alleen) return;
    setBezig(true);
    try {
      if ((await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const bytes = await herlaad!.bytes();
      if ((await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const uit = schrijfValidatie(
        bytes,
        sel.blad,
        index,
        verwijder ? null : regel,
      );
      herlaad!.vervang(uit, { blad: sel.blad, cel: sel.focus });
      sluiten();
    } catch (f) {
      setStatus(tekstVan(f));
    } finally {
      setBezig(false);
    }
  }
  return (
    <Paneel titel={t("validation.title")} sluiten={sluiten} breed>
      <form
        className="rekenblad-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar();
        }}
      >
        <label>
          {t("validation.rules")}
          <select
            aria-label={t("validation.rules")}
            value={index ?? "new"}
            onChange={(e) => {
              const i =
                e.target.value === "new" ? null : Number(e.target.value);
              setIndex(i);
              setRegel(
                i === null ? nieuweValidatie(a1(sel.bereik)) : regels[i],
              );
            }}
          >
            <option value="new">{t("validation.new")}</option>
            {regels.map((r, i) => (
              <option key={i} value={i}>
                {r.ref} · {t("validation.types." + r.type)}
              </option>
            ))}
          </select>
        </label>
        <fieldset disabled={alleen} className="validatie-velden">
          <label>
            {t("validation.range")}
            <input
              value={regel.ref}
              onChange={(e) => wijzig("ref", e.target.value)}
            />
          </label>
          <label>
            {t("validation.allow")}
            <select
              aria-label={t("validation.allow")}
              value={regel.type}
              onChange={(e) => wijzig("type", e.target.value as ValidatieType)}
            >
              {[
                "whole",
                "decimal",
                "list",
                "date",
                "time",
                "textLength",
                "custom",
              ].map((v) => (
                <option key={v} value={v}>
                  {t("validation.types." + v)}
                </option>
              ))}
            </select>
          </label>
          {!["list", "custom"].includes(regel.type) && (
            <label>
              {t("validation.operator")}
              <select
                aria-label={t("validation.operator")}
                value={regel.operator}
                onChange={(e) => wijzig("operator", e.target.value)}
              >
                {[
                  "between",
                  "notBetween",
                  "equal",
                  "notEqual",
                  "greaterThan",
                  "greaterThanOrEqual",
                  "lessThan",
                  "lessThanOrEqual",
                ].map((v) => (
                  <option key={v} value={v}>
                    {t("validation.operators." + v)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t(
              regel.type === "list"
                ? "validation.source"
                : "validation.formula1",
            )}
            <input
              value={regel.formule1}
              onChange={(e) => wijzig("formule1", e.target.value)}
            />
          </label>
          {!["list", "custom"].includes(regel.type) &&
            ["between", "notBetween"].includes(regel.operator) && (
              <label>
                {t("validation.formula2")}
                <input
                  value={regel.formule2}
                  onChange={(e) => wijzig("formule2", e.target.value)}
                />
              </label>
            )}
          <p>{t("validation.formulaHint")}</p>
          {(["leeg", "keuzelijst", "invoerTonen", "foutTonen"] as const).map(
            (k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={regel[k]}
                  onChange={(e) => wijzig(k, e.target.checked)}
                />
                {t("validation." + k)}
              </label>
            ),
          )}
          <label>
            {t("validation.promptTitle")}
            <input
              maxLength={32}
              value={regel.invoerTitel}
              onChange={(e) => wijzig("invoerTitel", e.target.value)}
            />
          </label>
          <label>
            {t("validation.prompt")}
            <textarea
              maxLength={255}
              value={regel.invoer}
              onChange={(e) => wijzig("invoer", e.target.value)}
            />
          </label>
          <label>
            {t("validation.alert")}
            <select
              aria-label={t("validation.alert")}
              value={regel.foutType}
              onChange={(e) =>
                wijzig("foutType", e.target.value as Validatieregel["foutType"])
              }
            >
              {["stop", "warning", "information"].map((v) => (
                <option key={v} value={v}>
                  {t("validation." + v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("validation.errorTitle")}
            <input
              maxLength={32}
              value={regel.foutTitel}
              onChange={(e) => wijzig("foutTitel", e.target.value)}
            />
          </label>
          <label>
            {t("validation.error")}
            <textarea
              maxLength={255}
              value={regel.fout}
              onChange={(e) => wijzig("fout", e.target.value)}
            />
          </label>
        </fieldset>
        {regel.uitgebreid && <p role="status">{t("validation.extended")}</p>}
        <p className="rekenblad-hint">{t("validation.reloadHint")}</p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:close")}
          </button>
          <button
            type="button"
            disabled={alleen || index === null}
            onClick={() => void bewaar(true)}
          >
            {t("common:delete")}
          </button>
          <button type="submit" disabled={alleen}>
            {t("common:save")}
          </button>
        </div>
        {status && <p role="alert">{status}</p>}
      </form>
    </Paneel>
  );
}
