import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  Code,
  Download,
  Eye,
  FolderInput,
  FolderPen,
  FolderPlus,
  FolderX,
  Forward,
  MailCheck,
  MailPlus,
  Paperclip,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Settings,
  Star,
  Trash2,
  TriangleAlert,
  UserPlus,
  X,
  Columns3,
  Mail,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Actie, Groep, Ribbon } from "../../../../src/Ribbon";
import { vergelijkTekst } from "../../../../src/i18n/opmaak";
import type { Account, Bericht, BerichtKop, BijlageInfo, MailBackend, Map } from "../contract";
import { bewaarBestand, kiesBackend, openExtern } from "../backend";
import { demoMelding } from "../demo-backend";
import { bouwAntwoord, type AntwoordModus, type OpstelBegin } from "../citaat";
import { foutTekst } from "../fouten";
import { parseAdressen } from "../adressen";
import { veiligeLink } from "../sanitizer";
import { Dialoog, useVraag } from "./Dialoog";
import { Mappenboom, mapNaam, type MapKeuze } from "./Mappenboom";
import { Berichtenlijst } from "./Berichtenlijst";
import { Leesvenster } from "./Leesvenster";
import { Opstelvenster, type OpstelActies } from "./Opstelvenster";
import { AccountWizard } from "./AccountWizard";
import { AccountInstellingen } from "./AccountInstellingen";
import { bewaarIndeling, leesIndeling, STANDAARD_INDELING, type Indeling } from "./voorkeuren";
import "../email.css";

const PAGINA = 100;
type Sorteerveld = "datum" | "van" | "onderwerp" | "grootte";

export interface EmailActies {
  /** Ctrl+S van de host: concept van de open opstelling bewaren. */
  bewaren: () => void;
}

export interface EmailStudioProps {
  bestandsmenu: () => void;
  inactief: boolean;
  /** Meldt een onverzonden opstelling voor de verlaat- en sluitbeveiliging. */
  onOnverzonden: (waarde: boolean) => void;
  /** Opent een bijlage als bewerkbare kopie in Tekst, Rekenblad, Presentatie of Database. */
  openInKantoor: (naam: string, bytes: Uint8Array) => void;
  /** Meldingen in de balk van de kantooromgeving. */
  melding: (tekst: string) => void;
  /** Ongelezen in de inboxen (null = geen account), voor startscherm en statusbalk. */
  ongelezen?: (aantal: number | null) => void;
  registreer?: (acties: EmailActies | null) => void;
  backend?: MailBackend;
}

export default function EmailStudio(props: EmailStudioProps) {
  const { t } = useTranslation("email");
  const backend = useMemo(() => props.backend ?? kiesBackend(), [props.backend]);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountFout, setAccountFout] = useState("");
  const [mappen, setMappen] = useState<Record<string, Map[]>>({});
  const [mapFout, setMapFout] = useState<Record<string, string>>({});
  const [ingeklapt, setIngeklapt] = useState<Set<string>>(new Set());
  const [actief, setActief] = useState<MapKeuze | null>(null);
  const [lijst, setLijst] = useState<BerichtKop[]>([]);
  const [totaal, setTotaal] = useState(0);
  const [lijstLaden, setLijstLaden] = useState(false);
  const [lijstFout, setLijstFout] = useState("");
  const [zoek, setZoek] = useState("");
  const [zoekTerm, setZoekTerm] = useState("");
  const [zoekInhoud, setZoekInhoud] = useState(false);
  const [filter, setFilter] = useState({ ongelezen: false, ster: false, bijlage: false });
  const [sorteer, setSorteer] = useState<{ veld: Sorteerveld; oplopend: boolean }>({ veld: "datum", oplopend: false });
  const [selectie, setSelectie] = useState<number[]>([]);
  const [bericht, setBericht] = useState<Bericht | null>(null);
  const [berichtLaden, setBerichtLaden] = useState(false);
  const [berichtFout, setBerichtFout] = useState("");
  const [opstellen, setOpstellen] = useState<{ accountId: string; begin: OpstelBegin; sleutel: number } | null>(null);
  const [wizard, setWizard] = useState(false);
  const [instellingen, setInstellingen] = useState<string | undefined | null>(null);
  const [verplaatsen, setVerplaatsen] = useState(false);
  const [bron, setBron] = useState<{ tekst: string; bytes: Uint8Array; naam: string } | null>(null);
  const [link, setLink] = useState<{ href: string; tekst: string } | null>(null);
  const [mapDialoog, setMapDialoog] = useState<{ soort: "nieuw" | "hernoem"; naam: string; binnen: boolean } | null>(null);
  const [voorbeeldOpen, setVoorbeeldOpen] = useState(false);
  const [indeling, setIndelingState] = useState<Indeling>(leesIndeling);
  const [vraagElement, vraag, vraagOpen] = useVraag();
  const zoekveld = useRef<HTMLInputElement>(null);
  const lijstRef = useRef<HTMLDivElement>(null);
  const anker = useRef<number | null>(null);
  const lijstVerzoek = useRef(0);
  const berichtVerzoek = useRef(0);
  const opstelActies = useRef<OpstelActies | null>(null);
  const recent = useRef(props);
  recent.current = props;

  const setIndeling = (deel: Partial<Indeling>) =>
    setIndelingState((huidig) => {
      const nieuw = { ...huidig, ...deel };
      bewaarIndeling(nieuw);
      return nieuw;
    });

  const account = accounts?.find((a) => a.id === actief?.accountId) ?? null;
  const huidigeMap = actief ? mappen[actief.accountId]?.find((m) => m.pad === actief.map) : undefined;
  const specialeMap = useCallback(
    (accountId: string, soort: "verzonden" | "concepten" | "prullenbak" | "archief") => {
      const acc = accounts?.find((a) => a.id === accountId);
      return acc?.mappen?.[soort] || mappen[accountId]?.find((m) => m.speciaal === soort)?.pad;
    },
    [accounts, mappen],
  );

  // ---- Accounts en mappen ----
  const laadMappen = useCallback(
    async (accountId: string) => {
      try {
        const lijst = await backend.mappen(accountId);
        setMappen((huidig) => ({ ...huidig, [accountId]: lijst }));
        setMapFout(({ [accountId]: _weg, ...rest }) => rest);
        return lijst;
      } catch (e) {
        setMapFout((huidig) => ({ ...huidig, [accountId]: foutTekst(e) }));
        return [];
      }
    },
    [backend],
  );

  const laadAccounts = useCallback(async () => {
    try {
      const lijst = await backend.accounts();
      setAccounts(lijst);
      setAccountFout("");
      return lijst;
    } catch (e) {
      setAccountFout(foutTekst(e, t("studio.errors.loadAccounts")));
      setAccounts([]);
      return [];
    }
  }, [backend]);

  useEffect(() => {
    void laadAccounts().then(async (lijst) => {
      if (!lijst.length) {
        setWizard(true);
        return;
      }
      const resultaten = await Promise.all(lijst.map((a) => laadMappen(a.id)));
      const inbox = resultaten[0].find((m) => m.speciaal === "inbox") ?? resultaten[0][0];
      if (inbox) setActief((huidig) => huidig ?? { accountId: lijst[0].id, map: inbox.pad });
    });
  }, [laadAccounts, laadMappen]);

  // Ongelezen in de inboxen doorgeven aan de kantooromgeving.
  useEffect(() => {
    if (!accounts) return;
    if (!accounts.length) {
      recent.current.ongelezen?.(null);
      return;
    }
    const aantal = accounts.reduce((som, a) => som + (mappen[a.id]?.find((m) => m.speciaal === "inbox")?.ongelezen ?? 0), 0);
    recent.current.ongelezen?.(aantal);
  }, [accounts, mappen]);

  // ---- Berichtenlijst ----
  useEffect(() => {
    const wacht = setTimeout(() => setZoekTerm(zoek.trim()), 280);
    return () => clearTimeout(wacht);
  }, [zoek]);

  const laadLijst = useCallback(
    async (start: number, behoud = false) => {
      if (!actief) return;
      const verzoek = ++lijstVerzoek.current;
      setLijstLaden(true);
      setLijstFout("");
      try {
        const uitkomst = await backend.berichten(actief.accountId, {
          map: actief.map,
          start: behoud ? 0 : start,
          aantal: behoud ? Math.max(PAGINA, start) : PAGINA,
          zoek: zoekTerm ? { tekst: zoekTerm, velden: zoekInhoud ? ["onderwerp", "van", "aan", "inhoud"] : ["onderwerp", "van", "aan"] } : undefined,
          alleenOngelezen: filter.ongelezen || undefined,
        });
        if (verzoek !== lijstVerzoek.current) return;
        setTotaal(uitkomst.totaal);
        setLijst((huidig) => {
          if (start === 0 || behoud) return uitkomst.berichten;
          const bekend = new Set(huidig.map((b) => b.uid));
          return [...huidig, ...uitkomst.berichten.filter((b) => !bekend.has(b.uid))];
        });
      } catch (e) {
        if (verzoek === lijstVerzoek.current) setLijstFout(foutTekst(e, t("studio.errors.loadMessages")));
      } finally {
        if (verzoek === lijstVerzoek.current) setLijstLaden(false);
      }
    },
    [actief, backend, zoekTerm, zoekInhoud, filter.ongelezen],
  );

  useEffect(() => {
    setLijst([]);
    setTotaal(0);
    setSelectie([]);
    setBericht(null);
    anker.current = null;
    if (lijstRef.current) lijstRef.current.scrollTop = 0;
    void laadLijst(0);
  }, [laadLijst]);

  const clientFilter = filter.ster || filter.bijlage;
  const meer = !lijstLaden && !lijstFout && lijst.length < totaal && (!clientFilter || lijst.length < 2000);
  const laadMeer = useCallback(() => {
    if (meer) void laadLijst(lijst.length);
  }, [meer, laadLijst, lijst.length]);

  const zichtbaar = useMemo(() => {
    let uit = lijst;
    if (filter.ster) uit = uit.filter((b) => b.gemarkeerd);
    if (filter.bijlage) uit = uit.filter((b) => b.heeftBijlagen);
    if (sorteer.veld === "datum" && !sorteer.oplopend) return uit;
    const sleutel = (b: BerichtKop): string | number =>
      sorteer.veld === "datum" ? (b.datum ?? "") : sorteer.veld === "grootte" ? b.grootte : sorteer.veld === "van" ? (b.van[0]?.naam || b.van[0]?.adres || "").toLowerCase() : b.onderwerp.toLowerCase();
    const richting = sorteer.oplopend ? 1 : -1;
    return [...uit].sort((a, b) => {
      const x = sleutel(a);
      const y = sleutel(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : vergelijkTekst(String(x), String(y))) * richting;
    });
  }, [lijst, filter.ster, filter.bijlage, sorteer]);

  // ---- Bericht openen ----
  const openBericht = useCallback(
    async (uid: number) => {
      if (!actief) return;
      const verzoek = ++berichtVerzoek.current;
      setBerichtLaden(true);
      setBerichtFout("");
      setBericht(null);
      try {
        const geladen = await backend.bericht(actief.accountId, actief.map, uid);
        if (verzoek !== berichtVerzoek.current) return;
        setBericht(geladen);
        if (!geladen.gelezen) {
          await backend.markeer(actief.accountId, actief.map, [uid], "gelezen", true);
          setLijst((l) => l.map((b) => (b.uid === uid ? { ...b, gelezen: true } : b)));
          setBericht((b) => (b && b.uid === uid ? { ...b, gelezen: true } : b));
          setMappen((m) => ({
            ...m,
            [actief.accountId]: (m[actief.accountId] ?? []).map((x) => (x.pad === actief.map && x.ongelezen ? { ...x, ongelezen: x.ongelezen - 1 } : x)),
          }));
        }
      } catch (e) {
        if (verzoek === berichtVerzoek.current) setBerichtFout(foutTekst(e, t("studio.errors.openMessage")));
      } finally {
        if (verzoek === berichtVerzoek.current) setBerichtLaden(false);
      }
    },
    [actief, backend],
  );

  function kies(uid: number, modus: "enkel" | "toggle" | "bereik") {
    if (modus === "toggle") {
      const nieuw = selectie.includes(uid) ? selectie.filter((u) => u !== uid) : [...selectie, uid];
      setSelectie(nieuw);
      anker.current = uid;
      if (nieuw.length === 1) void openBericht(nieuw[0]);
      return;
    }
    if (modus === "bereik" && anker.current !== null) {
      const a = zichtbaar.findIndex((b) => b.uid === anker.current);
      const b = zichtbaar.findIndex((x) => x.uid === uid);
      if (a >= 0 && b >= 0) {
        setSelectie(zichtbaar.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.uid));
        return;
      }
    }
    anker.current = uid;
    setSelectie([uid]);
    void openBericht(uid);
  }

  function stap(richting: 1 | -1, alleenOngelezen = false) {
    if (!zichtbaar.length) return;
    const huidig = zichtbaar.findIndex((b) => b.uid === selectie[selectie.length - 1]);
    for (let i = huidig + richting; i >= 0 && i < zichtbaar.length; i += richting) {
      if (!alleenOngelezen || !zichtbaar[i].gelezen) {
        kies(zichtbaar[i].uid, "enkel");
        return;
      }
    }
    if (huidig < 0 && !alleenOngelezen) kies(zichtbaar[richting > 0 ? 0 : zichtbaar.length - 1].uid, "enkel");
  }

  // ---- Acties op de selectie ----
  function haalWeg(uids: number[]) {
    const index = zichtbaar.findIndex((b) => uids.includes(b.uid));
    const rest = zichtbaar.filter((b) => !uids.includes(b.uid));
    setLijst((l) => l.filter((b) => !uids.includes(b.uid)));
    setTotaal((t) => Math.max(0, t - uids.length));
    const volgende = rest[Math.min(Math.max(index, 0), rest.length - 1)];
    if (volgende) {
      anker.current = volgende.uid;
      setSelectie([volgende.uid]);
      void openBericht(volgende.uid);
    } else {
      setSelectie([]);
      setBericht(null);
    }
  }

  async function verwijder() {
    if (!actief || !selectie.length) return;
    const uids = [...selectie];
    const definitief = actief.map === specialeMap(actief.accountId, "prullenbak");
    if (definitief) {
      const keuze = await vraag({
        titel: t("studio.deletePermanently.title"),
        tekst: t("studio.deletePermanently.text", { count: uids.length }),
        knoppen: [
          { waarde: "nee", label: t("common:cancel") },
          { waarde: "ja", label: t("studio.deletePermanently.confirm"), soort: "gevaar" },
        ],
        annuleer: "nee",
      });
      if (keuze !== "ja") return;
    }
    try {
      await backend.verwijder(actief.accountId, actief.map, uids, definitief);
      haalWeg(uids);
      void laadMappen(actief.accountId);
    } catch (e) {
      props.melding(foutTekst(e, t("studio.errors.delete")));
    }
  }

  async function verplaats(doel: string) {
    if (!actief || !selectie.length || doel === actief.map) return;
    const uids = [...selectie];
    try {
      await backend.verplaats(actief.accountId, actief.map, uids, doel);
      haalWeg(uids);
      void laadMappen(actief.accountId);
    } catch (e) {
      props.melding(foutTekst(e, t("studio.errors.move")));
    }
  }

  async function archiveer() {
    if (!actief || !selectie.length) return;
    const doel = specialeMap(actief.accountId, "archief");
    if (!doel) {
      props.melding(t("studio.noArchiveFolder"));
      return;
    }
    if (doel === actief.map) return;
    await verplaats(doel);
  }

  async function markeer(vlag: "gelezen" | "gemarkeerd", uids = selectie) {
    if (!actief || !uids.length) return;
    const items = lijst.filter((b) => uids.includes(b.uid));
    const aan = !items.every((b) => b[vlag]);
    try {
      await backend.markeer(actief.accountId, actief.map, uids, vlag, aan);
      setLijst((l) => l.map((b) => (uids.includes(b.uid) ? { ...b, [vlag]: aan } : b)));
      setBericht((b) => (b && uids.includes(b.uid) ? { ...b, [vlag]: aan } : b));
      if (vlag === "gelezen") void laadMappen(actief.accountId);
    } catch (e) {
      props.melding(foutTekst(e, t("studio.errors.mark")));
    }
  }

  // ---- Opstellen ----
  function nieuw(begin: OpstelBegin = {}) {
    if (!accounts?.length) {
      setWizard(true);
      return;
    }
    if (opstellen) return;
    setOpstellen({ accountId: account?.id ?? accounts[0].id, begin, sleutel: Date.now() });
  }

  async function beantwoord(modus: AntwoordModus) {
    if (!bericht || !actief || !accounts || opstellen) return;
    const eigen = accounts.flatMap((a) => [a.email, ...(a.antwoordAan ? [a.antwoordAan] : [])]);
    const begin = bouwAntwoord(bericht, modus, eigen, actief.accountId);
    if (modus === "doorsturen") {
      try {
        begin.bijlagen = await Promise.all(
          bericht.bijlagen
            .filter((b) => !b.inline || !b.contentId)
            .map(async (b) => ({ bestandsnaam: b.bestandsnaam, inhoudstype: b.inhoudstype, bytes: await backend.bijlage(actief.accountId, bericht.map, bericht.uid, b.index) })),
        );
      } catch (e) {
        props.melding(foutTekst(e, t("studio.errors.forwardAttachments")));
      }
    }
    setOpstellen({ accountId: actief.accountId, begin, sleutel: Date.now() });
  }

  useEffect(() => {
    props.registreer?.({ bewaren: () => opstelActies.current?.bewaren() });
    return () => props.registreer?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.registreer]);

  // ---- Ophalen ----
  const ophalen = useCallback(
    async (stil = false) => {
      if (!accounts?.length) return;
      await Promise.all(accounts.map((a) => laadMappen(a.id)));
      await laadLijst(lijst.length, true);
      if (!stil) props.melding(t("studio.fetched"));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, laadMappen, laadLijst, lijst.length],
  );
  const ophalenRef = useRef(ophalen);
  ophalenRef.current = ophalen;
  useEffect(() => {
    const timers = (accounts ?? [])
      .filter((a) => a.controleerElke > 0)
      .map((a) => setInterval(() => void ophalenRef.current(true), a.controleerElke * 60_000));
    return () => timers.forEach(clearInterval);
  }, [accounts]);

  // ---- Bijlagen en links ----
  async function openBijlage(b: BijlageInfo) {
    if (!actief || !bericht) return;
    try {
      const bytes = await backend.bijlage(actief.accountId, bericht.map, bericht.uid, b.index);
      props.openInKantoor(b.bestandsnaam, bytes);
    } catch (e) {
      props.melding(foutTekst(e, t("studio.errors.openFile", { name: b.bestandsnaam })));
    }
  }
  async function bewaarBijlage(b: BijlageInfo) {
    if (!actief || !bericht) return;
    try {
      const bytes = await backend.bijlage(actief.accountId, bericht.map, bericht.uid, b.index);
      props.melding(await bewaarBestand(b.bestandsnaam, bytes, b.inhoudstype));
    } catch (e) {
      props.melding(foutTekst(e, t("studio.errors.saveFile", { name: b.bestandsnaam })));
    }
  }
  function volgLink(href: string, tekst: string) {
    const veilig = veiligeLink(href);
    if (!veilig) return;
    if (veilig.toLowerCase().startsWith("mailto:")) {
      try {
        const url = new URL(veilig);
        const onderwerp = url.searchParams.get("subject") ?? undefined;
        nieuw({ aan: parseAdressen(decodeURIComponent(url.pathname)), onderwerp });
      } catch {
        nieuw({ aan: parseAdressen(veilig.slice(7)) });
      }
      return;
    }
    setLink({ href: veilig, tekst: tekst.trim() });
  }

  async function toonBron() {
    if (!actief || !bericht) return;
    try {
      const bytes = await backend.bron(actief.accountId, bericht.map, bericht.uid);
      const naam = `${(bericht.onderwerp || "bericht").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80)}.eml`;
      setBron({ tekst: new TextDecoder("utf-8").decode(bytes), bytes, naam });
    } catch (e) {
      props.melding(foutTekst(e, t("studio.errors.source")));
    }
  }

  // ---- Mappenbeheer ----
  async function bevestigMap() {
    if (!mapDialoog || !actief) return;
    const naam = mapDialoog.naam.trim().replace(/[/\\]/g, "-");
    if (!naam) return;
    const scheiding = huidigeMap?.scheiding || "/";
    try {
      if (mapDialoog.soort === "nieuw") {
        const pad = mapDialoog.binnen ? `${actief.map}${scheiding}${naam}` : naam;
        await backend.maakMap(actief.accountId, pad);
      } else {
        const deel = actief.map.lastIndexOf(scheiding);
        const pad = deel < 0 ? naam : `${actief.map.slice(0, deel)}${scheiding}${naam}`;
        await backend.hernoemMap(actief.accountId, actief.map, pad);
        setActief({ accountId: actief.accountId, map: pad });
      }
      setMapDialoog(null);
      void laadMappen(actief.accountId);
    } catch (e) {
      props.melding(foutTekst(e, t("studio.errors.updateFolder")));
    }
  }
  async function verwijderMap() {
    if (!actief || !huidigeMap || huidigeMap.speciaal) return;
    const keuze = await vraag({
      titel: t("studio.deleteFolder.title"),
      tekst: t("studio.deleteFolder.text", { folder: mapNaam(huidigeMap, t) }),
      knoppen: [
        { waarde: "nee", label: t("common:cancel") },
        { waarde: "ja", label: t("studio.deleteFolder.title"), soort: "gevaar" },
      ],
      annuleer: "nee",
    });
    if (keuze !== "ja") return;
    try {
      await backend.verwijderMap(actief.accountId, actief.map);
      const lijst = await laadMappen(actief.accountId);
      const inbox = lijst.find((m) => m.speciaal === "inbox") ?? lijst[0];
      setActief(inbox ? { accountId: actief.accountId, map: inbox.pad } : null);
    } catch (e) {
      props.melding(foutTekst(e, t("studio.errors.deleteFolder")));
    }
  }

  // ---- Sneltoetsen zoals Thunderbird ----
  const modaal = voorbeeldOpen || !!opstellen || wizard || instellingen !== null || verplaatsen || !!bron || !!link || vraagOpen || !!mapDialoog;
  const toetsen = useRef<(e: KeyboardEvent) => void>(() => {});
  toetsen.current = (e: KeyboardEvent) => {
    if (props.inactief || modaal || e.defaultPrevented) return;
    const doel = e.target as HTMLElement | null;
    const invoer = !!doel && (doel instanceof HTMLInputElement || doel instanceof HTMLTextAreaElement || doel instanceof HTMLSelectElement || doel.isContentEditable);
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const doe = (actie: () => void) => {
      e.preventDefault();
      actie();
    };
    if (ctrl && !e.shiftKey && k === "n") return doe(() => nieuw());
    if (ctrl && k === "r") return doe(() => void beantwoord(e.shiftKey ? "allen" : "antwoord"));
    if (ctrl && !e.shiftKey && k === "l") return doe(() => void beantwoord("doorsturen"));
    if (ctrl && !e.shiftKey && k === "f") return doe(() => zoekveld.current?.focus());
    if (e.key === "F5" || (ctrl && !e.shiftKey && k === "t")) return doe(() => void ophalen());
    if (invoer || ctrl || e.altKey) return;
    if (e.key === "Delete") return doe(() => void verwijder());
    if (k === "m") return doe(() => void markeer("gelezen"));
    if (k === "s") return doe(() => void markeer("gemarkeerd"));
    if (k === "a") return doe(() => void archiveer());
    if (k === "f" || e.key === "ArrowDown") return doe(() => stap(1));
    if (k === "b" || e.key === "ArrowUp") return doe(() => stap(-1));
    if (k === "n") return doe(() => stap(1, true));
  };
  useEffect(() => {
    const luister = (e: KeyboardEvent) => toetsen.current(e);
    window.addEventListener("keydown", luister);
    return () => window.removeEventListener("keydown", luister);
  }, []);

  // ---- Kolommen verslepen ----
  function versleep(kolom: "mappen" | "lijst", e: React.PointerEvent) {
    e.preventDefault();
    const start = e.clientX;
    const begin = indeling[kolom];
    const doel = e.currentTarget as HTMLElement;
    const richting = getComputedStyle(doel).direction === "rtl" ? -1 : 1;
    doel.setPointerCapture(e.pointerId);
    const beweeg = (ev: PointerEvent) => {
      const breedte = Math.round(Math.min(kolom === "mappen" ? 420 : 760, Math.max(kolom === "mappen" ? 150 : 240, begin + (ev.clientX - start) * richting)));
      setIndelingState((h) => ({ ...h, [kolom]: breedte }));
    };
    const los = () => {
      doel.removeEventListener("pointermove", beweeg);
      doel.removeEventListener("pointerup", los);
      setIndelingState((h) => {
        bewaarIndeling(h);
        return h;
      });
    };
    doel.addEventListener("pointermove", beweeg);
    doel.addEventListener("pointerup", los);
  }
  const splitter = (kolom: "mappen" | "lijst", label: string) => (
    <div
      className="email-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={indeling[kolom]}
      tabIndex={0}
      onPointerDown={(e) => versleep(kolom, e)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
          const smaller = (e.key === "ArrowLeft") !== rtl;
          setIndeling({ [kolom]: Math.max(150, indeling[kolom] + (smaller ? -16 : 16)) });
        }
      }}
    />
  );

  const heeftSelectie = selectie.length > 0;
  const heeftBericht = !!bericht && !!actief;
  const isVerzonden = !!actief && (actief.map === specialeMap(actief.accountId, "verzonden") || actief.map === specialeMap(actief.accountId, "concepten"));
  const geenAccount = accounts !== null && accounts.length === 0;

  const tabs = [
    {
      id: "start",
      naam: t("ribbon.tabs.start"),
      inhoud: (
        <>
          <Groep naam={t("ribbon.groups.new")}>
            <Actie icoon={MailPlus} naam={t("compose.newMessage")} groot title={t("ribbon.withShortcut", { action: t("compose.newMessage"), shortcut: "Ctrl+N" })} onClick={() => nieuw()} disabled={!accounts} />
            <Actie icoon={RefreshCw} naam={t("ribbon.fetch")} title={t("ribbon.fetchTitle", { key: "F5", shortcut: "Ctrl+T" })} onClick={() => void ophalen()} disabled={!accounts?.length} />
          </Groep>
          <Groep naam={t("ribbon.groups.respond")}>
            <Actie icoon={Reply} naam={t("reader.reply")} groot title={t("reader.replyTitle", { shortcut: "Ctrl+R" })} disabled={!heeftBericht} onClick={() => void beantwoord("antwoord")} />
            <Actie icoon={ReplyAll} naam={t("reader.replyAll")} title={t("reader.replyAllTitle", { shortcut: "Ctrl+Shift+R" })} disabled={!heeftBericht} onClick={() => void beantwoord("allen")} />
            <Actie icoon={Forward} naam={t("reader.forward")} title={t("reader.forwardTitle", { shortcut: "Ctrl+L" })} disabled={!heeftBericht} onClick={() => void beantwoord("doorsturen")} />
          </Groep>
          <Groep naam={t("ribbon.groups.delete")}>
            <Actie icoon={Trash2} naam={t("reader.delete")} groot title={t("reader.deleteTitle", { shortcut: "Del" })} disabled={!heeftSelectie} onClick={() => void verwijder()} />
            <Actie icoon={Archive} naam={t("reader.archive")} title={t("reader.archiveTitle", { shortcut: "A" })} disabled={!heeftSelectie} onClick={() => void archiveer()} />
          </Groep>
          <Groep naam={t("ribbon.groups.mark")}>
            <Actie icoon={MailCheck} naam={t("ribbon.readUnread")} title={t("ribbon.readUnreadTitle", { shortcut: "M" })} disabled={!heeftSelectie} onClick={() => void markeer("gelezen")} />
            <Actie icoon={Star} naam={t("ribbon.star")} title={t("reader.starTitle", { shortcut: "S" })} disabled={!heeftSelectie} actief={!!bericht?.gemarkeerd} onClick={() => void markeer("gemarkeerd")} />
          </Groep>
          <Groep naam={t("ribbon.groups.organize")}>
            <Actie icoon={FolderInput} naam={t("ribbon.move")} groot title={t("ribbon.moveTitle")} disabled={!heeftSelectie} onClick={() => setVerplaatsen(true)} />
          </Groep>
        </>
      ),
    },
    {
      id: "beeld",
      naam: t("ribbon.tabs.view"),
      inhoud: (
        <>
          <Groep naam={t("ribbon.groups.layout")}>
            <Actie icoon={PanelLeft} naam={t("ribbon.folderPane")} actief={indeling.toonMappen} onClick={() => setIndeling({ toonMappen: !indeling.toonMappen })} />
            <Actie icoon={PanelRight} naam={t("ribbon.readingPane")} actief={indeling.toonLeesvenster} onClick={() => setIndeling({ toonLeesvenster: !indeling.toonLeesvenster })} />
            <Actie icoon={Columns3} naam={t("ribbon.resetLayout")} onClick={() => setIndeling(STANDAARD_INDELING)} />
          </Groep>
          <Groep naam={t("ribbon.groups.sort")}>
            <label className="ribbon-keuze" title={t("ribbon.sortBy")}>
              <select aria-label={t("ribbon.sortBy")} value={sorteer.veld} onChange={(e) => setSorteer({ ...sorteer, veld: e.target.value as Sorteerveld })}>
                <option value="datum">{t("ribbon.sort.date")}</option>
                <option value="van">{t("ribbon.sort.sender")}</option>
                <option value="onderwerp">{t("ribbon.sort.subject")}</option>
                <option value="grootte">{t("ribbon.sort.size")}</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <Actie
              icoon={sorteer.oplopend ? ArrowUpNarrowWide : ArrowDownWideNarrow}
              naam={sorteer.oplopend ? t("ribbon.ascending") : t("ribbon.descending")}
              onClick={() => setSorteer({ ...sorteer, oplopend: !sorteer.oplopend })}
            />
          </Groep>
          <Groep naam={t("ribbon.groups.message")}>
            <Actie icoon={Code} naam={t("ribbon.viewSource")} disabled={!heeftBericht} onClick={() => void toonBron()} />
          </Groep>
        </>
      ),
    },
    {
      id: "extra",
      naam: t("ribbon.tabs.tools"),
      inhoud: (
        <>
          <Groep naam={t("ribbon.groups.accounts")}>
            <Actie icoon={Settings} naam={t("ribbon.accountSettings")} groot onClick={() => setInstellingen(actief?.accountId)} disabled={!accounts} />
            <Actie icoon={UserPlus} naam={t("studio.addAccount")} onClick={() => setWizard(true)} />
          </Groep>
          <Groep naam={t("ribbon.groups.folders")}>
            <Actie icoon={FolderPlus} naam={t("studio.folderDialog.newTitle")} disabled={!actief} onClick={() => setMapDialoog({ soort: "nieuw", naam: "", binnen: false })} />
            <Actie icoon={FolderPen} naam={t("studio.folderDialog.rename")} disabled={!huidigeMap || !!huidigeMap.speciaal} onClick={() => setMapDialoog({ soort: "hernoem", naam: huidigeMap?.naam ?? "", binnen: false })} />
            <Actie icoon={FolderX} naam={t("studio.deleteFolder.title")} disabled={!huidigeMap || !!huidigeMap.speciaal} onClick={() => void verwijderMap()} />
          </Groep>
        </>
      ),
    },
  ];

  const kolommen = [
    indeling.toonMappen ? `${indeling.mappen}px 5px` : "",
    indeling.toonLeesvenster ? `${indeling.lijst}px 5px minmax(0, 1fr)` : "minmax(0, 1fr)",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="email-studio" inert={props.inactief}>
      <Ribbon tabs={tabs} bestand={props.bestandsmenu} />
      {backend.soort === "demo" && (
        <div className="email-demobalk" role="note">
          <TriangleAlert size={14} /> {demoMelding()}
        </div>
      )}
      {accountFout && (
        <div className="email-demobalk is-fout" role="alert">
          {accountFout}
        </div>
      )}
      {geenAccount && !wizard ? (
        <div className="email-welkom">
          <Mail size={40} strokeWidth={1.2} />
          <h2>{t("studio.welcome.title")}</h2>
          <p>{t("studio.welcome.text")}</p>
          <button className="email-knop is-primair" onClick={() => setWizard(true)}>
            <UserPlus size={15} /> {t("studio.addAccount")}
          </button>
        </div>
      ) : (
        <div className="email-werkruimte" style={{ gridTemplateColumns: kolommen }} inert={modaal && !voorbeeldOpen}>
          {indeling.toonMappen && (
            <>
              <Mappenboom
                accounts={accounts ?? []}
                mappen={mappen}
                actief={actief}
                kies={(keuze) => setActief(keuze)}
                ingeklapt={ingeklapt}
                wisselInklap={(id) =>
                  setIngeklapt((h) => {
                    const n = new Set(h);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                ladenFout={mapFout}
              />
              {splitter("mappen", t("studio.folderPaneWidth"))}
            </>
          )}
          <section className="email-lijstpaneel" aria-label={t("studio.messageList")}>
            <div className="email-lijstkop">
              <div className="email-zoek">
                <Search size={14} />
                <input
                  ref={zoekveld}
                  type="search"
                  value={zoek}
                  placeholder={huidigeMap ? t("studio.search.in", { folder: mapNaam(huidigeMap, t) }) : t("common:search")}
                  aria-label={t("studio.search.label", { shortcut: "Ctrl+F" })}
                  onChange={(e) => setZoek(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && zoek) {
                      e.stopPropagation();
                      setZoek("");
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      lijstRef.current?.focus();
                      stap(1);
                    }
                  }}
                />
                {zoek && (
                  <button className="email-iconknop" aria-label={t("studio.search.clear")} onClick={() => setZoek("")}>
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="email-snelfilter" role="group" aria-label={t("studio.filter.label")}>
                <button aria-pressed={filter.ongelezen} onClick={() => setFilter({ ...filter, ongelezen: !filter.ongelezen })} title={t("studio.filter.unreadTitle")}>
                  <Eye size={13} /> {t("studio.filter.unread")}
                </button>
                <button aria-pressed={filter.ster} onClick={() => setFilter({ ...filter, ster: !filter.ster })} title={t("studio.filter.starredTitle")}>
                  <Star size={13} /> {t("studio.filter.starred")}
                </button>
                <button aria-pressed={filter.bijlage} onClick={() => setFilter({ ...filter, bijlage: !filter.bijlage })} title={t("studio.filter.attachmentTitle")}>
                  <Paperclip size={13} /> {t("studio.filter.attachment")}
                </button>
                <label className="email-zoekinhoud" title={t("studio.filter.bodyTitle")}>
                  <input type="checkbox" checked={zoekInhoud} onChange={(e) => setZoekInhoud(e.target.checked)} /> {t("studio.filter.body")}
                </label>
              </div>
              <div className="email-lijstinfo" aria-live="polite">
                <strong>{huidigeMap ? mapNaam(huidigeMap, t) : "—"}</strong>
                <span>
                  {lijstLaden && !lijst.length
                    ? t("common:loading")
                    : clientFilter
                      ? lijst.length < totaal
                        ? t("studio.count.filteredLoaded", { shown: zichtbaar.length, loaded: lijst.length })
                        : t("studio.count.filtered", { shown: zichtbaar.length, total: totaal })
                      : t("studio.count.messages", { count: totaal })}
                  {selectie.length > 1 ? ` · ${t("studio.count.selected", { count: selectie.length })}` : ""}
                </span>
              </div>
            </div>
            {lijstFout ? (
              <div className="email-leeg" role="alert">
                <p>{lijstFout}</p>
                <button className="email-knop" onClick={() => void laadLijst(0)}>
                  {t("common:retry")}
                </button>
              </div>
            ) : !lijstLaden && !zichtbaar.length && actief ? (
              <div className="email-leeg">
                <p>{zoekTerm || clientFilter || filter.ongelezen ? t("studio.noResults") : t("studio.emptyFolder")}</p>
              </div>
            ) : (
              <Berichtenlijst
                berichten={zichtbaar}
                selectie={selectie}
                kies={kies}
                ster={(uid) => void markeer("gemarkeerd", [uid])}
                laadMeer={laadMeer}
                meer={meer}
                toonOntvanger={isVerzonden}
                lijstRef={lijstRef}
              />
            )}
          </section>
          {indeling.toonLeesvenster && (
            <>
              {splitter("lijst", t("studio.messageListWidth"))}
              <section className="email-leespaneel" aria-label={t("ribbon.readingPane")}>
                {account ? (
                  <Leesvenster
                    backend={backend}
                    account={account}
                    bericht={bericht}
                    bezig={berichtLaden}
                    fout={berichtFout}
                    beantwoord={(modus) => void beantwoord(modus)}
                    verwijder={() => void verwijder()}
                    archiveer={() => void archiveer()}
                    ster={() => void markeer("gemarkeerd")}
                    openBijlage={(b) => void openBijlage(b)}
                    bewaarBijlage={(b) => void bewaarBijlage(b)}
                    link={volgLink}
                    openBytes={props.openInKantoor}
                    bewaarBytes={(naam, bytes, type) => void bewaarBestand(naam, bytes, type).then(props.melding, (e) => props.melding(foutTekst(e, t("studio.errors.saveFile", { name: naam }))))}
                    openLink={(url) => {
                      const veilig = veiligeLink(url);
                      if (veilig) void openExtern(veilig).then((ok) => ok || props.melding(t("link.browserFailed", { url: veilig })));
                    }}
                    voorbeeldOpen={setVoorbeeldOpen}
                  />
                ) : (
                  <div className="email-leeg" />
                )}
              </section>
            </>
          )}
        </div>
      )}
      {opstellen && accounts && (
        <Opstelvenster
          key={opstellen.sleutel}
          backend={backend}
          accounts={accounts}
          accountId={opstellen.accountId}
          begin={opstellen.begin}
          sluit={() => {
            setOpstellen(null);
            props.onOnverzonden(false);
            if (actief) void laadMappen(actief.accountId);
          }}
          verzonden={(m) => {
            props.melding(m);
            if (actief) {
              const bron = opstellen.begin.bron;
              if (bron && bron.map === actief.map && bron.modus !== "doorsturen") {
                setLijst((l) => l.map((b) => (b.uid === bron.uid ? { ...b, beantwoord: true } : b)));
                setBericht((b) => (b && b.uid === bron.uid ? { ...b, beantwoord: true } : b));
              }
            }
          }}
          onOnverzonden={props.onOnverzonden}
          registreer={(a) => (opstelActies.current = a)}
        />
      )}
      {wizard && (
        <AccountWizard
          backend={backend}
          sluit={accounts?.length || geenAccount ? () => setWizard(false) : undefined}
          klaar={async (nieuwAccount) => {
            setWizard(false);
            await laadAccounts();
            const lijst = await laadMappen(nieuwAccount.id);
            const inbox = lijst.find((m) => m.speciaal === "inbox") ?? lijst[0];
            if (inbox) setActief({ accountId: nieuwAccount.id, map: inbox.pad });
            props.melding(t("studio.accountAdded", { email: nieuwAccount.email }));
          }}
        />
      )}
      {instellingen !== null && accounts && (
        <AccountInstellingen
          backend={backend}
          accounts={accounts}
          gekozen={instellingen}
          sluit={() => setInstellingen(null)}
          nieuwAccount={() => {
            setInstellingen(null);
            setWizard(true);
          }}
          gewijzigd={async (id) => {
            const lijst = await laadAccounts();
            if (id) void laadMappen(id);
            if (actief && !lijst.some((a) => a.id === actief.accountId)) {
              setActief(null);
              const eerste = lijst[0];
              if (eerste) {
                const m = await laadMappen(eerste.id);
                const inbox = m.find((x) => x.speciaal === "inbox") ?? m[0];
                if (inbox) setActief({ accountId: eerste.id, map: inbox.pad });
              } else setInstellingen(null);
            }
          }}
        />
      )}
      {verplaatsen && actief && (
        <Dialoog titel={t("studio.moveTo", { count: selectie.length })} sluit={() => setVerplaatsen(false)}>
          <ul className="email-mapkeuze">
            {(mappen[actief.accountId] ?? [])
              .filter((m) => m.selecteerbaar && m.pad !== actief.map)
              .map((m) => (
                <li key={m.pad}>
                  <button
                    className="email-knop"
                    onClick={() => {
                      setVerplaatsen(false);
                      void verplaats(m.pad);
                    }}
                  >
                    <FolderInput size={14} /> {m.pad
                      .split(m.scheiding || "/")
                      .map((deel, i) => (i === 0 && deel.toUpperCase() === "INBOX" ? t("folders.inbox") : deel))
                      .join(" › ")}
                  </button>
                </li>
              ))}
          </ul>
        </Dialoog>
      )}
      {mapDialoog && (
        <Dialoog
          titel={mapDialoog.soort === "nieuw" ? t("studio.folderDialog.newTitle") : t("studio.folderDialog.renameTitle")}
          sluit={() => setMapDialoog(null)}
          acties={
            <>
              <button className="email-knop" onClick={() => setMapDialoog(null)}>
                {t("common:cancel")}
              </button>
              <button className="email-knop is-primair" disabled={!mapDialoog.naam.trim()} onClick={() => void bevestigMap()}>
                {mapDialoog.soort === "nieuw" ? t("studio.folderDialog.create") : t("studio.folderDialog.rename")}
              </button>
            </>
          }
        >
          <form
            className="email-formulier"
            onSubmit={(e) => {
              e.preventDefault();
              void bevestigMap();
            }}
          >
            <label>
              {t("studio.folderDialog.name")}
              <input autoFocus value={mapDialoog.naam} onChange={(e) => setMapDialoog({ ...mapDialoog, naam: e.target.value })} />
            </label>
            {mapDialoog.soort === "nieuw" && huidigeMap && (
              <label className="email-vinkje">
                <input type="checkbox" checked={mapDialoog.binnen} onChange={(e) => setMapDialoog({ ...mapDialoog, binnen: e.target.checked })} />
                <span>{t("studio.folderDialog.inside", { folder: mapNaam(huidigeMap, t) })}</span>
              </label>
            )}
          </form>
        </Dialoog>
      )}
      {bron && (
        <Dialoog
          titel={t("studio.source.title")}
          breed="groot"
          sluit={() => setBron(null)}
          acties={
            <>
              <button className="email-knop" onClick={() => void bewaarBestand(bron.naam, bron.bytes, "message/rfc822").then(props.melding, (e) => props.melding(foutTekst(e)))}>
                <Download size={14} /> {t("studio.source.saveAs", { extension: ".eml" })}
              </button>
              <button className="email-knop is-primair" onClick={() => setBron(null)}>
                {t("common:close")}
              </button>
            </>
          }
        >
          <pre className="email-bron">{bron.tekst}</pre>
        </Dialoog>
      )}
      {link && (
        <LinkDialoog
          {...link}
          sluit={() => setLink(null)}
          melding={props.melding}
        />
      )}
      {vraagElement}
    </div>
  );
}

function LinkDialoog({ href, tekst, sluit, melding }: { href: string; tekst: string; sluit: () => void; melding: (m: string) => void }) {
  const doel = (() => {
    try {
      return new URL(href);
    } catch {
      return null;
    }
  })();
  // Waarschuwen als de zichtbare tekst een ander domein noemt dan het echte doel.
  const zichtbaarDomein = /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]|$)/i.exec(tekst)?.[1]?.toLowerCase();
  const misleidend = !!zichtbaarDomein && !!doel && !doel.hostname.toLowerCase().endsWith(zichtbaarDomein.replace(/^www\./, ""));
  const tel = href.startsWith("tel:");
  const { t } = useTranslation("email");
  return (
    <Dialoog
      titel={tel ? t("link.phoneTitle") : t("link.openTitle")}
      sluit={sluit}
      rol="alertdialog"
      acties={
        <>
          <button className="email-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button
            className="email-knop"
            onClick={() => {
              void navigator.clipboard?.writeText(tel ? href.slice(4) : href).then(
                () => melding(t("link.copied")),
                () => melding(t("link.copyFailed")),
              );
              sluit();
            }}
          >
            {t("link.copy")}
          </button>
          {!tel && (
            <button
              className="email-knop is-primair"
              autoFocus
              onClick={() => {
                void openExtern(href).then((gelukt) => {
                  if (!gelukt) melding(t("link.browserFailed", { url: href }));
                });
                sluit();
              }}
            >
              {t("link.openInBrowser")}
            </button>
          )}
        </>
      }
    >
      <p>{tel ? t("link.phoneIntro") : t("link.realTarget")}</p>
      <code className="email-linkdoel" dir="ltr">
        {doel ? (
          <>
            {doel.protocol}//<strong>{doel.hostname}</strong>
            {doel.port ? `:${doel.port}` : ""}
            {doel.pathname}
            {doel.search}
            {doel.hash}
          </>
        ) : (
          href
        )}
      </code>
      {misleidend && (
        <p className="email-waarschuwing" role="alert">
          <TriangleAlert size={15} />
          <span>
            <Trans
              t={t}
              i18nKey="link.misleading"
              values={{ shown: zichtbaarDomein, actual: doel!.hostname }}
              components={{ strong: <strong /> }}
            />
          </span>
        </p>
      )}
      {doel?.protocol === "http:" && <p className="email-hint">{t("link.unencrypted")}</p>}
    </Dialoog>
  );
}
