import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  XlsxEditorApi,
  XlsxPluginGeometry,
} from "@betteroffice/xlsx-react";
import { useEditorApi } from "../lint/editorApi";
import {
  alleenLezen,
  gaNaar,
  leesSelectie,
} from "../lint/rekenblad-opdrachten";
import { adres, ontleedAdres } from "../lint/rekenblad-logica";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { RibbonFout } from "../Ribbon";
import {
  leesCelnotities,
  notitieBladBeschermd,
  Notitiefout,
  schrijfCelnotitie,
  type Celnotitie,
} from "./celnotities";
import { openVenster } from "./vensters";
import { celnotities } from "./celnotitieAnkers";
import "./celnotities.css";

/** Indicator en leeskaart boven het raster, ook voor lege cellen. */
export function CelnotitieLaag({
  api,
  blad,
  geometry,
}: {
  api: XlsxEditorApi;
  blad: number;
  geometry: XlsxPluginGeometry;
}) {
  const { t } = useTranslation("spreadsheet");
  const [open, setOpen] = useState<string | null>(null);
  const anker = useRef<HTMLSpanElement>(null);
  const notities = celnotities(api.handle, blad);
  useEffect(() => {
    const laag = anker.current?.closest<HTMLElement>(
      '[data-testid="plugin-overlays"]',
    );
    const host = anker.current?.closest<HTMLElement>(".office-rekenblad-host");
    if (!laag || !host) return;
    const beweeg = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(".celnotitie-kaart"))
        return;
      const positie = geometry.getPositionAtPoint?.(e.clientX, e.clientY);
      if (positie) {
        setOpen(notities.find((n) => n.cel === adres(positie))?.cel ?? null);
        return;
      }
      const origine = laag.getBoundingClientRect(),
        x = e.clientX - origine.left,
        y = e.clientY - origine.top;
      const noot = notities.find((n) => {
        const r = geometry.getCellRect({
          sheetId: geometry.layout.sheetId,
          ...ontleedAdres(n.cel)!,
        });
        return (
          r && x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
        );
      });
      setOpen(noot?.cel ?? null);
    };
    const weg = () => setOpen(null);
    host.addEventListener("pointermove", beweeg);
    host.addEventListener("pointerleave", weg);
    return () => {
      host.removeEventListener("pointermove", beweeg);
      host.removeEventListener("pointerleave", weg);
    };
  }, [geometry, notities]);
  return (
    <>
      <span ref={anker} hidden />
      {notities.map((n) => {
        const cel = ontleedAdres(n.cel)!;
        const rect = geometry.getCellRect({
          sheetId: geometry.layout.sheetId,
          ...cel,
        });
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;
        const toon = n.zichtbaar || open === n.cel;
        return (
          <div
            key={n.cel}
            className="celnotitie-anker"
            style={{ left: rect.x + rect.width, top: rect.y }}
            onPointerEnter={() => setOpen(n.cel)}
            onPointerLeave={() => setOpen(null)}
          >
            <button
              type="button"
              className="celnotitie-indicator"
              aria-label={t("notes.indicator", { cell: n.cel })}
              title={`${n.auteur ? n.auteur + ": " : ""}${n.tekst}`}
              aria-expanded={toon}
              onFocus={() => setOpen(n.cel)}
              onBlur={() => setOpen(null)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                const host = e.currentTarget.closest<HTMLElement>(
                  ".office-rekenblad-host",
                );
                openVenster(host, { soort: "notitie", cel: n.cel, blad });
              }}
            />
            {toon && (
              <div
                className={`celnotitie-kaart${rect.x + rect.width + 250 > geometry.layout.viewport.width * geometry.layout.zoom ? " is-links" : ""}`}
                role="note"
              >
                <strong>{n.auteur || t("notes.unknownAuthor")}</strong>
                <p>{n.tekst}</p>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function CelnotitieVenster({
  api,
  cel: gekozenCel,
  blad: gekozenBlad,
  sluiten,
}: {
  api: XlsxEditorApi;
  cel?: string;
  blad?: number;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const apis = useEditorApi();
  const meld = useContext(RibbonFout);
  const [notities, setNotities] = useState<Celnotitie[]>([]);
  const [cel, setCel] = useState(gekozenCel ?? "");
  const [blad, setBlad] = useState(
    gekozenBlad ?? api.handle.sheetInfo().activeSheet,
  );
  const [tekst, setTekst] = useState("");
  const [auteur, setAuteur] = useState("");
  const [zichtbaar, setZichtbaar] = useState(false);
  const [status, setStatus] = useState("");
  const [beschermd, setBeschermd] = useState(false);
  const [gereed, setGereed] = useState(false);
  const [bezig, setBezig] = useState(false);
  const versie = useRef("");
  const actief = useRef(true);
  const tekstvak = useRef<HTMLTextAreaElement>(null);
  const lopend = useRef(false);
  const bestaand = notities.find((n) => n.cel === cel);
  const gewijzigd =
    tekst !== (bestaand?.tekst ?? "") ||
    auteur !== (bestaand?.auteur ?? "") ||
    zichtbaar !== (bestaand?.zichtbaar ?? false);
  const alleen = alleenLezen(api) || beschermd || !apis.herlaad;
  const fouttekst = (f: unknown) =>
    f instanceof Notitiefout ? t(`notes.errors.${f.code}`) : tekstVan(f);
  function vul(n: Celnotitie | undefined) {
    setTekst(n?.tekst ?? "");
    setAuteur(n?.auteur ?? "");
    setZichtbaar(n?.zichtbaar ?? false);
  }
  useEffect(() => {
    actief.current = true;
    let gestopt = false;
    void (async () => {
      if (!apis.herlaad) throw new Error(t("notes.errors.notReady"));
      const s = leesSelectie(api);
      const index = gekozenBlad ?? s.blad,
        doel = gekozenCel ?? adres(s.focus);
      const voor = await api.version();
      const bytes = await apis.herlaad.bytes();
      if (gestopt) return;
      if ((await api.version()) !== voor)
        throw new Error(t("notes.errors.changed"));
      const lijst = leesCelnotities(bytes)[index] ?? [];
      if (gestopt) return;
      versie.current = voor;
      setBlad(index);
      setCel(doel);
      setNotities(lijst);
      vul(lijst.find((n) => n.cel === doel));
      setBeschermd(notitieBladBeschermd(bytes, index));
      setGereed(true);
      requestAnimationFrame(() => tekstvak.current?.focus());
    })().catch((f) => {
      if (!gestopt) setStatus(fouttekst(f));
    });
    return () => {
      gestopt = true;
      actief.current = false;
    };
  }, [api, apis.herlaad, gekozenCel, gekozenBlad]);
  async function bewaar(verwijderen = false) {
    if (lopend.current || alleen || !gereed || !apis.herlaad) return;
    lopend.current = true;
    setBezig(true);
    setStatus("");
    try {
      if (alleenLezen(api) || (await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const bytes = await apis.herlaad.bytes();
      if (!actief.current) return;
      if (alleenLezen(api) || (await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const uit = schrijfCelnotitie(
        bytes,
        blad,
        cel,
        verwijderen ? null : { tekst, auteur, zichtbaar },
      );
      if (!actief.current) return;
      // De pakketroute behoudt alle overige Office-onderdelen en de huidige cellen.
      apis.herlaad.vervang(uit, { blad, cel: ontleedAdres(cel)! });
      sluiten();
    } catch (f) {
      if (actief.current) setStatus(fouttekst(f));
    } finally {
      lopend.current = false;
      if (actief.current) setBezig(false);
    }
  }
  async function kies(n: Celnotitie) {
    if (bezig || gewijzigd) return;
    // Eerst navigeren; bij een weigering blijft het bewerkdoel staan.
    try {
      const naam = api.handle.sheetInfo().sheetNames[blad];
      await gaNaar(api, `'${naam.replace(/'/g, "''")}'!${n.cel}`);
      if (actief.current) {
        setCel(n.cel);
        vul(n);
      }
    } catch (f) {
      meld(tekstVan(f));
    }
  }
  return (
    <Paneel titel={t("notes.title")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier celnotitie-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar();
        }}
      >
        <p>
          {api.handle.sheetInfo().sheetNames[blad]} · <strong>{cel}</strong>
        </p>
        <label>
          {t("notes.author")}
          <input
            value={auteur}
            onChange={(e) => setAuteur(e.target.value)}
            readOnly={alleen}
            disabled={!gereed || bezig}
          />
        </label>
        <label>
          {t("notes.text")}
          <textarea
            ref={tekstvak}
            rows={6}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            readOnly={alleen}
            disabled={!gereed || bezig}
          />
        </label>
        <label className="celnotitie-zichtbaar">
          <input
            type="checkbox"
            checked={zichtbaar}
            onChange={(e) => setZichtbaar(e.target.checked)}
            disabled={alleen || !gereed || bezig}
          />
          {t("notes.alwaysShow")}
        </label>
        <p className="rekenblad-hint">{t("notes.reloadHint")}</p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:close")}
          </button>
          <button
            type="button"
            disabled={alleen || !bestaand || bezig}
            onClick={() => void bewaar(true)}
          >
            {t("notes.delete")}
          </button>
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={alleen || !gereed || bezig || !tekst.trim() || !gewijzigd}
          >
            {t("common:save")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status || (beschermd ? t("notes.errors.protectedSheet") : "")}
        </p>
        <div className="rekenblad-knoppen">
          {([-1, 1] as const).map((richting) => (
            <button
              key={richting}
              type="button"
              disabled={!notities.length || bezig || gewijzigd}
              onClick={() => {
                const index = notities.findIndex((n) => n.cel === cel);
                const doel =
                  index < 0
                    ? richting > 0
                      ? 0
                      : notities.length - 1
                    : (index + richting + notities.length) % notities.length;
                void kies(notities[doel]);
              }}
            >
              {t(richting < 0 ? "notes.previous" : "notes.next")}
            </button>
          ))}
        </div>
        {notities.length > 0 && (
          <fieldset disabled={bezig || gewijzigd}>
            <legend>{t("notes.sheetNotes")}</legend>
            <ul className="celnotitie-lijst">
              {notities.map((n) => (
                <li key={n.cel}>
                  <button
                    type="button"
                    onClick={() => void kies(n)}
                    aria-current={n.cel === cel ? "true" : undefined}
                  >
                    {n.cel} · {n.auteur || t("notes.unknownAuthor")} · {n.tekst}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </form>
    </Paneel>
  );
}
