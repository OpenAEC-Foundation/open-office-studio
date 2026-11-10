import {
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type PointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Table2 } from "lucide-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import {
  DiaKnop,
  geselecteerdeVorm,
  huidigeIndex,
} from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import { leesKlembordTekst } from "../klembord";
import { leesTabellen, schrijfTabel, type DiaTabel } from "./tabellen";
import {
  eigenaars,
  leesCelBereik,
  nieuwRooster,
  splitsCel,
  TabelFout,
  voegCellenSamen,
  wijzigRooster,
  type CelBereik,
  type CelStijl,
  type TabelRooster,
} from "./tabelrooster";
import { leesTabelKlembord, plakRooster } from "./tabellen-klembord";
import "./tabellen.css";

interface Begin {
  api: PptxEditorApi;
  versie: string;
  dia: number;
  tabellen: DiaTabel[];
  keuze: string;
}
export function DiaTabellen() {
  const { t } = useTranslation("presentation"),
    { presentatie: api, herlaad } = useEditorApi(),
    meld = useContext(RibbonFout);
  const enabled = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const [begin, setBegin] = useState<Begin | null>(null),
    [laden, setLaden] = useState(false);
  const fout = (e: unknown) =>
    t(`tables.errors.${e instanceof TabelFout ? e.code : "invalid"}`);
  async function open() {
    if (!api || !herlaad || !enabled || laden) return;
    setLaden(true);
    try {
      const dia = huidigeIndex(),
        bytes = await herlaad.bytes(),
        tabellen = leesTabellen(bytes, dia),
        selected = String(geselecteerdeVorm(api)?.vorm.sourceId ?? "");
      setBegin({
        api,
        versie: api.handle.version(),
        dia,
        tabellen,
        keuze: tabellen.some((t) => t.id === selected) ? selected : "nieuw",
      });
    } catch (e) {
      meld(fout(e));
    } finally {
      setLaden(false);
    }
  }
  return (
    <>
      <DiaKnop
        naam={t("tables.title")}
        icoon={Table2}
        groot
        uit={!enabled || !herlaad || laden}
        onClick={() => void open()}
      />
      {begin && begin.api === api && (
        <TabelVenster
          begin={begin}
          fout={fout}
          sluit={() => setBegin(null)}
          opslaan={async (rooster, id) => {
            if (
              !api ||
              !herlaad ||
              !api.commands.getState("insertSlide").enabled ||
              api.handle.version() !== begin.versie
            )
              throw new TabelFout("missing");
            const bytes = await herlaad.bytes();
            if (api.handle.version() !== begin.versie)
              throw new TabelFout("missing");
            const nieuw = schrijfTabel(bytes, begin.dia, rooster, id);
            setBegin(null);
            herlaad.vervang(nieuw, { dia: begin.dia });
          }}
        />
      )}
    </>
  );
}

function TabelVenster({
  begin,
  sluit,
  opslaan,
  fout,
}: {
  begin: Begin;
  sluit: () => void;
  opslaan: (t: TabelRooster, id?: string) => Promise<void>;
  fout: (e: unknown) => string;
}) {
  const { t } = useTranslation("presentation");
  const [keuze, setKeuze] = useState(begin.keuze);
  const [concepten, setConcepten] = useState<Record<string, TabelRooster>>(() =>
    Object.fromEntries([
      ["nieuw", nieuwRooster(3, 3)],
      ...begin.tabellen.map((t) => [t.id, t]),
    ]),
  );
  const rooster = concepten[keuze];
  const [selectie, setSelectie] = useState<CelBereik>({
      r0: 0,
      c0: 0,
      r1: 0,
      c1: 0,
    }),
    [anker, setAnker] = useState({ r: 0, c: 0 });
  const [rijen, setRijen] = useState(String(rooster.cellen.length)),
    [kolommen, setKolommen] = useState(String(rooster.breedtes.length));
  const [stijl, setStijl] = useState<CelStijl>({
    vulling: "#FFFFFF",
    rand: "#64748B",
    randPunten: 1,
    uitlijning: "l",
    verticaal: "t",
    marge: 72000,
  });
  const [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  function wijzig(werk: (t: TabelRooster) => TabelRooster) {
    try {
      const n = werk(rooster);
      eigenaars(n);
      setConcepten((c) => ({ ...c, [keuze]: n }));
      setRijen(String(n.cellen.length));
      setKolommen(String(n.breedtes.length));
      setMelding("");
    } catch (e) {
      setMelding(fout(e));
    }
  }
  function kies(r: number, c: number, e?: PointerEvent) {
    if (e?.shiftKey) {
      e.preventDefault();
      setSelectie({
        r0: Math.min(anker.r, r),
        c0: Math.min(anker.c, c),
        r1: Math.max(anker.r, r),
        c1: Math.max(anker.c, c),
      });
    } else {
      setAnker({ r, c });
      setSelectie({ r0: r, c0: c, r1: r, c1: c });
    }
  }
  function plak(tekst: string, html = "") {
    wijzig((t) =>
      plakRooster(t, selectie.r0, selectie.c0, leesTabelKlembord(tekst, html)),
    );
  }
  function onPaste(e: ClipboardEvent) {
    const tekst = e.clipboardData.getData("text/plain"),
      html = e.clipboardData.getData("text/html");
    if (!html.includes("<table") && !/[\t\n]/.test(tekst)) return;
    e.preventDefault();
    e.stopPropagation();
    plak(tekst, html);
  }
  const [bereikTekst, setBereikTekst] = useState("A1");
  useEffect(() => {
    const adres = (r: number, c: number) =>
      `${c < 26 ? String.fromCharCode(65 + c) : `A${String.fromCharCode(65 + c - 26)}`}${r + 1}`;
    setBereikTekst(
      `${adres(selectie.r0, selectie.c0)}:${adres(selectie.r1, selectie.c1)}`,
    );
  }, [selectie.r0, selectie.c0, selectie.r1, selectie.c1]);
  function pasStijlToe(s: CelStijl) {
    wijzig((t) => {
      const owners = eigenaars(t),
        gekozen = new Set<string>();
      for (let r = selectie.r0; r <= selectie.r1; r++)
        for (let c = selectie.c0; c <= selectie.c1; c++) {
          const o = owners[r][c];
          gekozen.add(`${o.r}:${o.c}`);
        }
      return {
        ...t,
        cellen: t.cellen.map((row, r) =>
          row.map((cell, c) => {
            const o = owners[r][c];
            return gekozen.has(`${o.r}:${o.c}`)
              ? { ...cell, stijl: { ...cell.stijl, ...s } }
              : cell;
          }),
        ),
      };
    });
  }
  function afmetingen() {
    wijzig((t) => {
      const rows = Number(rijen),
        cols = Number(kolommen);
      nieuwRooster(rows, cols);
      let n = t;
      while (n.cellen.length < rows)
        n = wijzigRooster(n, "rij", n.cellen.length);
      while (n.cellen.length > rows)
        n = wijzigRooster(n, "rij", n.cellen.length - 1, true);
      while (n.breedtes.length < cols)
        n = wijzigRooster(n, "kolom", n.breedtes.length);
      while (n.breedtes.length > cols)
        n = wijzigRooster(n, "kolom", n.breedtes.length - 1, true);
      setAnker({ r: 0, c: 0 });
      setSelectie({ r0: 0, c0: 0, r1: 0, c1: 0 });
      return n;
    });
  }
  function structuur(as: "rij" | "kolom", verwijder = false) {
    wijzig((t) => {
      const n = wijzigRooster(
        t,
        as,
        as === "rij" ? selectie.r0 : selectie.c0,
        verwijder,
      );
      setAnker({ r: 0, c: 0 });
      setSelectie({ r0: 0, c0: 0, r1: 0, c1: 0 });
      return n;
    });
  }
  async function toepassen() {
    setBezig(true);
    setMelding("");
    try {
      await opslaan(rooster, keuze === "nieuw" ? undefined : keuze);
    } catch (e) {
      setMelding(fout(e));
    } finally {
      setBezig(false);
    }
  }
  const knop = (naam: string, fn: () => void) => (
    <button type="button" className="werkruimte-knop" onClick={fn}>
      {t(`tables.${naam}`)}
    </button>
  );
  return (
    <Dialoog
      titel={t("tables.title")}
      className="presentatie-tabellen"
      sluit={() => {
        if (!bezig) sluit();
      }}
      acties={
        <>
          <button className="werkruimte-knop" disabled={bezig} onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button
            className="werkruimte-knop is-primair"
            disabled={bezig}
            onClick={() => void toepassen()}
          >
            {t(keuze === "nieuw" ? "tables.insert" : "tables.apply")}
          </button>
        </>
      }
    >
      <fieldset disabled={bezig}>
        <p>{t("design.reload")}</p>
        <label>
          {t("tables.choose")}
          <select
            aria-label={t("tables.choose")}
            value={keuze}
            onChange={(e) => {
              const key = e.target.value;
              setKeuze(key);
              setRijen(String(concepten[key].cellen.length));
              setKolommen(String(concepten[key].breedtes.length));
              setAnker({ r: 0, c: 0 });
              setSelectie({ r0: 0, c0: 0, r1: 0, c1: 0 });
              setMelding("");
            }}
          >
            <option value="nieuw">{t("tables.new")}</option>
            {begin.tabellen.map((table, i) => (
              <option key={table.id} value={table.id}>
                {table.naam || t("tables.table", { number: i + 1 })}
              </option>
            ))}
          </select>
        </label>
        <div className="tabel-bediening">
          <label>
            {t("tables.rows")}
            <input
              type="number"
              min="1"
              max="200"
              value={rijen}
              onChange={(e) => setRijen(e.target.value)}
            />
          </label>
          <label>
            {t("tables.columns")}
            <input
              type="number"
              min="1"
              max="50"
              value={kolommen}
              onChange={(e) => setKolommen(e.target.value)}
            />
          </label>
          {knop("resize", afmetingen)}
          <label>
            {t("tables.style")}
            <select
              aria-label={t("tables.style")}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const header =
                    v === "blue"
                      ? "#DDEAFF"
                      : v === "gray"
                        ? "#D9DDE3"
                        : "#FFFFFF",
                  body = v === "blue" ? "#F2F6FF" : "#FFFFFF";
                wijzig((t) => ({
                  ...t,
                  cellen: t.cellen.map((row, r) =>
                    row.map((cell) => ({
                      ...cell,
                      stijl: {
                        ...cell.stijl,
                        vulling: r === 0 ? header : body,
                        rand: "#64748B",
                        randPunten: v === "plain" ? 0.5 : 1,
                        marge: 72000,
                      },
                    })),
                  ),
                }));
                e.target.value = "";
              }}
            >
              <option value="">{t("tables.chooseStyle")}</option>
              {["blue", "gray", "plain"].map((s) => (
                <option key={s} value={s}>
                  {t(`tables.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="tabel-bediening">
          {knop("addRow", () => structuur("rij"))}
          {knop("deleteRow", () => structuur("rij", true))}
          {knop("addColumn", () => structuur("kolom"))}
          {knop("deleteColumn", () => structuur("kolom", true))}
          {knop("merge", () => wijzig((t) => voegCellenSamen(t, selectie)))}
          {knop("split", () =>
            wijzig((t) => splitsCel(t, selectie.r0, selectie.c0)),
          )}
          {knop("paste", () => {
            void leesKlembordTekst()
              .then((text) => plak(text))
              .catch((e) => setMelding(fout(e)));
          })}
        </div>
        <p>{t("tables.help")}</p>
        <div className="tabel-bediening">
          <label>
            {t("tables.range")}
            <input
              value={bereikTekst}
              onChange={(e) => setBereikTekst(e.target.value)}
            />
          </label>
          {knop("select", () => {
            try {
              const b = leesCelBereik(
                bereikTekst,
                rooster.cellen.length,
                rooster.breedtes.length,
              );
              setSelectie(b);
              setAnker({ r: b.r0, c: b.c0 });
              setMelding("");
            } catch (e) {
              setMelding(fout(e));
            }
          })}
        </div>
        <div className="tabel-rooster" onPaste={onPaste}>
          <table aria-label={t("tables.grid")}>
            <tbody>
              {rooster.cellen.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) =>
                    cell.bedekt ? null : (
                      <td
                        key={c}
                        rowSpan={cell.rijSpan}
                        colSpan={cell.kolomSpan}
                        className={
                          r >= selectie.r0 &&
                          r <= selectie.r1 &&
                          c >= selectie.c0 &&
                          c <= selectie.c1
                            ? "is-geselecteerd"
                            : ""
                        }
                        style={{ background: cell.stijl?.vulling }}
                        onPointerDown={(e) => kies(r, c, e)}
                      >
                        <textarea
                          aria-label={t("tables.cell", {
                            row: r + 1,
                            column: c + 1,
                          })}
                          value={cell.tekst}
                          style={{
                            color: cell.stijl?.vulling ? "#172033" : undefined,
                            textAlign:
                              cell.stijl?.uitlijning === "ctr"
                                ? "center"
                                : cell.stijl?.uitlijning === "r"
                                  ? "right"
                                  : "left",
                          }}
                          onFocus={() => kies(r, c)}
                          onChange={(e) =>
                            wijzig((t) => ({
                              ...t,
                              cellen: t.cellen.map((row, y) =>
                                row.map((cel, x) =>
                                  r === y && c === x
                                    ? {
                                        ...cel,
                                        tekst: e.target.value,
                                        tekstGewijzigd: true,
                                      }
                                    : cel,
                                ),
                              ),
                            }))
                          }
                        />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tabel-bediening tabel-celstijl">
          <label>
            {t("tables.fill")}
            <input
              type="color"
              value={stijl.vulling}
              onChange={(e) => setStijl({ ...stijl, vulling: e.target.value })}
            />
          </label>
          <label>
            {t("tables.border")}
            <input
              type="color"
              value={stijl.rand}
              onChange={(e) => setStijl({ ...stijl, rand: e.target.value })}
            />
          </label>
          <label>
            {t("tables.borderWidth")}
            <input
              type="number"
              min="0"
              max="20"
              step="0.5"
              value={stijl.randPunten}
              onChange={(e) =>
                setStijl({ ...stijl, randPunten: Number(e.target.value) })
              }
            />
          </label>
          <label>
            {t("tables.align")}
            <select
              aria-label={t("tables.align")}
              value={stijl.uitlijning}
              onChange={(e) =>
                setStijl({
                  ...stijl,
                  uitlijning: e.target.value as CelStijl["uitlijning"],
                })
              }
            >
              {["l", "ctr", "r"].map((a) => (
                <option key={a} value={a}>
                  {t(`tables.alignments.${a}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("tables.vertical")}
            <select
              aria-label={t("tables.vertical")}
              value={stijl.verticaal}
              onChange={(e) =>
                setStijl({
                  ...stijl,
                  verticaal: e.target.value as CelStijl["verticaal"],
                })
              }
            >
              {["t", "ctr", "b"].map((a) => (
                <option key={a} value={a}>
                  {t(`tables.verticals.${a}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("tables.margin")}
            <input
              type="number"
              min="0"
              max="10"
              step="0.05"
              value={(stijl.marge ?? 0) / 360000}
              onChange={(e) =>
                setStijl({
                  ...stijl,
                  marge: Math.round(Number(e.target.value) * 360000),
                })
              }
            />
          </label>
          {knop("format", () => pasStijlToe(stijl))}
        </div>
      </fieldset>
      {melding && <p role="alert">{melding}</p>}
    </Dialoog>
  );
}
