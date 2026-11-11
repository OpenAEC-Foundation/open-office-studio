import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Palette } from "lucide-react";
import { Actie, Groep } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { alleenLezen, leesSelectie } from "../lint/rekenblad-opdrachten";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { adres } from "../lint/rekenblad-logica";
import { a1, gebied } from "./werkboekXml";
import { leesBeveiliging } from "./beveiliging";
import {
  leesCelStijlen,
  maakCelStijl,
  pasCelStijlToe,
  wijzigCelStijl,
  Stijlfout,
  type CelStijl,
  type StijlOpmaak,
} from "./celstijlen";
import { openRekenbladVenster } from "./RekenbladExtra";
import "./celstijlen.css";

export function CelstijlGroep() {
  const { t } = useTranslation("spreadsheet"),
    { rekenblad: api } = useEditorApi();
  return (
    <Groep naam={t("styles.group")}>
      <Actie
        naam={t("styles.title")}
        icoon={Palette}
        groot
        disabled={!api || alleenLezen(api)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => openRekenbladVenster({ soort: "celstijl" })}
      />
    </Groep>
  );
}
export function CelstijlVenster({
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
  const [stijlen, setStijlen] = useState<CelStijl[]>([]),
    [naam, setNaam] = useState(""),
    [bereik, setBereik] = useState(() => (sel ? a1(sel.bereik) : ""));
  const [modus, setModus] = useState<"kies" | "nieuw" | "wijzig">("kies"),
    [nieuweNaam, setNieuweNaam] = useState("");
  const [opmaak, setOpmaak] = useState<StijlOpmaak | null>(null),
    origineel = useRef<StijlOpmaak | null>(null);
  const [status, setStatus] = useState(""),
    [gereed, setGereed] = useState(false),
    [bezig, setBezig] = useState(false),
    [beschermd, setBeschermd] = useState(false);
  const versie = useRef(""),
    actief = useRef(true),
    lopend = useRef(false);
  const stijl = stijlen.find((s) => s.naam === naam),
    alleen =
      alleenLezen(api) || !herlaad || !sel || !gereed || bezig || beschermd;
  const label = (s: CelStijl) =>
    s.builtinId === undefined
      ? s.naam
      : t(`styles.builtins.${s.builtinId}`, { defaultValue: s.naam });
  const fout = (f: unknown) =>
    f instanceof Stijlfout ? t(`styles.errors.${f.code}`) : tekstVan(f);
  useEffect(() => {
    let gestopt = false;
    actief.current = true;
    void (async () => {
      if (!sel || !herlaad) throw new Error(t("styles.errors.noSelection"));
      const v = await api.version(),
        bytes = await herlaad.bytes();
      if (gestopt) return;
      if ((await api.version()) !== v)
        throw new Error(t("notes.errors.changed"));
      const lijst = leesCelStijlen(bytes).filter((s) => !s.verborgen),
        prot = leesBeveiliging(bytes).bladen[sel.blad];
      if (gestopt) return;
      versie.current = v;
      setStijlen(lijst);
      setNaam(lijst[0]?.naam ?? "");
      setBeschermd(prot.actief && !prot.rechten.formatCells);
      setGereed(true);
    })().catch((f) => {
      if (!gestopt) setStatus(fout(f));
    });
    return () => {
      gestopt = true;
      actief.current = false;
    };
  }, [api, herlaad, sel]);
  function bewerken(nieuw: boolean) {
    if (!sel || !stijl) return;
    let v: StijlOpmaak;
    if (nieuw) {
      const f = api.handle.selectionFormatting(sel.blad, adres(sel.focus));
      v = {
        fontName: f.fontFamily ?? "Calibri",
        fontSize: f.fontSize ?? 11,
        bold: f.bold ?? false,
        italic: f.italic ?? false,
        textColor: f.textColor ?? "#222222",
        fillColor: f.fillColor ?? null,
        numberFormat: f.numberFormatPattern ?? "",
      };
    } else
      v = {
        ...stijl.opmaak,
        numberFormat: stijl.opmaak.numberFormat.startsWith("builtin:")
          ? ""
          : stijl.opmaak.numberFormat,
      };
    origineel.current = v;
    setOpmaak(v);
    setNieuweNaam(nieuw ? "" : naam);
    setModus(nieuw ? "nieuw" : "wijzig");
    setStatus("");
  }
  function wijzig<K extends keyof StijlOpmaak>(k: K, v: StijlOpmaak[K]) {
    setOpmaak((o) => (o ? { ...o, [k]: v } : o));
  }
  async function bewaar() {
    if (alleen || lopend.current || !sel || !herlaad) return;
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
      let uit: Uint8Array;
      if (modus === "kies") {
        try {
          gebied(bereik);
        } catch {
          throw new Error(t("styles.errors.invalidRange"));
        }
        uit = pasCelStijlToe(bytes, naam, sel.blad, bereik);
      } else {
        const patch: Partial<StijlOpmaak> = {};
        for (const k of Object.keys(opmaak!) as (keyof StijlOpmaak)[])
          if (opmaak![k] !== origineel.current![k])
            Object.assign(patch, { [k]: opmaak![k] });
        uit =
          modus === "nieuw"
            ? maakCelStijl(
                bytes,
                nieuweNaam.trim(),
                sel.blad,
                adres(sel.focus),
                patch,
              )
            : wijzigCelStijl(bytes, naam, patch);
      }
      herlaad.vervang(uit, { blad: sel.blad, cel: sel.focus });
      sluiten();
    } catch (f) {
      if (actief.current) setStatus(fout(f));
    } finally {
      lopend.current = false;
      if (actief.current) setBezig(false);
    }
  }
  return (
    <Paneel titel={t("styles.title")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier celstijl-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar();
        }}
      >
        {modus === "kies" ? (
          <>
            <label>
              {t("styles.range")}
              <input
                value={bereik}
                onChange={(e) => setBereik(e.target.value)}
                disabled={alleen}
              />
            </label>
            <label>
              {t("styles.choose")}
              <select
                aria-label={t("styles.choose")}
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                disabled={!gereed || bezig}
              >
                {stijlen.map((s) => (
                  <option key={s.naam} value={s.naam}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>
            {stijl && (
              <div
                className="celstijl-voorbeeld"
                aria-label={t("styles.preview")}
                style={{
                  fontFamily: stijl.opmaak.fontName,
                  fontSize: Math.min(24, stijl.opmaak.fontSize),
                  fontWeight: stijl.opmaak.bold ? 700 : 400,
                  fontStyle: stijl.opmaak.italic ? "italic" : "normal",
                  color: stijl.opmaak.textColor,
                  backgroundColor: stijl.opmaak.fillColor ?? "#ffffff",
                }}
              >
                {label(stijl)}
              </div>
            )}
            <div className="rekenblad-knoppen">
              <button
                type="button"
                disabled={alleen}
                onClick={() => bewerken(true)}
              >
                {t("styles.new")}
              </button>
              <button
                type="button"
                disabled={alleen || !stijl}
                onClick={() => bewerken(false)}
              >
                {t("styles.modify")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {modus === "nieuw"
                ? t("styles.fromCell", { cell: sel ? adres(sel.focus) : "" })
                : t("styles.editing", { name: stijl ? label(stijl) : naam })}
            </p>
            {modus === "nieuw" && (
              <label>
                {t("styles.name")}
                <input
                  value={nieuweNaam}
                  onChange={(e) => setNieuweNaam(e.target.value)}
                  disabled={alleen}
                  maxLength={255}
                />
              </label>
            )}
            {opmaak && (
              <fieldset disabled={alleen}>
                <legend>{t("styles.format")}</legend>
                <label>
                  {t("styles.fontName")}
                  <input
                    value={opmaak.fontName}
                    onChange={(e) => wijzig("fontName", e.target.value)}
                  />
                </label>
                <label>
                  {t("styles.fontSize")}
                  <input
                    type="number"
                    min={1}
                    max={409}
                    step={0.5}
                    value={opmaak.fontSize}
                    onChange={(e) => wijzig("fontSize", Number(e.target.value))}
                  />
                </label>
                {(["bold", "italic"] as const).map((k) => (
                  <label className="celstijl-vink" key={k}>
                    <input
                      type="checkbox"
                      checked={opmaak[k]}
                      onChange={(e) => wijzig(k, e.target.checked)}
                    />
                    {t(`styles.${k}`)}
                  </label>
                ))}
                <label>
                  {t("styles.textColor")}
                  <input
                    type="color"
                    value={opmaak.textColor}
                    onChange={(e) => wijzig("textColor", e.target.value)}
                  />
                </label>
                <label className="celstijl-vink">
                  <input
                    type="checkbox"
                    checked={opmaak.fillColor !== null}
                    onChange={(e) =>
                      wijzig("fillColor", e.target.checked ? "#ffffff" : null)
                    }
                  />
                  {t("styles.useFill")}
                </label>
                {opmaak.fillColor !== null && (
                  <label>
                    {t("styles.fillColor")}
                    <input
                      type="color"
                      value={opmaak.fillColor}
                      onChange={(e) => wijzig("fillColor", e.target.value)}
                    />
                  </label>
                )}
                <label>
                  {t("styles.numberFormat")}
                  <input
                    value={opmaak.numberFormat}
                    placeholder={t("styles.existingFormat")}
                    onChange={(e) => wijzig("numberFormat", e.target.value)}
                  />
                </label>
              </fieldset>
            )}
            <button
              type="button"
              disabled={bezig}
              onClick={() => setModus("kies")}
            >
              {t("common:back")}
            </button>
          </>
        )}
        <p className="rekenblad-hint">{t("styles.reloadHint")}</p>
        <p className="rekenblad-status" role="status">
          {status || (beschermd ? t("styles.errors.protectedSheet") : "")}
        </p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:close")}
          </button>
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={
              alleen || !naam || (modus === "nieuw" && !nieuweNaam.trim())
            }
          >
            {t(modus === "kies" ? "styles.apply" : "common:save")}
          </button>
        </div>
      </form>
    </Paneel>
  );
}
