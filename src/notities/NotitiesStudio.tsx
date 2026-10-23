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
    return pad ? `Opgeslagen: ${pad}` : "Opslaan geannuleerd.";
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
  return "Download aangevraagd. Controleer het bestand in je downloads.";
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
        fout: `Lokale notities konden niet worden gelezen: ${String(e)}. Bestaande gegevens zijn niet overschreven.`,
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
      start.data ? "Lokaal opgeslagen" : "Opslag niet beschikbaar",
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
    setStatus("Opslaan…");
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
        throw new Error("Lokale opslag is niet beschikbaar.");
      opslag.current.schrijf(dataRef.current);
      vuil.current = false;
      onOnopgeslagen(false);
      setStatus("Lokaal opgeslagen");
      setFout("");
      return true;
    } catch (e) {
      setFout(
        `Automatisch opslaan mislukt: ${String(e)} Maak een back-up om je huidige werk te bewaren.`,
      );
      setStatus("Niet opgeslagen");
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
        setFout(
          "Een ander venster heeft de lokale notities gewijzigd. Je huidige werk is behouden; maak een back-up voordat je de lokale versie opnieuw opent.",
        );
        return;
      }
      try {
        const nieuw = opslag.current?.lees();
        if (nieuw) {
          historie.current.wis();
          dataRef.current = nieuw;
          setData(nieuw);
          setMelding("Lokale notities bijgewerkt vanuit een ander venster.");
        }
      } catch (e) {
        setFout(
          `Notities uit het andere venster konden niet worden gelezen: ${String(e)}`,
        );
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
        waarde: "Nieuwe sectie",
        sectieSoort: "canvas",
        nieuw: true,
      });
      return;
    }
    const p = nieuwePagina(
      "Naamloze pagina",
      soort === "pagina" ? sectie.soort : "canvas",
    );
    const s: Sectie = {
      id: nieuwId(),
      naam: "Ideeën",
      soort: "canvas",
      paginas: [p],
    };
    const b = { id: nieuwId(), naam: "Nieuw notitieboek", secties: [s] };
    if (
      (soort === "boek" && data.boeken.length >= 100) ||
      allePaginas(data).length >= 5000
    ) {
      setFout(
        "De maximale omvang is bereikt. Maak een back-up en gebruik een apart notitieboekbestand.",
      );
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
          throw new Error("Dit notitieboek bevat al 200 secties.");
        const soort = naamveld.sectieSoort ?? sectie.soort;
        const nieuw: Sectie = naamveld.nieuw
          ? {
              id: nieuwId(),
              naam: naamveld.waarde.trim(),
              soort,
              paginas: [nieuwePagina("Naamloze pagina", soort)],
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
            `Een ${soort === "markdown" ? "Markdown" : "Canvas"}-kopie is gemaakt. De oorspronkelijke sectie is behouden.${soort === "canvas" ? " Markdownbron is als tekst overgenomen." : ""}`,
          );
      } catch (e) {
        setFout(`Sectie niet toegevoegd: ${String(e)}`);
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
        throw new Error("Er zijn geen notities beschikbaar voor een back-up.");
      const naam =
        markdown && pagina
          ? `${(pagina.titel || "Notitie").replace(/[^\p{L}\p{N}\s_-]/gu, "").slice(0, 100)}.md`
          : `Notities-${new Date().toISOString().slice(0, 10)}.openaec-notities`;
      setMelding(await bewaarBestand(naam, tekst));
    } catch (e) {
      setFout(`Exporteren mislukt: ${String(e)}`);
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
            naam: "Start",
            inhoud: (
              <>
                <Groep naam="Bewerken" className="notities-historie">
                  <Actie
                    icoon={Undo2}
                    naam="Ongedaan maken"
                    disabled={!historie.current.kanTerug}
                    onClick={() => herstelStap()}
                  />
                  <Actie
                    icoon={Redo2}
                    naam="Opnieuw"
                    disabled={!historie.current.kanVooruit}
                    onClick={() => herstelStap(true)}
                  />
                </Groep>
                <Groep naam="Organiseren">
                  <Actie
                    icoon={NotebookPen}
                    naam="Notitieboek"
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("boek")}
                  />
                  <Actie
                    icoon={FolderPlus}
                    naam="Sectie"
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("sectie")}
                  />
                  <Actie
                    icoon={FilePlus2}
                    naam="Pagina"
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("pagina")}
                  />
                </Groep>
                <Groep
                  naam="Tekst"
                  className={isMarkdown ? "notities-md-opmaak" : ""}
                >
                  <Actie
                    icoon={Type}
                    naam="Tekst"
                    disabled={!bewerkbaar || (!isMarkdown && !actiefBlok)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={knoppen("tekst")}
                  />
                  <Actie
                    icoon={Heading2}
                    naam="Kop"
                    disabled={!bewerkbaar || (!isMarkdown && !actiefBlok)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={knoppen("kop")}
                  />
                  <Actie
                    icoon={Bold}
                    naam="Vet"
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
                    naam="Cursief"
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
                <Groep naam="Invoegen">
                  <Actie
                    icoon={isMarkdown ? Table2 : TextCursorInput}
                    naam={isMarkdown ? "Tabel" : "Tekstvak"}
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
                    naam="Taak"
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
                    naam="Opsomming"
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
                    naam="Datum"
                    groot
                    disabled={!bewerkbaar}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      isMarkdown
                        ? markdownActies.current?.voerUit("datum")
                        : voegBlokToe(
                            "tekst",
                            new Intl.DateTimeFormat("nl-NL", {
                              dateStyle: "full",
                            }).format(new Date()),
                          )
                    }
                  />
                  {isMarkdown && (
                    <>
                      <Actie
                        icoon={Code2}
                        naam="Code"
                        groot
                        disabled={!bewerkbaar}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => markdownActies.current?.voerUit("code")}
                      />
                      <Actie
                        icoon={Link}
                        naam="Link"
                        groot
                        disabled={!bewerkbaar}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => markdownActies.current?.voerUit("link")}
                      />
                    </>
                  )}
                </Groep>
                <Groep naam="Pagina">
                  <Actie
                    icoon={PanelLeft}
                    naam="Navigatie"
                    groot
                    actief={toonPanelen}
                    title="Notitieboeken en paginalijst weergeven of verbergen"
                    onClick={() => setToonPanelen(!toonPanelen)}
                  />
                  <Actie
                    icoon={Pin}
                    naam="Vastzetten"
                    actief={pagina?.vastgezet}
                    groot
                    disabled={!bewerkbaar}
                    onClick={() =>
                      wijzigPagina({ vastgezet: !pagina?.vastgezet })
                    }
                  />
                  <Actie
                    icoon={pagina?.verwijderd ? RotateCcw : Trash2}
                    naam={pagina?.verwijderd ? "Herstellen" : "Prullenbak"}
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
            naam: "Beeld",
            inhoud: (
              <>
                <Groep naam="Pagina">
                  <Actie
                    icoon={Grid2X2}
                    naam="Raster"
                    groot
                    disabled={isMarkdown}
                    actief={raster}
                    onClick={() => setRaster(!raster)}
                  />
                </Groep>
                <Groep naam="Zoom">
                  <label className="ribbon-keuze">
                    <select
                      aria-label="Pagina zoom"
                      disabled={isMarkdown}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((waarde) => (
                        <option key={waarde} value={waarde}>
                          {Math.round(waarde * 100)}%
                        </option>
                      ))}
                    </select>
                  </label>
                </Groep>
                <p className="notities-bewaaruitleg">
                  {isMarkdown ? (
                    <>
                      Kies Bron, Naast elkaar of Voorbeeld boven de
                      Markdown-editor.
                      <br />
                      Ctrl+B: vet · Ctrl+I: cursief · Ctrl+K: link.
                    </>
                  ) : (
                    <>
                      Sleep tekstvakken aan de bovenrand. Wijzig de grootte
                      rechtsonder.
                      <br />
                      Je kunt de verplaatsgrepen ook met de pijltjestoetsen
                      bedienen.
                    </>
                  )}
                </p>
              </>
            ),
          },
          {
            id: "bewaren",
            naam: "Bewaren",
            inhoud: (
              <>
                <Groep naam="Back-up">
                  <Actie
                    icoon={Download}
                    naam="Back-up opslaan"
                    groot
                    disabled={!data || exportBezig}
                    onClick={() => void exporteer()}
                  />
                  <Actie
                    icoon={Upload}
                    naam="Back-up toevoegen"
                    groot
                    disabled={!data || exportBezig}
                    onClick={() => invoer.current?.click()}
                  />
                </Groep>
                <Groep naam="Exporteren">
                  {isMarkdown && (
                    <Actie
                      icoon={Upload}
                      naam="Markdown openen"
                      groot
                      disabled={!data || exportBezig || prullenbak}
                      onClick={() => markdownInvoer.current?.click()}
                    />
                  )}
                  <Actie
                    icoon={Download}
                    naam="Pagina als Markdown"
                    groot
                    disabled={!pagina || exportBezig}
                    onClick={() => void exporteer(true)}
                  />
                </Groep>
                <Groep naam="Lokale opslag">
                  <Actie
                    icoon={ShieldCheck}
                    naam="Nu opslaan"
                    groot
                    disabled={!data}
                    onClick={() => bewaren()}
                  />
                </Groep>
                <p className="notities-bewaaruitleg">
                  Je notities worden automatisch lokaal opgeslagen.
                  <br />
                  Een back-up bevat alle notitieboeken, ook de prullenbak.
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
              throw new Error("Kies een Markdownbestand van maximaal 2 MB.");
            const tekst = await file.text();
            if (tekst.length > MAX_MARKDOWN_TEKENS)
              throw new Error(
                "Een Markdownpagina mag maximaal 500.000 tekens bevatten.",
              );
            const huidig = dataRef.current;
            const doel = huidig?.boeken
              .find((b) => b.id === doelBoek)
              ?.secties.find((s) => s.id === doelSectie);
            if (!huidig || doel?.soort !== "markdown")
              throw new Error(
                "Kies een Markdownsectie om het bestand toe te voegen.",
              );
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
            setMelding(
              "Markdown als nieuwe pagina toegevoegd. Bestaande pagina’s zijn behouden.",
            );
          } catch (e) {
            setFout(`Markdown niet toegevoegd: ${String(e)}`);
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
              throw new Error("Kies een niet-lege back-up van maximaal 10 MB.");
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
              `${backup.boeken.length} notitieboek(en) toegevoegd. Bestaande notities zijn behouden.`,
            );
          } catch (e) {
            setFout(`Back-up niet toegevoegd: ${String(e)}`);
          }
        }}
      />
      {fout && (
        <div className="notities-melding is-fout" role="alert">
          <AlertCircle size={17} />
          <span>{fout}</span>
          {data ? (
            <button onClick={() => bewaren()}>Opnieuw opslaan</button>
          ) : (
            <button onClick={() => void exporteer(false, true)}>
              Bestaande gegevens exporteren
            </button>
          )}
          {data && (
            <button
              aria-label="Notitiefout sluiten"
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
            aria-label="Notitiemelding sluiten"
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
            aria-label="Notitieboeken en secties"
          >
            <div className="notities-zijlabel">MIJN NOTITIEBOEKEN</div>
            <div className="notities-boekkiezer">
              <NotebookPen size={19} />
              <select
                aria-label="Notitieboek kiezen"
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
                    {b.naam || "Naamloos notitieboek"}
                  </option>
                ))}
              </select>
              <button
                aria-label="Notitieboek hernoemen"
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
                aria-label="Alle notities doorzoeken"
                placeholder="Zoeken in alle notities"
                value={zoekterm}
                onChange={(e) => setZoekterm(e.target.value)}
              />
            </div>
            <div className="notities-zijlabel notities-sectiekop">
              SECTIES
              <button
                aria-label="Nieuwe sectie"
                onClick={() => nieuweInhoud("sectie")}
              >
                <Plus size={15} />
              </button>
            </div>
            <nav aria-label="Secties">
              {boek?.secties.map((s, i) => (
                <button
                  key={s.id}
                  title={`${s.naam} · ${s.soort === "markdown" ? "Markdown" : "Canvas"}`}
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
                  <span>{s.naam || "Naamloze sectie"}</span>
                  {s.soort === "markdown" && (
                    <Code2 size={12} aria-label="Markdownsectie" />
                  )}
                  <small>{s.paginas.filter((p) => !p.verwijderd).length}</small>
                </button>
              ))}
            </nav>
            <button
              className="notities-nieuwboek"
              onClick={() => nieuweInhoud("boek")}
            >
              <Plus size={15} /> Notitieboek toevoegen
            </button>
            <div className="notities-zijvoet">
              <button
                className={prullenbak ? "is-geselecteerd" : ""}
                onClick={() => {
                  setPrullenbak(!prullenbak);
                  setZoekterm("");
                }}
              >
                <Trash2 size={15} /> Prullenbak
                <span>
                  {
                    allePaginas(data).filter(({ pagina }) => pagina.verwijderd)
                      .length
                  }
                </span>
              </button>
              <p>
                <ShieldCheck size={14} /> Alleen op jouw computer
              </p>
            </div>
          </aside>
          <aside className="notities-paginas" aria-label="Pagina’s">
            <div className="notities-lijstkop">
              <div>
                <span>
                  {zoekterm
                    ? "ZOEKRESULTATEN"
                    : prullenbak
                      ? "HERSTEL JE PAGINA’S"
                      : "PAGINA’S"}
                </span>
                <h2>
                  {zoekterm
                    ? "Alle notities"
                    : prullenbak
                      ? "Prullenbak"
                      : sectie?.naam}
                </h2>
              </div>
              {!zoekterm && !prullenbak && (
                <button
                  aria-label="Sectie hernoemen"
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
                Sectietype
                <select
                  aria-label="Sectietype"
                  value={sectie.soort}
                  onChange={(e) =>
                    setNaamveld({
                      soort: "sectie",
                      waarde: sectie.naam,
                      sectieSoort: e.target.value as SectieSoort,
                    })
                  }
                >
                  <option value="canvas">Canvas</option>
                  <option value="markdown">Markdown</option>
                </select>
              </label>
            )}
            {!prullenbak && (
              <button
                className="notities-nieuwepagina"
                onClick={() => nieuweInhoud("pagina")}
              >
                <Plus size={15} /> Nieuwe pagina
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
                    {p.titel || "Naamloze pagina"}
                  </strong>
                  <span>
                    {paginaTekst(p, s.soort).slice(0, 90) ||
                      "Een lege pagina, klaar voor je ideeën."}
                  </span>
                  <small>
                    {zoekterm || prullenbak
                      ? `${b.naam} / ${s.naam}`
                      : new Intl.DateTimeFormat("nl-NL", {
                          day: "numeric",
                          month: "short",
                        }).format(new Date(p.bijgewerkt))}
                  </small>
                </button>
              ))}
              {!resultaten.length && (
                <p className="notities-geenresultaten">
                  {zoekterm
                    ? "Geen pagina’s gevonden."
                    : prullenbak
                      ? "Je prullenbak is leeg."
                      : "Begin met een nieuwe pagina."}
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
                    title="Deze pagina als Markdown bewaren"
                    disabled={exportBezig}
                    onClick={() => void exporteer(true)}
                  >
                    <Download size={15} /> Markdown
                  </button>
                </div>
                <input
                  className="notities-paginatitel"
                  aria-label="Paginatitel"
                  value={pagina.titel}
                  maxLength={300}
                  readOnly={pagina.verwijderd}
                  placeholder="Naamloze pagina"
                  onChange={(e) =>
                    wijzigPagina(
                      { titel: e.target.value },
                      `titel:${pagina.id}`,
                    )
                  }
                />
                <div className="notities-paginadatum">
                  <CalendarDays size={13} />
                  {new Intl.DateTimeFormat("nl-NL", {
                    dateStyle: "long",
                    timeStyle: "short",
                  }).format(new Date(pagina.bijgewerkt))}
                  <span>·</span>
                  {
                    paginaTekst(pagina, paginaSoort)
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean).length
                  }{" "}
                  {isMarkdown ? "woorden in bron" : "woorden"}
                </div>
                {pagina.verwijderd ? (
                  <>
                    <div className="notities-herstel">
                      <Trash2 size={18} />
                      <span>Deze pagina staat in de prullenbak.</span>
                      <button
                        onClick={() => {
                          wijzigPagina({ verwijderd: false });
                          setPrullenbak(false);
                        }}
                      >
                        Pagina herstellen
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
                          <Plus size={13} /> Tekst toevoegen
                        </button>
                      </>
                    )}
                  />
                )}
              </article>
            ) : (
              <div className="notities-legepagina">
                <NotebookPen size={38} />
                <h2>Ruimte voor een nieuw idee.</h2>
                <p>Kies een pagina of begin een nieuwe notitie.</p>
                <button onClick={() => nieuweInhoud("pagina")}>
                  <Plus size={16} /> Nieuwe pagina
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
            ? "Markdown"
            : `${pagina?.vakken.length ?? 0} tekstvakken · ${Math.round(zoom * 100)}%`}{" "}
          · Ctrl+Z ongedaan maken
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
                ? "Notitieboek een naam geven"
                : naamveld.nieuw
                  ? "Nieuwe sectie"
                  : "Sectie instellen"}
            </h2>
            <label>
              Naam
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
                  Sectietype
                  <select
                    aria-label="Type voor sectie"
                    value={naamveld.sectieSoort ?? sectie?.soort ?? "canvas"}
                    onChange={(e) =>
                      setNaamveld({
                        ...naamveld,
                        sectieSoort: e.target.value as SectieSoort,
                      })
                    }
                  >
                    <option value="canvas">
                      Canvas — vrij geplaatste tekstvakken
                    </option>
                    <option value="markdown">
                      Markdown — tekst met direct voorbeeld
                    </option>
                  </select>
                </label>
                {!naamveld.nieuw &&
                  naamveld.sectieSoort &&
                  naamveld.sectieSoort !== sectie?.soort && (
                    <p>
                      Dit maakt een kopie van de sectie. De oorspronkelijke
                      pagina’s en canvasindeling blijven behouden.{" "}
                      {naamveld.sectieSoort === "canvas" &&
                        "Markdownbron wordt als tekst in een tekstvak overgenomen."}
                    </p>
                  )}
              </>
            )}
            <div>
              <button type="button" onClick={() => setNaamveld(null)}>
                Annuleren
              </button>
              <button type="submit" disabled={!naamveld.waarde.trim()}>
                <Check size={15} />{" "}
                {naamveld.soort === "sectie" &&
                !naamveld.nieuw &&
                naamveld.sectieSoort &&
                naamveld.sectieSoort !== sectie?.soort
                  ? "Maak kopie"
                  : naamveld.nieuw
                    ? "Toevoegen"
                    : "Opslaan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
