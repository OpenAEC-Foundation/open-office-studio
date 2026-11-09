import { useEffect, useRef, useState } from "react";
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
  rekenbladHost,
} from "../lint/rekenblad-opdrachten";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { adres, ontleedAdres } from "../lint/rekenblad-logica";
import { formatDatumTijd } from "../i18n/opmaak";
import { celDiscussies } from "./celnotitieAnkers";
import {
  leesCelnotities,
  notitieBladBeschermd,
  Notitiefout,
} from "./celnotities";
import {
  leesDiscussies,
  wijzigDiscussie,
  Discussiefout,
  type Discussie,
  type DiscussieWijziging,
} from "./discussies";
import { openVenster } from "./vensters";
import "./celnotities.css";

const tijd = (s: string) =>
  s && Number.isFinite(Date.parse(s)) ? formatDatumTijd(s) : s;

export function DiscussieLaag({
  api,
  blad,
  geometry,
}: {
  api: XlsxEditorApi;
  blad: number;
  geometry: XlsxPluginGeometry;
}) {
  const { t } = useTranslation("spreadsheet");
  const [open, setOpen] = useState<string | null>(null),
    anker = useRef<HTMLSpanElement>(null);
  const lijst = celDiscussies(api.handle, blad);
  useEffect(() => {
    const host = anker.current?.closest<HTMLElement>(".office-rekenblad-host");
    if (!host) return;
    const beweeg = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(".discussie-anker"))
        return;
      const p = geometry.getPositionAtPoint?.(e.clientX, e.clientY);
      setOpen(p ? (lijst.find((d) => d.cel === adres(p))?.id ?? null) : null);
    };
    const weg = () => setOpen(null);
    host.addEventListener("pointermove", beweeg);
    host.addEventListener("pointerleave", weg);
    return () => {
      host.removeEventListener("pointermove", beweeg);
      host.removeEventListener("pointerleave", weg);
    };
  }, [geometry, lijst]);
  return (
    <>
      <span ref={anker} hidden />
      {lijst.map((d) => {
        const r = geometry.getCellRect({
          sheetId: geometry.layout.sheetId,
          ...ontleedAdres(d.cel)!,
        });
        if (!r || r.width <= 0 || r.height <= 0) return null;
        return (
          <div
            key={d.id}
            className="celnotitie-anker discussie-anker"
            style={{ left: r.x + r.width, top: r.y }}
            onPointerEnter={() => setOpen(d.id)}
            onPointerLeave={() => setOpen(null)}
          >
            <button
              type="button"
              className={`celnotitie-indicator discussie-indicator${d.opgelost ? " is-opgelost" : ""}`}
              aria-label={t("discussions.indicator", { cell: d.cel })}
              aria-expanded={open === d.id}
              onFocus={() => setOpen(d.id)}
              onBlur={() => setOpen(null)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                openVenster(e.currentTarget.closest(".office-rekenblad-host"), {
                  soort: "discussie",
                  blad,
                  cel: d.cel,
                });
              }}
            />
            {open === d.id && (
              <div
                className={`celnotitie-kaart discussie-kaart${r.x + r.width + 250 > geometry.layout.viewport.width * geometry.layout.zoom ? " is-links" : ""}`}
                role="note"
              >
                {d.opgelost && <strong>{t("discussions.resolved")}</strong>}
                {d.berichten.map((b) => (
                  <article key={b.id}>
                    <strong>{b.auteur || t("notes.unknownAuthor")}</strong>
                    {b.tijd && <time dateTime={b.tijd}>{tijd(b.tijd)}</time>}
                    <p>{b.tekst}</p>
                  </article>
                ))}
                <button
                  type="button"
                  onClick={(e) =>
                    openVenster(
                      e.currentTarget.closest(".office-rekenblad-host"),
                      { soort: "discussie", blad, cel: d.cel },
                    )
                  }
                >
                  {t("discussions.open")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
type Plaats = {
  blad: number;
  cel: string;
  discussie?: Discussie;
  noot?: { auteur: string; tekst: string };
};
export function DiscussieVenster({
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
  const { t } = useTranslation("spreadsheet"),
    apis = useEditorApi();
  const [plaats, setPlaats] = useState<Plaats>(() => {
    try {
      const s = leesSelectie(api);
      return { blad: gekozenBlad ?? s.blad, cel: gekozenCel ?? adres(s.focus) };
    } catch {
      return {
        blad: gekozenBlad ?? api.handle.sheetInfo().activeSheet,
        cel: gekozenCel ?? "A1",
      };
    }
  });
  const [lijst, setLijst] = useState<Plaats[]>([]),
    [tekst, setTekst] = useState(""),
    [auteur, setAuteur] = useState("");
  const [status, setStatus] = useState(""),
    [bezig, setBezig] = useState(false),
    [gereed, setGereed] = useState(false),
    [beschermd, setBeschermd] = useState(false);
  const bytesRef = useRef<Uint8Array | null>(null),
    versie = useRef(""),
    actief = useRef(true),
    lopend = useRef(false);
  const d = plaats.discussie,
    alleen = alleenLezen(api) || beschermd || !apis.herlaad;
  const fout = (f: unknown) =>
    f instanceof Discussiefout
      ? t(`discussions.errors.${f.code}`)
      : f instanceof Notitiefout
        ? t(`notes.errors.${f.code}`)
        : tekstVan(f);
  useEffect(() => {
    actief.current = true;
    void (async () => {
      if (!apis.herlaad) throw new Error(t("notes.errors.notReady"));
      const voor = await api.version(),
        bytes = await apis.herlaad.bytes();
      if (!actief.current) return;
      if ((await api.version()) !== voor)
        throw new Error(t("notes.errors.changed"));
      const ds = leesDiscussies(bytes),
        ns = leesCelnotities(bytes);
      const items = api.handle
        .sheetInfo()
        .sheetNames.flatMap((_, blad) => [
          ...(ds[blad] ?? []).map(
            (discussie) => ({ blad, cel: discussie.cel, discussie }) as Plaats,
          ),
          ...(ns[blad] ?? []).map(
            (noot) => ({ blad, cel: noot.cel, noot }) as Plaats,
          ),
        ])
        .sort((a, b) => {
          const x = ontleedAdres(a.cel)!,
            y = ontleedAdres(b.cel)!;
          return a.blad - b.blad || x.row - y.row || x.col - y.col;
        });
      versie.current = voor;
      bytesRef.current = bytes;
      setLijst(items);
      setPlaats(
        (p) => items.find((i) => i.blad === p.blad && i.cel === p.cel) ?? p,
      );
      setBeschermd(notitieBladBeschermd(bytes, plaats.blad));
      setGereed(true);
    })().catch((f) => {
      if (actief.current) setStatus(fout(f));
    });
    return () => {
      actief.current = false;
    };
  }, [api, apis.herlaad]);
  async function kies(p: Plaats) {
    if (bezig || tekst) return;
    try {
      const naam = api.handle.sheetInfo().sheetNames[p.blad];
      await gaNaar(api, `'${naam.replace(/'/g, "''")}'!${p.cel}`);
      if (!actief.current) return;
      setPlaats(p);
      setStatus("");
      setBeschermd(notitieBladBeschermd(bytesRef.current!, p.blad));
    } catch (f) {
      if (actief.current) setStatus(fout(f));
    }
  }
  async function bewaar(w: DiscussieWijziging) {
    if (alleen || !gereed || !apis.herlaad || lopend.current) return;
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
      const uit = wijzigDiscussie(bytes, plaats.blad, w);
      apis.herlaad.vervang(uit, {
        blad: plaats.blad,
        cel: ontleedAdres(plaats.cel)!,
      });
      sluiten();
    } catch (f) {
      if (actief.current) setStatus(fout(f));
    } finally {
      lopend.current = false;
      if (actief.current) setBezig(false);
    }
  }
  const naam = api.handle.sheetInfo().sheetNames[plaats.blad],
    index = lijst.findIndex(
      (p) => p.blad === plaats.blad && p.cel === plaats.cel,
    );
  return (
    <Paneel titel={t("discussions.title")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier celnotitie-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar(
            d
              ? { soort: "antwoord", id: d.id, auteur, tekst }
              : { soort: "nieuw", cel: plaats.cel, auteur, tekst },
          );
        }}
      >
        <p>
          {naam} · <strong>{plaats.cel}</strong>
          {d?.opgelost && ` · ${t("discussions.resolved")}`}
        </p>
        <fieldset disabled={bezig || !!tekst || !gereed}>
          <legend>{t("discussions.workbookComments")}</legend>
          <select
            aria-label={t("discussions.navigate")}
            value={index}
            onChange={(e) => {
              const p = lijst[Number(e.target.value)];
              if (p) void kies(p);
            }}
          >
            {index < 0 && (
              <option value={-1}>{t("discussions.currentCell")}</option>
            )}
            {lijst.map((p, i) => (
              <option key={`${p.blad}:${p.cel}`} value={i}>
                {api.handle.sheetInfo().sheetNames[p.blad]} · {p.cel} ·{" "}
                {p.noot ? t("notes.title") : t("discussions.thread")}
                {p.discussie?.opgelost ? ` (${t("discussions.resolved")})` : ""}
              </option>
            ))}
          </select>
          <div className="rekenblad-knoppen">
            {[-1, 1].map((r) => (
              <button
                key={r}
                type="button"
                disabled={!lijst.length}
                onClick={() =>
                  void kies(
                    lijst[
                      index < 0
                        ? r > 0
                          ? 0
                          : lijst.length - 1
                        : (index + r + lijst.length) % lijst.length
                    ],
                  )
                }
              >
                {t(r < 0 ? "discussions.previous" : "discussions.next")}
              </button>
            ))}
          </div>
        </fieldset>
        {plaats.noot ? (
          <>
            <blockquote>
              <strong>{plaats.noot.auteur || t("notes.unknownAuthor")}</strong>
              <p>{plaats.noot.tekst}</p>
            </blockquote>
            <button
              type="button"
              disabled={bezig}
              onClick={() =>
                openVenster(rekenbladHost(), {
                  soort: "notitie",
                  blad: plaats.blad,
                  cel: plaats.cel,
                })
              }
            >
              {t("notes.edit")}
            </button>
          </>
        ) : (
          <>
            <ol className="discussie-berichten">
              {d?.berichten.map((b) => (
                <li key={b.id}>
                  <strong>{b.auteur || t("notes.unknownAuthor")}</strong>
                  {b.tijd && <time dateTime={b.tijd}>{tijd(b.tijd)}</time>}
                  <p>{b.tekst}</p>
                </li>
              ))}
            </ol>
            <label>
              {t("notes.author")}
              <input
                value={auteur}
                onChange={(e) => setAuteur(e.target.value)}
                readOnly={alleen}
                disabled={!gereed || bezig || d?.opgelost}
                maxLength={255}
              />
            </label>
            <label>
              {t(d ? "discussions.reply" : "discussions.new")}
              <textarea
                value={tekst}
                onChange={(e) => setTekst(e.target.value)}
                rows={4}
                maxLength={32767}
                readOnly={alleen}
                disabled={!gereed || bezig || d?.opgelost}
              />
            </label>
            <p className="rekenblad-hint">{t("discussions.reloadHint")}</p>
            <div className="rekenblad-knoppen">
              {d && (
                <>
                  <button
                    type="button"
                    disabled={alleen || bezig || !!tekst}
                    onClick={() =>
                      void bewaar({
                        soort: "oplossen",
                        id: d.id,
                        opgelost: !d.opgelost,
                      })
                    }
                  >
                    {t(
                      d.opgelost ? "discussions.reopen" : "discussions.resolve",
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={alleen || bezig || !!tekst}
                    onClick={() =>
                      void bewaar({ soort: "verwijderen", id: d.id })
                    }
                  >
                    {t("discussions.delete")}
                  </button>
                </>
              )}
              <button
                type="submit"
                className="rekenblad-primair"
                disabled={
                  alleen ||
                  !gereed ||
                  bezig ||
                  !!d?.opgelost ||
                  !tekst.trim() ||
                  !auteur.trim()
                }
              >
                {t(d ? "discussions.sendReply" : "discussions.create")}
              </button>
            </div>
          </>
        )}
        <p role="status" className="rekenblad-status">
          {status || (beschermd ? t("notes.errors.protectedSheet") : "")}
        </p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:close")}
          </button>
        </div>
      </form>
    </Paneel>
  );
}
