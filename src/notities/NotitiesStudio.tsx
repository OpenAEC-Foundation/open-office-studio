import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  NotebookPen,
  Plus,
  FilePlus2,
  FolderPlus,
  Search,
  CheckSquare,
  List,
  Heading2,
  Type,
  Download,
  Upload,
  Pin,
  Trash2,
  RotateCcw,
  CalendarDays,
  Pencil,
  Check,
  X,
  ShieldCheck,
  AlertCircle,
  TextCursorInput,
  Undo2,
  Redo2,
  Grid2X2,
  PanelLeft,
  Table2,
  Code2,
  Link,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/config";
import { useOpmaak } from "../i18n/opmaak";
import { Actie, Groep, Ribbon } from "../Ribbon";
import {
  allePaginas,
  leesNotities,
  MAX_BACKUP_BYTES,
  nieuwBlok,
  nieuwTekstvak,
  begrensVak,
  nieuwId,
  nieuwePagina,
  NotitieBewaring,
  OPSLAGSLEUTEL,
  paginaAlsMarkdown,
  paginaBlokken,
  paginaTekst,
  kopieerSectie,
  megabytes,
  MAX_MARKDOWN_TEKENS,
  voegBackupToe,
  zoekPaginas,
  type Blok,
  type BlokSoort,
  type Notities,
  type Tekstvak,
  type VakPlaats,
  type Sectie,
  type SectieSoort,
} from "./model";
import { MarkdownEditor, type MarkdownActies } from "./MarkdownEditor";
import { TekstBlok } from "./TekstBlok";
import { TekstCanvas } from "./TekstCanvas";
import { NotitieHistorie } from "./historie";
import "./notities.css";
import "./canvas.css";

export type NotitieActies = { openen: () => void; bewaren: () => boolean };

async function bewaarBestand(naam: string, tekst: string) {
  const bytes = new TextEncoder().encode(tekst);
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    const pad = await invoke<string | null>("bewaar_kopie", bytes, {
      headers: { "x-office-naam": encodeURIComponent(naam) },
    });
    return pad
      ? i18next.t("notes:file.savedTo", { path: pad })
      : i18next.t("notes:file.saveCancelled");
  }
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: naam.endsWith(".md")
        ? "text/markdown;charset=utf-8"
        : "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = naam;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return i18next.t("notes:file.downloadRequested");
}

export default function NotitiesStudio({
  bestandsmenu,
  inactief,
  registreer,
  onOnopgeslagen,
}: {
  bestandsmenu: () => void;
  inactief: boolean;
  registreer: (acties: NotitieActies | null) => void;
  onOnopgeslagen: (waarde: boolean) => void;
}) {
  const { t } = useTranslation("notes");
  const opmaak = useOpmaak();
  const [start] = useState(() => {
    let opslag: NotitieBewaring | null = null;
    try {
      opslag = new NotitieBewaring(window.localStorage);
      const nieuw = window.localStorage.getItem(OPSLAGSLEUTEL) === null;
      return { opslag, data: opslag.lees(), fout: "", nieuw };
    } catch (e) {
      return {
        opslag,
        data: null,
        nieuw: false,
        fout: i18next.t("notes:errors.readLocal", { error: String(e) }),
      };
    }
  });
  const [data, setData] = useState<Notities | null>(start.data);
  const dataRef = useRef(data),
    vuil = useRef(false),
    opslag = useRef(start.opslag);
  const [fout, setFout] = useState(start.fout),
    [melding, setMelding] = useState(""),
    [status, setStatus] = useState(
      start.data
        ? i18next.t("notes:status.savedLocally")
        : i18next.t("notes:status.storageUnavailable"),
    );
  const eerste = start.data
    ? (allePaginas(start.data).find(({ pagina }) => !pagina.verwijderd) ??
      allePaginas(start.data)[0])
    : null;
  const [boekId, setBoekId] = useState(eerste?.boek.id ?? ""),
    [sectieId, setSectieId] = useState(eerste?.sectie.id ?? ""),
    [paginaId, setPaginaId] = useState(eerste?.pagina.id ?? ""),
    [blokId, setBlokId] = useState(
      eerste?.pagina.vakken[0]?.blokken[0]?.id ?? "",
    );
  const [zoekterm, setZoekterm] = useState(""),
    [prullenbak, setPrullenbak] = useState(false),
    [exportBezig, setExportBezig] = useState(false);
  const [naamveld, setNaamveld] = useState<{
    soort: "boek" | "sectie";
    waarde: string;
    sectieSoort?: SectieSoort;
    nieuw?: boolean;
  } | null>(null);
  const invoer = useRef<HTMLInputElement>(null),
    inhoud = useRef<HTMLDivElement>(null),
    zoekveld = useRef<HTMLInputElement>(null);
  const canvasVenster = useRef<HTMLDivElement>(null);
  const markdownActies = useRef<MarkdownActies | null>(null);
  const markdownInvoer = useRef<HTMLInputElement>(null);
  const historie = useRef(new NotitieHistorie());
  const historieActies = useRef({ terug: () => {}, vooruit: () => {} });
  const [zoom, setZoom] = useState(1),
    [raster, setRaster] = useState(true),
    [toonPanelen, setToonPanelen] = useState(true);
  const bewaarRef = useRef<() => boolean>(() => true);
  const boek = data?.boeken.find((b) => b.id === boekId) ?? data?.boeken[0];
  const sectie =
    boek?.secties.find((s) => s.id === sectieId) ?? boek?.secties[0];
  const selectie = data
    ? allePaginas(data).find(({ pagina }) => pagina.id === paginaId)
    : undefined;
  const pagina = selectie?.pagina;
  const paginaSoort = selectie?.sectie.soort ?? sectie?.soort ?? "canvas";
  const isMarkdown = paginaSoort === "markdown";
  const actiefVak =
    pagina?.vakken.find((v) => v.blokken.some((b) => b.id === blokId)) ??
    pagina?.vakken[0];
  const actiefBlok = actiefVak?.blokken.find((b) => b.id === blokId);
  const resultaten = data
    ? zoekPaginas(data, zoekterm, prullenbak).filter(
        (r) => zoekterm.trim() || prullenbak || r.sectie.id === sectie?.id,
      )
    : [];

  function pasToe(nieuw: Notities) {
    dataRef.current = nieuw;
    vuil.current = true;
    onOnopgeslagen(true);
    setData(nieuw);
    setStatus(t("status.saving"));
  }
  function wijzigen(nieuw: Notities, groep = "") {
    if (dataRef.current) historie.current.bewaar(dataRef.current, groep);
    pasToe(nieuw);
  }
  function herstelStap(vooruit = false) {
    if (!dataRef.current) return;
    const nieuw = vooruit
      ? historie.current.vooruit(dataRef.current)
      : historie.current.terug(dataRef.current);
    if (!nieuw) return;
    pasToe(nieuw);
    const r =
      allePaginas(nieuw).find((r) => r.pagina.id === paginaId) ??
      allePaginas(nieuw).find((r) => !r.pagina.verwijderd);
    if (r) {
      setPaginaId(r.pagina.id);
      setBoekId(r.boek.id);
      setSectieId(r.sectie.id);
      if (!paginaBlokken(r.pagina).some((b) => b.id === blokId))
        setBlokId(r.pagina.vakken[0]?.blokken[0]?.id ?? "");
    }
  }
  historieActies.current = {
    terug: () => herstelStap(),
    vooruit: () => herstelStap(true),
  };
  function bewaren() {
    if (!vuil.current) return true;
    try {
      if (!dataRef.current || !opslag.current)
        throw new Error(t("errors.localStorageUnavailable"));
      opslag.current.schrijf(dataRef.current);
      vuil.current = false;
      onOnopgeslagen(false);
      setStatus(t("status.savedLocally"));
      setFout("");
      return true;
    } catch (e) {
      setFout(t("errors.autosaveFailed", { error: String(e) }));
      setStatus(t("status.notSaved"));
      return false;
    }
  }
  bewaarRef.current = bewaren;
  useEffect(() => {
    if (start.nieuw && dataRef.current) {
      vuil.current = true;
      onOnopgeslagen(true);
      bewaarRef.current();
    }
  }, [start.nieuw, onOnopgeslagen]);
  useEffect(() => {
    if (!vuil.current) return;
    const timer = setTimeout(() => bewaarRef.current(), 350);
    return () => clearTimeout(timer);
  }, [data]);
  useEffect(() => {
    registreer({
      openen: () => invoer.current?.click(),
      bewaren: () => bewaarRef.current(),
    });
    return () => registreer(null);
  }, [registreer]);
  useEffect(() => {
    const extern = (e: StorageEvent) => {
      if (e.key !== OPSLAGSLEUTEL && e.key !== null) return;
      if (vuil.current) {
        setFout(i18next.t("notes:errors.changedInOtherWindow"));
        return;
      }
      try {
        const nieuw = opslag.current?.lees();
        if (nieuw) {
          historie.current.wis();
          dataRef.current = nieuw;
          setData(nieuw);
          setMelding(i18next.t("notes:messages.updatedFromOtherWindow"));
        }
      } catch (e) {
        setFout(i18next.t("notes:errors.readOtherWindow", { error: String(e) }));
      }
    };
    const toetsen = (e: KeyboardEvent) => {
      if (inactief) return;
      if (
        (e.ctrlKey || e.metaKey) &&
        !(
          e.target instanceof Element &&
          e.target.closest(".notities-zoek,.notities-naamdialoog")
        )
      ) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey
            ? historieActies.current.vooruit()
            : historieActies.current.terug();
        }
        if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          historieActies.current.vooruit();
        }
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setToonPanelen(true);
        requestAnimationFrame(() => zoekveld.current?.focus());
      }
    };
    window.addEventListener("storage", extern);
    window.addEventListener("keydown", toetsen);
    return () => {
      window.removeEventListener("storage", extern);
      window.removeEventListener("keydown", toetsen);
    };
  }, [inactief]);

  function wijzigPagina(
    patch: Partial<NonNullable<typeof pagina>>,
    groep = "",
  ) {
    if (!dataRef.current || !pagina) return;
    wijzigen(
      {
        ...dataRef.current,
        boeken: dataRef.current.boeken.map((b) => ({
          ...b,
          secties: b.secties.map((s) => ({
            ...s,
            paginas: s.paginas.map((p) =>
              p.id === pagina.id
                ? { ...p, ...patch, bijgewerkt: new Date().toISOString() }
                : p,
            ),
          })),
        })),
      },
      groep,
    );
  }
  function wijzigBlok(id: string, patch: Partial<Blok>) {
    if (pagina)
      wijzigPagina(
        {
          vakken: pagina.vakken.map((v) => ({
            ...v,
            blokken: v.blokken.map((b) =>
              b.id === id ? { ...b, ...patch } : b,
            ),
          })),
        },
        Object.hasOwn(patch, "tekst") ? `tekst:${id}` : "",
      );
  }
  function kiesPagina(id: string) {
    const r =
      dataRef.current &&
      allePaginas(dataRef.current).find(({ pagina }) => pagina.id === id);
    if (!r) return;
    setPaginaId(id);
    setBoekId(r.boek.id);
    setSectieId(r.sectie.id);
    setBlokId(r.pagina.vakken[0]?.blokken[0]?.id ?? "");
  }
  function focusBlok(id: string) {
    setBlokId(id);
    requestAnimationFrame(() =>
      inhoud.current
        ?.querySelector<HTMLTextAreaElement>(`[data-blok="${id}"] textarea`)
        ?.focus(),
    );
  }
  function voegBlokToe(soort: BlokSoort = "tekst", tekst = "") {
    if (!pagina || pagina.verwijderd || paginaBlokken(pagina).length >= 2000)
      return;
    const nieuw = nieuwBlok(tekst, soort);
    if (!actiefVak) {
      const vak = nieuwTekstvak([nieuw]);
      wijzigPagina({ vakken: [...pagina.vakken, vak] });
      focusBlok(nieuw.id);
      return;
    }
    const index = actiefVak.blokken.findIndex((b) => b.id === blokId);
    const blokken = [...actiefVak.blokken];
    blokken.splice(index < 0 ? blokken.length : index + 1, 0, nieuw);
    wijzigPagina({
      vakken: pagina.vakken.map((v) =>
        v.id === actiefVak.id ? { ...v, blokken } : v,
      ),
    });
    focusBlok(nieuw.id);
  }
  function splitsBlok(blok: Blok, positie: number, einde: number) {
    if (!pagina || !actiefVak || paginaBlokken(pagina).length >= 2000) return;
    if (!blok.tekst && (blok.soort === "taak" || blok.soort === "opsomming")) {
      wijzigBlok(blok.id, { soort: "tekst" });
      return;
    }
    const nieuw = nieuwBlok(
      blok.tekst.slice(einde),
      blok.soort === "kop" || blok.soort === "subkop" ? "tekst" : blok.soort,
    );
    const index = actiefVak.blokken.findIndex((b) => b.id === blok.id);
    const blokken = [...actiefVak.blokken];
    blokken.splice(
      index,
      1,
      { ...blok, tekst: blok.tekst.slice(0, positie) },
      nieuw,
    );
    wijzigPagina({
      vakken: pagina.vakken.map((v) =>
        v.id === actiefVak.id ? { ...v, blokken } : v,
      ),
    });
    focusBlok(nieuw.id);
  }
  function verwijderBlok(blok: Blok) {
    if (!pagina || !actiefVak || actiefVak.blokken.length <= 1) return;
    const index = actiefVak.blokken.findIndex((b) => b.id === blok.id);
    const vorig = actiefVak.blokken[Math.max(0, index - 1)].id;
    wijzigPagina({
      vakken: pagina.vakken.map((v) =>
        v.id === actiefVak.id
          ? { ...v, blokken: v.blokken.filter((b) => b.id !== blok.id) }
          : v,
      ),
    });
    focusBlok(vorig === blok.id ? actiefVak.blokken[1].id : vorig);
  }
  function nieuwVak(x?: number, y?: number) {
    if (!pagina || pagina.verwijderd || paginaBlokken(pagina).length >= 2000)
      return;
    const offset = (pagina.vakken.length % 5) * 28;
    const vak = {
      ...nieuwTekstvak(
        undefined,
        x ?? (canvasVenster.current?.scrollLeft ?? 0) / zoom + 40 + offset,
        y ?? (canvasVenster.current?.scrollTop ?? 0) / zoom + 32 + offset,
      ),
      breedte: 360,
    };
    wijzigPagina({ vakken: [...pagina.vakken, vak] });
    focusBlok(vak.blokken[0].id);
  }
  function wijzigVak(id: string, plaats: VakPlaats) {
    if (!pagina || pagina.verwijderd) return;
    wijzigPagina(
      {
        vakken: pagina.vakken.map((v) =>
          v.id === id ? { ...v, ...begrensVak(plaats) } : v,
        ),
      },
      `plaats:${id}`,
    );
  }
  function verwijderVak(id: string) {
    if (!pagina || pagina.verwijderd) return;
    const vakken = pagina.vakken.filter((v) => v.id !== id);
    wijzigPagina({ vakken });
    setBlokId(vakken[0]?.blokken[0]?.id ?? "");
  }
  function nieuweInhoud(soort: "boek" | "sectie" | "pagina") {
    if (!data || !boek || !sectie) return;
    if (soort === "sectie") {
      setNaamveld({
        soort,
        waarde: t("defaults.newSection"),
        sectieSoort: "canvas",
        nieuw: true,
      });
      return;
    }
    const p = nieuwePagina(
      t("defaults.untitledPage"),
      soort === "pagina" ? sectie.soort : "canvas",
    );
    const s: Sectie = {
      id: nieuwId(),
      naam: t("defaults.ideas"),
      soort: "canvas",
      paginas: [p],
    };
    const b = { id: nieuwId(), naam: t("defaults.newNotebook"), secties: [s] };
    if (
      (soort === "boek" && data.boeken.length >= 100) ||
      allePaginas(data).length >= 5000
    ) {
      setFout(t("errors.maximumReached"));
      return;
    }
    wijzigen({
      ...data,
      boeken:
        soort === "boek"
          ? [...data.boeken, b]
          : data.boeken.map((item) =>
              item.id !== boek.id
                ? item
                : {
                    ...item,
                    secties: item.secties.map((item) =>
                      item.id !== sectie.id
                        ? item
                        : { ...item, paginas: [...item.paginas, p] },
                    ),
                  },
            ),
    });
    setBoekId(soort === "boek" ? b.id : boek.id);
    setSectieId(soort === "pagina" ? sectie.id : s.id);
    setPaginaId(p.id);
    setBlokId(p.vakken[0]?.blokken[0]?.id ?? "");
    setZoekterm("");
    setPrullenbak(false);
    if (soort !== "pagina")
      setNaamveld({ soort, waarde: soort === "boek" ? b.naam : s.naam });
    else
      requestAnimationFrame(() =>
        inhoud.current
          ?.querySelector<HTMLInputElement>(".notities-paginatitel")
          ?.focus(),
      );
  }
  function hernoem() {
    if (!data || !boek || !sectie || !naamveld?.waarde.trim()) return;
    if (
      naamveld.soort === "sectie" &&
      (naamveld.nieuw ||
        (naamveld.sectieSoort ?? sectie.soort) !== sectie.soort)
    ) {
      try {
        if (boek.secties.length >= 200)
          throw new Error(t("errors.tooManySections", { max: 200 }));
        const soort = naamveld.sectieSoort ?? sectie.soort;
        const nieuw: Sectie = naamveld.nieuw
          ? {
              id: nieuwId(),
              naam: naamveld.waarde.trim(),
              soort,
              paginas: [nieuwePagina(t("defaults.untitledPage"), soort)],
            }
          : kopieerSectie(sectie, soort);
        if (!naamveld.nieuw && naamveld.waarde.trim() !== sectie.naam)
          nieuw.naam = naamveld.waarde.trim();
        const basis = nieuw.naam;
        let teller = 1;
        while (boek.secties.some((s) => s.naam === nieuw.naam))
          nieuw.naam = `${basis.slice(0, 180)} (${++teller})`;
        const samen = {
          ...data,
          boeken: data.boeken.map((b) =>
            b.id === boek.id ? { ...b, secties: [...b.secties, nieuw] } : b,
          ),
        };
        leesNotities(JSON.stringify(samen));
        wijzigen(samen);
        setSectieId(nieuw.id);
        setPaginaId(
          nieuw.paginas.find((p) => !p.verwijderd)?.id ?? nieuw.paginas[0].id,
        );
        setBlokId(nieuw.paginas[0].vakken[0]?.blokken[0]?.id ?? "");
        setZoekterm("");
        setPrullenbak(false);
        if (!naamveld.nieuw)
          setMelding(
            soort === "markdown"
              ? t("messages.markdownCopyMade")
              : t("messages.canvasCopyMade"),
          );
      } catch (e) {
        setFout(t("errors.sectionNotAdded", { error: String(e) }));
      }
      setNaamveld(null);
      return;
    }
    wijzigen({
      ...data,
      boeken: data.boeken.map((b) =>
        b.id !== boek.id
          ? b
          : {
              ...b,
              naam: naamveld.soort === "boek" ? naamveld.waarde.trim() : b.naam,
              secties: b.secties.map((s) =>
                s.id === sectie.id && naamveld.soort === "sectie"
                  ? { ...s, naam: naamveld.waarde.trim() }
                  : s,
              ),
            },
      ),
    });
    setNaamveld(null);
  }
  async function exporteer(markdown = false, ruw = false) {
    if (exportBezig) return;
    setExportBezig(true);
    try {
      const tekst = ruw
        ? window.localStorage.getItem(OPSLAGSLEUTEL)
        : markdown && pagina
          ? paginaAlsMarkdown(pagina, paginaSoort)
          : dataRef.current
            ? JSON.stringify(dataRef.current)
            : null;
      if (tekst === null)
        throw new Error(t("errors.nothingToBackUp"));
      const naam =
        markdown && pagina
          ? `${(pagina.titel || t("file.noteName")).replace(/[^\p{L}\p{N}\s_-]/gu, "").slice(0, 100)}.md`
          : `${t("file.backupName", { date: new Date().toISOString().slice(0, 10) })}.openaec-notities`;
      setMelding(await bewaarBestand(naam, tekst));
    } catch (e) {
      setFout(t("errors.exportFailed", { error: String(e) }));
    } finally {
      setExportBezig(false);
    }
  }
  const bewerkbaar = !!pagina && !pagina.verwijderd;
  const knoppen = (soort: BlokSoort) => () => {
    if (isMarkdown && bewerkbaar) {
      markdownActies.current?.voerUit(soort === "subkop" ? "kop" : soort);
      return;
    }
    if (actiefBlok && bewerkbaar) {
      wijzigBlok(actiefBlok.id, { soort });
      focusBlok(actiefBlok.id);
    }
  };
  return (
    <section
      className="notities-studio"
      inert={inactief}
      aria-label="Notities Studio"
    >
      <Ribbon
        bestand={bestandsmenu}
        tabs={[
          {
            id: "start",
            naam: t("ribbon.tabs.home"),
            inhoud: (
              <>
                <Groep
                  naam={t("ribbon.groups.edit")}
                  className="notities-historie"
                >
                  <Actie
                    icoon={Undo2}
                    naam={t("ribbon.actions.undo")}
                    disabled={!historie.current.kanTerug}
                    onClick={() => herstelStap()}
                  />
                  <Actie
                    icoon={Redo2}
                    naam={t("ribbon.actions.redo")}
                    disabled={!historie.current.kanVooruit}
                    onClick={() => herstelStap(true)}
                  />
                </Groep>
                <Groep naam={t("ribbon.groups.organize")}>
                  <Actie
                    icoon={NotebookPen}
                    naam={t("ribbon.actions.notebook")}
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("boek")}
                  />
                  <Actie
                    icoon={FolderPlus}
                    naam={t("ribbon.actions.section")}
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("sectie")}
                  />
                  <Actie
                    icoon={FilePlus2}
                    naam={t("ribbon.actions.page")}
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("pagina")}
                  />
                </Groep>
                <Groep
                  naam={t("ribbon.groups.text")}
                  className={isMarkdown ? "notities-md-opmaak" : ""}
                >
                  <Actie
                    icoon={Type}
                    naam={t("ribbon.actions.text")}
                    disabled={!bewerkbaar || (!isMarkdown && !actiefBlok)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={knoppen("tekst")}
                  />
                  <Actie
                    icoon={Heading2}
                    naam={t("ribbon.actions.heading")}
                    disabled={!bewerkbaar || (!isMarkdown && !actiefBlok)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={knoppen("kop")}
                  />
                  <Actie
                    icoon={Bold}
                    naam={t("ribbon.actions.bold")}
                    actief={actiefBlok?.vet}
                    disabled={!bewerkbaar || (!isMarkdown && !actiefBlok)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (isMarkdown) {
                        markdownActies.current?.voerUit("vet");
                        return;
                      }
                      if (actiefBlok) {
                        wijzigBlok(actiefBlok.id, { vet: !actiefBlok.vet });
                        focusBlok(actiefBlok.id);
                      }
                    }}
                  />
                  <Actie
                    icoon={Italic}
                    naam={t("ribbon.actions.italic")}
                    actief={actiefBlok?.cursief}
                    disabled={!bewerkbaar || (!isMarkdown && !actiefBlok)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (isMarkdown) {
                        markdownActies.current?.voerUit("cursief");
                        return;
                      }
                      if (actiefBlok) {
                        wijzigBlok(actiefBlok.id, {
                          cursief: !actiefBlok.cursief,
                        });
                        focusBlok(actiefBlok.id);
                      }
                    }}
                  />
                </Groep>
                <Groep naam={t("ribbon.groups.insert")}>
                  <Actie
                    icoon={isMarkdown ? Table2 : TextCursorInput}
                    naam={
                      isMarkdown
                        ? t("ribbon.actions.table")
                        : t("ribbon.actions.textBox")
                    }
                    groot
                    disabled={!bewerkbaar}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      isMarkdown
                        ? markdownActies.current?.voerUit("tabel")
                        : nieuwVak()
                    }
                  />
                  <Actie
                    icoon={CheckSquare}
                    naam={t("ribbon.actions.task")}
                    groot
                    disabled={!bewerkbaar}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      isMarkdown
                        ? markdownActies.current?.voerUit("taak")
                        : voegBlokToe("taak")
                    }
                  />
                  <Actie
                    icoon={List}
                    naam={t("ribbon.actions.list")}
                    groot
                    disabled={!bewerkbaar}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      isMarkdown
                        ? markdownActies.current?.voerUit("opsomming")
                        : voegBlokToe("opsomming")
                    }
                  />
                  <Actie
                    icoon={CalendarDays}
                    naam={t("ribbon.actions.date")}
                    groot
                    disabled={!bewerkbaar}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      isMarkdown
                        ? markdownActies.current?.voerUit("datum")
                        : voegBlokToe(
                            "tekst",
                            opmaak.datum(new Date(), { dateStyle: "full" }),
                          )
                    }
                  />
                  {isMarkdown && (
                    <>
                      <Actie
                        icoon={Code2}
                        naam={t("ribbon.actions.code")}
                        groot
                        disabled={!bewerkbaar}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => markdownActies.current?.voerUit("code")}
                      />
                      <Actie
                        icoon={Link}
                        naam={t("ribbon.actions.link")}
                        groot
                        disabled={!bewerkbaar}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => markdownActies.current?.voerUit("link")}
                      />
                    </>
                  )}
                </Groep>
                <Groep naam={t("ribbon.groups.page")}>
                  <Actie
                    icoon={PanelLeft}
                    naam={t("ribbon.actions.navigation")}
                    groot
                    actief={toonPanelen}
                    title={t("ribbon.actions.navigationTitle")}
                    onClick={() => setToonPanelen(!toonPanelen)}
                  />
                  <Actie
                    icoon={Pin}
                    naam={t("ribbon.actions.pin")}
                    actief={pagina?.vastgezet}
                    groot
                    disabled={!bewerkbaar}
                    onClick={() =>
                      wijzigPagina({ vastgezet: !pagina?.vastgezet })
                    }
                  />
                  <Actie
                    icoon={pagina?.verwijderd ? RotateCcw : Trash2}
                    naam={
                      pagina?.verwijderd
                        ? t("ribbon.actions.restore")
                        : t("ribbon.actions.trash")
                    }
                    groot
                    disabled={!pagina}
                    onClick={() => {
                      wijzigPagina({ verwijderd: !pagina?.verwijderd });
                      setPrullenbak(!pagina?.verwijderd);
                    }}
                  />
                </Groep>
              </>
            ),
          },
          {
            id: "beeld",
            naam: t("ribbon.tabs.view"),
            inhoud: (
              <>
                <Groep naam={t("ribbon.groups.page")}>
                  <Actie
                    icoon={Grid2X2}
                    naam={t("ribbon.actions.grid")}
                    groot
                    disabled={isMarkdown}
                    actief={raster}
                    onClick={() => setRaster(!raster)}
                  />
                </Groep>
                <Groep naam={t("ribbon.groups.zoom")}>
                  <label className="ribbon-keuze">
                    <select
                      aria-label={t("ribbon.actions.pageZoom")}
                      disabled={isMarkdown}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((waarde) => (
                        <option key={waarde} value={waarde}>
                          {opmaak.procent(waarde)}
                        </option>
                      ))}
                    </select>
                  </label>
                </Groep>
                <p className="notities-bewaaruitleg">
                  {isMarkdown ? (
                    <>
                      {t("ribbon.help.markdownViews")}
                      <br />
                      {t("ribbon.help.markdownKeys")}
                    </>
                  ) : (
                    <>
                      {t("ribbon.help.canvasMove")}
                      <br />
                      {t("ribbon.help.canvasKeys")}
                    </>
                  )}
                </p>
              </>
            ),
          },
          {
            id: "bewaren",
            naam: t("ribbon.tabs.keep"),
            inhoud: (
              <>
                <Groep naam={t("ribbon.groups.backup")}>
                  <Actie
                    icoon={Download}
                    naam={t("ribbon.actions.saveBackup")}
                    groot
                    disabled={!data || exportBezig}
                    onClick={() => void exporteer()}
                  />
                  <Actie
                    icoon={Upload}
                    naam={t("ribbon.actions.addBackup")}
                    groot
                    disabled={!data || exportBezig}
                    onClick={() => invoer.current?.click()}
                  />
                </Groep>
                <Groep naam={t("ribbon.groups.export")}>
                  {isMarkdown && (
                    <Actie
                      icoon={Upload}
                      naam={t("ribbon.actions.openMarkdown")}
                      groot
                      disabled={!data || exportBezig || prullenbak}
                      onClick={() => markdownInvoer.current?.click()}
                    />
                  )}
                  <Actie
                    icoon={Download}
                    naam={t("ribbon.actions.pageAsMarkdown")}
                    groot
                    disabled={!pagina || exportBezig}
                    onClick={() => void exporteer(true)}
                  />
                </Groep>
                <Groep naam={t("ribbon.groups.localStorage")}>
                  <Actie
                    icoon={ShieldCheck}
                    naam={t("ribbon.actions.saveNow")}
                    groot
                    disabled={!data}
                    onClick={() => bewaren()}
                  />
                </Groep>
                <p className="notities-bewaaruitleg">
                  {t("ribbon.help.autosave")}
                  <br />
                  {t("ribbon.help.backupContents")}
                </p>
              </>
            ),
          },
        ]}
      />
      <input
        hidden
        type="file"
        ref={markdownInvoer}
        accept=".md,.markdown,text/markdown"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !boek || !sectie) return;
          const doelBoek = boek.id,
            doelSectie = sectie.id;
          try {
            if (file.size > MAX_MARKDOWN_TEKENS * 4)
              throw new Error(
                t("errors.markdownFileTooLarge", { size: megabytes(2) }),
              );
            const tekst = await file.text();
            if (tekst.length > MAX_MARKDOWN_TEKENS)
              throw new Error(
                t("errors.markdownTooLong", {
                  max: opmaak.getal(MAX_MARKDOWN_TEKENS),
                }),
              );
            const huidig = dataRef.current;
            const doel = huidig?.boeken
              .find((b) => b.id === doelBoek)
              ?.secties.find((s) => s.id === doelSectie);
            if (!huidig || doel?.soort !== "markdown")
              throw new Error(t("errors.chooseMarkdownSection"));
            const nieuw = {
              ...nieuwePagina(
                file.name.replace(/\.(md|markdown)$/i, "").slice(0, 300),
                "markdown",
              ),
              markdown: tekst,
            };
            const samen = {
              ...huidig,
              boeken: huidig.boeken.map((b) =>
                b.id === doelBoek
                  ? {
                      ...b,
                      secties: b.secties.map((s) =>
                        s.id === doelSectie
                          ? { ...s, paginas: [...s.paginas, nieuw] }
                          : s,
                      ),
                    }
                  : b,
              ),
            };
            leesNotities(JSON.stringify(samen));
            wijzigen(samen);
            setBoekId(doelBoek);
            setSectieId(doelSectie);
            setPaginaId(nieuw.id);
            setZoekterm("");
            setPrullenbak(false);
            setMelding(t("messages.markdownAdded"));
          } catch (e) {
            setFout(t("errors.markdownNotAdded", { error: String(e) }));
          }
        }}
      />
      <input
        hidden
        type="file"
        disabled={!!naamveld}
        ref={invoer}
        accept=".openaec-notities,.json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !dataRef.current) return;
          try {
            if (!file.size || file.size > MAX_BACKUP_BYTES)
              throw new Error(t("errors.backupSize", { size: megabytes(10) }));
            const backup = leesNotities(await file.text());
            const samen = voegBackupToe(dataRef.current, backup);
            leesNotities(JSON.stringify(samen));
            wijzigen(samen);
            const b = samen.boeken[samen.boeken.length - backup.boeken.length];
            setBoekId(b.id);
            setSectieId(b.secties[0].id);
            setPaginaId(b.secties[0].paginas[0].id);
            setBlokId(b.secties[0].paginas[0].vakken[0]?.blokken[0]?.id ?? "");
            setZoekterm("");
            setPrullenbak(false);
            setMelding(
              t("messages.backupAdded", { count: backup.boeken.length }),
            );
          } catch (e) {
            setFout(t("errors.backupNotAdded", { error: String(e) }));
          }
        }}
      />
      {fout && (
        <div className="notities-melding is-fout" role="alert">
          <AlertCircle size={17} />
          <span>{fout}</span>
          {data ? (
            <button onClick={() => bewaren()}>{t("alerts.saveAgain")}</button>
          ) : (
            <button onClick={() => void exporteer(false, true)}>
              {t("alerts.exportExisting")}
            </button>
          )}
          {data && (
            <button
              aria-label={t("alerts.closeError")}
              onClick={() => setFout("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {melding && (
        <div className="notities-melding" role="status">
          <span>{melding}</span>
          <button
            aria-label={t("alerts.closeMessage")}
            onClick={() => setMelding("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {data && (
        <div
          className={`notities-werkruimte ${toonPanelen ? "" : "zonder-panelen"}`}
        >
          <aside
            className="notities-boeken"
            aria-label={t("sidebar.label")}
          >
            <div className="notities-zijlabel">{t("sidebar.myNotebooks")}</div>
            <div className="notities-boekkiezer">
              <NotebookPen size={19} />
              <select
                aria-label={t("sidebar.chooseNotebook")}
                value={boek?.id}
                onChange={(e) => {
                  const b = data.boeken.find((b) => b.id === e.target.value)!;
                  setBoekId(b.id);
                  setSectieId(b.secties[0].id);
                  const p = b.secties
                    .flatMap((s) => s.paginas)
                    .find((p) => !p.verwijderd);
                  if (p) kiesPagina(p.id);
                  else setPaginaId("");
                  setZoekterm("");
                  setPrullenbak(false);
                }}
              >
                {data.boeken.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.naam || t("defaults.untitledNotebook")}
                  </option>
                ))}
              </select>
              <button
                aria-label={t("sidebar.renameNotebook")}
                onClick={() =>
                  boek && setNaamveld({ soort: "boek", waarde: boek.naam })
                }
              >
                <Pencil size={13} />
              </button>
            </div>
            <div className="notities-zoek">
              <Search size={16} />
              <input
                ref={zoekveld}
                aria-label={t("sidebar.searchLabel")}
                placeholder={t("sidebar.searchPlaceholder")}
                value={zoekterm}
                onChange={(e) => setZoekterm(e.target.value)}
              />
            </div>
            <div className="notities-zijlabel notities-sectiekop">
              {t("sidebar.sections")}
              <button
                aria-label={t("sidebar.newSection")}
                onClick={() => nieuweInhoud("sectie")}
              >
                <Plus size={15} />
              </button>
            </div>
            <nav aria-label={t("sidebar.sectionsNav")}>
              {boek?.secties.map((s, i) => (
                <button
                  key={s.id}
                  title={t("sidebar.sectionTitle", {
                    name: s.naam,
                    type: t(`sectionTypes.${s.soort}`),
                  })}
                  className={
                    s.id === sectie?.id && !zoekterm && !prullenbak
                      ? "is-geselecteerd"
                      : ""
                  }
                  onClick={() => {
                    setSectieId(s.id);
                    const p = s.paginas.find((p) => !p.verwijderd);
                    if (p) kiesPagina(p.id);
                    else setPaginaId("");
                    setZoekterm("");
                    setPrullenbak(false);
                  }}
                >
                  <i
                    style={{
                      background: ["#d97706", "#3b7a71", "#7b6c99", "#6e8294"][
                        i % 4
                      ],
                    }}
                  />
                  <span>{s.naam || t("defaults.untitledSection")}</span>
                  {s.soort === "markdown" && (
                    <Code2 size={12} aria-label={t("sidebar.markdownSection")} />
                  )}
                  <small>{s.paginas.filter((p) => !p.verwijderd).length}</small>
                </button>
              ))}
            </nav>
            <button
              className="notities-nieuwboek"
              onClick={() => nieuweInhoud("boek")}
            >
              <Plus size={15} /> {t("sidebar.addNotebook")}
            </button>
            <div className="notities-zijvoet">
              <button
                className={prullenbak ? "is-geselecteerd" : ""}
                onClick={() => {
                  setPrullenbak(!prullenbak);
                  setZoekterm("");
                }}
              >
                <Trash2 size={15} /> {t("sidebar.trash")}
                <span>
                  {
                    allePaginas(data).filter(({ pagina }) => pagina.verwijderd)
                      .length
                  }
                </span>
              </button>
              <p>
                <ShieldCheck size={14} /> {t("sidebar.localOnly")}
              </p>
            </div>
          </aside>
          <aside className="notities-paginas" aria-label={t("pages.label")}>
            <div className="notities-lijstkop">
              <div>
                <span>
                  {zoekterm
                    ? t("pages.searchResults")
                    : prullenbak
                      ? t("pages.restorePages")
                      : t("pages.pages")}
                </span>
                <h2>
                  {zoekterm
                    ? t("pages.allNotes")
                    : prullenbak
                      ? t("pages.trash")
                      : sectie?.naam}
                </h2>
              </div>
              {!zoekterm && !prullenbak && (
                <button
                  aria-label={t("pages.renameSection")}
                  onClick={() =>
                    sectie &&
                    setNaamveld({ soort: "sectie", waarde: sectie.naam })
                  }
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
            {!zoekterm && !prullenbak && sectie && (
              <label className="notities-sectietype">
                {t("pages.sectionType")}
                <select
                  aria-label={t("pages.sectionType")}
                  value={sectie.soort}
                  onChange={(e) =>
                    setNaamveld({
                      soort: "sectie",
                      waarde: sectie.naam,
                      sectieSoort: e.target.value as SectieSoort,
                    })
                  }
                >
                  <option value="canvas">{t("sectionTypes.canvas")}</option>
                  <option value="markdown">{t("sectionTypes.markdown")}</option>
                </select>
              </label>
            )}
            {!prullenbak && (
              <button
                className="notities-nieuwepagina"
                onClick={() => nieuweInhoud("pagina")}
              >
                <Plus size={15} /> {t("pages.newPage")}
              </button>
            )}
            <div className="notities-paginalijst">
              {resultaten.map(({ boek: b, sectie: s, pagina: p }) => (
                <button
                  key={p.id}
                  className={p.id === pagina?.id ? "is-geselecteerd" : ""}
                  onClick={() => kiesPagina(p.id)}
                >
                  <strong>
                    {p.vastgezet && <Pin size={12} />}
                    {p.titel || t("defaults.untitledPage")}
                  </strong>
                  <span>
                    {paginaTekst(p, s.soort).slice(0, 90) ||
                      t("pages.emptyPreview")}
                  </span>
                  <small>
                    {zoekterm || prullenbak
                      ? t("pages.location", { notebook: b.naam, section: s.naam })
                      : opmaak.datum(p.bijgewerkt, {
                          day: "numeric",
                          month: "short",
                        })}
                  </small>
                </button>
              ))}
              {!resultaten.length && (
                <p className="notities-geenresultaten">
                  {zoekterm
                    ? t("pages.noResults")
                    : prullenbak
                      ? t("pages.trashEmpty")
                      : t("pages.startNew")}
                </p>
              )}
            </div>
          </aside>
          <main className="notities-pagina" ref={inhoud}>
            {pagina ? (
              <article key={pagina.id}>
                <div className="notities-paginakop">
                  <span>
                    {selectie?.boek.naam}
                    <b>/</b>
                    {selectie?.sectie.naam}
                  </span>
                  <button
                    title={t("page.saveAsMarkdownTitle")}
                    disabled={exportBezig}
                    onClick={() => void exporteer(true)}
                  >
                    <Download size={15} /> {t("page.markdown")}
                  </button>
                </div>
                <input
                  className="notities-paginatitel"
                  dir="auto"
                  aria-label={t("page.titleLabel")}
                  value={pagina.titel}
                  maxLength={300}
                  readOnly={pagina.verwijderd}
                  placeholder={t("defaults.untitledPage")}
                  onChange={(e) =>
                    wijzigPagina(
                      { titel: e.target.value },
                      `titel:${pagina.id}`,
                    )
                  }
                />
                <div className="notities-paginadatum">
                  <CalendarDays size={13} />
                  {opmaak.datumTijd(pagina.bijgewerkt, {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                  <span>·</span>
                  {t(isMarkdown ? "page.wordsInSource" : "page.words", {
                    count: paginaTekst(pagina, paginaSoort)
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean).length,
                  })}
                </div>
                {pagina.verwijderd ? (
                  <>
                    <div className="notities-herstel">
                      <Trash2 size={18} />
                      <span>{t("page.inTrash")}</span>
                      <button
                        onClick={() => {
                          wijzigPagina({ verwijderd: false });
                          setPrullenbak(false);
                        }}
                      >
                        {t("page.restorePage")}
                      </button>
                    </div>
                    {isMarkdown ? (
                      <MarkdownEditor
                        tekst={pagina.markdown}
                        wijzig={() => {}}
                        acties={markdownActies}
                        alleenLezen
                      />
                    ) : (
                      <div className="notities-leestekst">
                        {paginaBlokken(pagina).map((b) => (
                          <p key={b.id}>
                            {b.soort === "taak" ? (b.klaar ? "☑ " : "☐ ") : ""}
                            {b.tekst}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                ) : isMarkdown ? (
                  <MarkdownEditor
                    key={pagina.id}
                    tekst={pagina.markdown}
                    wijzig={(markdown, opmaak) =>
                      wijzigPagina(
                        { markdown },
                        opmaak ? "" : `markdown:${pagina.id}`,
                      )
                    }
                    acties={markdownActies}
                  />
                ) : (
                  <TekstCanvas
                    key={pagina.id}
                    vakken={pagina.vakken}
                    actiefId={actiefVak?.id}
                    zoom={zoom}
                    raster={raster}
                    venster={canvasVenster}
                    kies={(vak) => {
                      if (!vak.blokken.some((b) => b.id === blokId))
                        setBlokId(vak.blokken[0].id);
                    }}
                    wijzig={wijzigVak}
                    verwijder={verwijderVak}
                    nieuw={nieuwVak}
                    render={(vak: Tekstvak) => (
                      <>
                        {vak.blokken.map((blok) => (
                          <div key={blok.id} data-blok={blok.id}>
                            <TekstBlok
                              blok={blok}
                              actief={blokId === blok.id}
                              kies={() => setBlokId(blok.id)}
                              wijzig={(patch) => wijzigBlok(blok.id, patch)}
                              splits={(positie, einde) =>
                                splitsBlok(blok, positie, einde)
                              }
                              verwijder={() => verwijderBlok(blok)}
                            />
                          </div>
                        ))}
                        <button
                          className="notities-bloktoevoegen"
                          disabled={paginaBlokken(pagina).length >= 2000}
                          onClick={() => {
                            const blok = nieuwBlok();
                            wijzigPagina({
                              vakken: pagina.vakken.map((v) =>
                                v.id === vak.id
                                  ? { ...v, blokken: [...v.blokken, blok] }
                                  : v,
                              ),
                            });
                            focusBlok(blok.id);
                          }}
                        >
                          <Plus size={13} /> {t("page.addText")}
                        </button>
                      </>
                    )}
                  />
                )}
              </article>
            ) : (
              <div className="notities-legepagina">
                <NotebookPen size={38} />
                <h2>{t("page.emptyTitle")}</h2>
                <p>{t("page.emptyText")}</p>
                <button onClick={() => nieuweInhoud("pagina")}>
                  <Plus size={16} /> {t("page.newPage")}
                </button>
              </div>
            )}
          </main>
        </div>
      )}
      <div className="notities-opslagstatus" role="status">
        {vuil.current ? <AlertCircle size={13} /> : <ShieldCheck size={13} />}
        {status}
        <span>
          {isMarkdown
            ? t("sectionTypes.markdown")
            : t("status.canvasSummary", {
                boxes: t("status.textBoxes", {
                  count: pagina?.vakken.length ?? 0,
                }),
                zoom: opmaak.procent(zoom),
              })}{" "}
          · {t("status.undoHint")}
        </span>
      </div>
      {naamveld && (
        <div
          className="notities-naamachtergrond"
          onKeyDown={(e) => {
            if (e.key === "Escape") setNaamveld(null);
            if (e.key === "Tab") {
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>(
                  "input:not(:disabled),button:not(:disabled),select:not(:disabled)",
                ),
              );
              const i = items.indexOf(document.activeElement as HTMLElement);
              e.preventDefault();
              items[
                (i + (e.shiftKey ? items.length - 1 : 1)) % items.length
              ]?.focus();
            }
          }}
        >
          <form
            className="notities-naamdialoog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notities-naam-titel"
            onSubmit={(e) => {
              e.preventDefault();
              hernoem();
            }}
          >
            <h2 id="notities-naam-titel">
              {naamveld.soort === "boek"
                ? t("nameDialog.notebookTitle")
                : naamveld.nieuw
                  ? t("nameDialog.newSection")
                  : t("nameDialog.sectionSettings")}
            </h2>
            <label>
              {t("nameDialog.name")}
              <input
                autoFocus
                maxLength={200}
                value={naamveld.waarde}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  setNaamveld({ ...naamveld, waarde: e.target.value })
                }
              />
            </label>
            {naamveld.soort === "sectie" && (
              <>
                <label>
                  {t("nameDialog.sectionType")}
                  <select
                    aria-label={t("nameDialog.typeLabel")}
                    value={naamveld.sectieSoort ?? sectie?.soort ?? "canvas"}
                    onChange={(e) =>
                      setNaamveld({
                        ...naamveld,
                        sectieSoort: e.target.value as SectieSoort,
                      })
                    }
                  >
                    <option value="canvas">{t("nameDialog.canvasOption")}</option>
                    <option value="markdown">
                      {t("nameDialog.markdownOption")}
                    </option>
                  </select>
                </label>
                {!naamveld.nieuw &&
                  naamveld.sectieSoort &&
                  naamveld.sectieSoort !== sectie?.soort && (
                    <p>
                      {t("nameDialog.copyInfo")}{" "}
                      {naamveld.sectieSoort === "canvas" &&
                        t("nameDialog.copyInfoCanvas")}
                    </p>
                  )}
              </>
            )}
            <div>
              <button type="button" onClick={() => setNaamveld(null)}>
                {t("common:cancel")}
              </button>
              <button type="submit" disabled={!naamveld.waarde.trim()}>
                <Check size={15} />{" "}
                {naamveld.soort === "sectie" &&
                !naamveld.nieuw &&
                naamveld.sectieSoort &&
                naamveld.sectieSoort !== sectie?.soort
                  ? t("nameDialog.makeCopy")
                  : naamveld.nieuw
                    ? t("nameDialog.add")
                    : t("common:save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
