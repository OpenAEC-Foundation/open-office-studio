import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Paperclip,
  RemoveFormatting,
  Save,
  Send,
  Underline,
  X,
  TriangleAlert,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { Account, Adres, MailBackend, Opstelling } from "../contract";
import { formatAdres, isGeldigAdres } from "../adressen";
import type { OpstelBegin } from "../citaat";
import { vergetenBijlage } from "../bijlagecontrole";
import { escapeTekst, htmlNaarTekst, saneerHtml, veiligeLink } from "../sanitizer";
import { foutTekst } from "../fouten";
import { grootteTekst, inhoudstype } from "../kantoor";
import { Adresveld } from "./Adresveld";
import { useVraag } from "./Dialoog";

export interface OpstelActies {
  /** Concept bewaren (Ctrl+S van de host). */
  bewaren: () => void;
}

type Bijlage = { bestandsnaam: string; inhoudstype: string; bytes: Uint8Array };
const MAX_BIJLAGEN = 25 * 1024 * 1024;

function handtekeningHtml(handtekening?: string) {
  if (!handtekening?.trim()) return "";
  return `<div class="handtekening">-- <br>${escapeTekst(handtekening).replace(/\r?\n/g, "<br>")}</div>`;
}

/** Opstelvenster: ontvangers, onderwerp, eenvoudige opmaak, bijlagen en verzenden. */
export function Opstelvenster({
  backend,
  accounts,
  accountId: beginAccount,
  begin,
  sluit,
  verzonden,
  onOnverzonden,
  registreer,
}: {
  backend: MailBackend;
  accounts: Account[];
  accountId: string;
  begin: OpstelBegin;
  sluit: () => void;
  verzonden: (melding: string) => void;
  onOnverzonden: (waarde: boolean) => void;
  registreer?: (acties: OpstelActies | null) => void;
}) {
  const { t, i18n } = useTranslation("email");
  const [accountId, setAccountId] = useState(beginAccount);
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const [aan, setAan] = useState<Adres[]>(begin.aan ?? []);
  const [cc, setCc] = useState<Adres[]>(begin.cc ?? []);
  const [bcc, setBcc] = useState<Adres[]>(begin.bcc ?? []);
  const [toonCc, setToonCc] = useState(!!begin.cc?.length);
  const [toonBcc, setToonBcc] = useState(!!begin.bcc?.length);
  const [onderwerp, setOnderwerp] = useState(begin.onderwerp ?? "");
  const [bijlagen, setBijlagen] = useState<Bijlage[]>(begin.bijlagen ?? []);
  const [gewijzigd, setGewijzigd] = useState(false);
  const [bezig, setBezig] = useState<"" | "verzenden" | "bewaren">("");
  const [fout, setFout] = useState("");
  const [slepen, setSlepen] = useState(false);
  const [koppeling, setKoppeling] = useState<{ url: string; bereik: Range | null } | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const bestandskiezer = useRef<HTMLInputElement>(null);
  const [vraagElement, vraag, vraagOpen] = useVraag();
  const recent = useRef({ gewijzigd, onOnverzonden });
  recent.current = { gewijzigd, onOnverzonden };

  const beginHtml = useMemo(
    () => `<p><br></p>${handtekeningHtml(account?.handtekening)}${begin.html ?? (begin.tekst ? `<p>${escapeTekst(begin.tekst).replace(/\n/g, "<br>")}</p>` : "")}`,
    // Alleen bij het openen; een accountwissel vervangt de handtekening apart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    if (!editor.current) return;
    // Alles hierin is al gesaneerd (citaat) of eigen opmaak.
    editor.current.innerHTML = beginHtml;
    if (begin.aan?.length) {
      editor.current.focus();
      const bereik = document.createRange();
      bereik.setStart(editor.current.firstChild ?? editor.current, 0);
      bereik.collapse(true);
      const selectie = getSelection();
      selectie?.removeAllRanges();
      selectie?.addRange(bereik);
    }
  }, [beginHtml]);

  function markeerGewijzigd() {
    if (!recent.current.gewijzigd) {
      setGewijzigd(true);
      onOnverzonden(true);
    }
  }
  useEffect(() => () => recent.current.onOnverzonden(false), []);

  function wisselAccount(id: string) {
    const nieuw = accounts.find((a) => a.id === id);
    const oud = editor.current?.querySelector(".handtekening");
    const html = handtekeningHtml(nieuw?.handtekening);
    if (oud) {
      if (html) oud.outerHTML = html;
      else oud.remove();
    } else if (html && editor.current) editor.current.firstElementChild?.insertAdjacentHTML("afterend", html);
    setAccountId(id);
    markeerGewijzigd();
  }

  function opstelling(): Opstelling {
    const html = saneerHtml(editor.current?.innerHTML ?? "", { stijlblokken: false, klassen: false }).html;
    return {
      van: formatAdres({ naam: account.volledigeNaam, adres: account.email }),
      aan: aan.map(formatAdres),
      cc: cc.map(formatAdres),
      bcc: bcc.map(formatAdres),
      onderwerp: onderwerp.trim(),
      tekst: htmlNaarTekst(html),
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`,
      inReplyTo: begin.inReplyTo,
      referenties: begin.referenties,
      bijlagen,
    };
  }

  async function bewaarConcept() {
    if (bezig) return;
    setBezig("bewaren");
    setFout("");
    try {
      await backend.bewaarConcept(account.id, opstelling());
      setGewijzigd(false);
      onOnverzonden(false);
      return true;
    } catch (e) {
      setFout(foutTekst(e, t("compose.errors.saveDraft")));
      return false;
    } finally {
      setBezig("");
    }
  }

  useEffect(() => {
    registreer?.({ bewaren: () => void bewaarConcept() });
    return () => registreer?.(null);
  });

  async function verzend() {
    if (bezig) return;
    setFout("");
    const ontvangers = [...aan, ...cc, ...bcc];
    if (!ontvangers.length) {
      setFout(t("compose.errors.noRecipients"));
      return;
    }
    const ongeldig = ontvangers.filter((a) => !isGeldigAdres(a.adres));
    if (ongeldig.length) {
      setFout(t("address.invalid", { address: ongeldig.map((a) => a.adres).join(", ") }));
      return;
    }
    const inhoud = opstelling();
    if (!inhoud.onderwerp) {
      const keuze = await vraag({
        titel: t("compose.noSubject.title"),
        tekst: t("compose.noSubject.text"),
        knoppen: [
          { waarde: "terug", label: t("compose.noSubject.fillIn") },
          { waarde: "verzend", label: t("compose.noSubject.sendWithout"), soort: "primair" },
        ],
        annuleer: "terug",
      });
      if (keuze !== "verzend") return;
    }
    const woord = vergetenBijlage(inhoud.tekst, inhoud.onderwerp, bijlagen.length);
    if (woord) {
      const keuze = await vraag({
        titel: t("compose.forgotAttachment.title"),
        tekst: <Trans t={t} i18nKey="compose.forgotAttachment.text" values={{ word: woord }} components={{ strong: <strong /> }} />,
        knoppen: [
          { waarde: "toevoegen", label: t("compose.addAttachment") },
          { waarde: "verzend", label: t("compose.forgotAttachment.sendAnyway"), soort: "primair" },
        ],
        annuleer: "terug",
      });
      if (keuze === "toevoegen") bestandskiezer.current?.click();
      if (keuze !== "verzend") return;
    }
    setBezig("verzenden");
    try {
      await backend.verstuur(account.id, inhoud);
      if (begin.bron && begin.bron.modus !== "doorsturen")
        await backend.markeer(begin.bron.accountId, begin.bron.map, [begin.bron.uid], "beantwoord", true).catch(() => {});
      onOnverzonden(false);
      verzonden(inhoud.onderwerp ? t("compose.sentWithSubject", { subject: inhoud.onderwerp }) : t("compose.sent"));
      sluit();
    } catch (e) {
      setFout(foutTekst(e, t("compose.errors.send")));
    } finally {
      setBezig("");
    }
  }

  async function probeerSluiten() {
    if (bezig) return;
    if (!gewijzigd) {
      sluit();
      return;
    }
    const keuze = await vraag({
      titel: t("compose.unsent.title"),
      tekst: t("compose.unsent.text"),
      knoppen: [
        { waarde: "annuleer", label: t("common:cancel") },
        { waarde: "verwerp", label: t("compose.unsent.discard"), soort: "gevaar" },
        { waarde: "bewaar", label: t("compose.unsent.saveDraft"), soort: "primair" },
      ],
      annuleer: "annuleer",
    });
    if (keuze === "verwerp") {
      onOnverzonden(false);
      sluit();
    } else if (keuze === "bewaar" && (await bewaarConcept())) sluit();
  }

  async function voegBestandenToe(bestanden: FileList | File[]) {
    const nieuw: Bijlage[] = [];
    for (const bestand of Array.from(bestanden))
      nieuw.push({ bestandsnaam: bestand.name, inhoudstype: inhoudstype(bestand.name, bestand.type), bytes: new Uint8Array(await bestand.arrayBuffer()) });
    if (!nieuw.length) return;
    const totaal = [...bijlagen, ...nieuw].reduce((som, b) => som + b.bytes.length, 0);
    if (totaal > MAX_BIJLAGEN)
      setFout(t("compose.errors.attachmentsLarge", { size: grootteTekst(totaal), max: "25 MB" }));
    setBijlagen((huidig) => [...huidig, ...nieuw]);
    markeerGewijzigd();
  }

  function opmaak(opdracht: string, waarde?: string) {
    editor.current?.focus();
    document.execCommand(opdracht, false, waarde);
    markeerGewijzigd();
  }

  function startKoppeling() {
    const selectie = getSelection();
    const bereik = selectie?.rangeCount && editor.current?.contains(selectie.anchorNode) ? selectie.getRangeAt(0).cloneRange() : null;
    setKoppeling({ url: "https://", bereik });
  }
  function plaatsKoppeling() {
    if (!koppeling) return;
    const url = veiligeLink(koppeling.url.trim());
    if (!url) {
      setFout(t("compose.errors.linkNotAllowed"));
      return;
    }
    editor.current?.focus();
    const selectie = getSelection();
    if (koppeling.bereik) {
      selectie?.removeAllRanges();
      selectie?.addRange(koppeling.bereik);
    }
    if (!selectie || selectie.isCollapsed) document.execCommand("insertHTML", false, `<a href="${escapeTekst(url).replace(/"/g, "&quot;")}">${escapeTekst(url)}</a>`);
    else document.execCommand("createLink", false, url);
    setKoppeling(null);
    markeerGewijzigd();
  }

  const totaal = bijlagen.reduce((som, b) => som + b.bytes.length, 0);
  return (
    <div className="email-opstelachtergrond">
      <section
        className={`email-opstelvenster ${slepen ? "is-slepen" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={onderwerp ? t("compose.label", { subject: onderwerp }) : t("compose.newMessage")}
        inert={vraagOpen}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && !koppeling) {
            e.preventDefault();
            void probeerSluiten();
          }
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void verzend();
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setSlepen(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setSlepen(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setSlepen(false);
          void voegBestandenToe(e.dataTransfer.files);
        }}
      >
        <header className="email-opstelkop">
          <h2>{onderwerp || t("compose.newMessage")}</h2>
          <div className="email-opstelknoppen">
            <button className="email-knop is-primair" disabled={!!bezig} onClick={() => void verzend()} title={t("compose.sendTitle", { shortcut: "Ctrl+Enter" })}>
              <Send size={15} /> {bezig === "verzenden" ? t("compose.sending") : t("compose.send")}
            </button>
            <button className="email-knop" disabled={!!bezig} onClick={() => void bewaarConcept()} title={t("compose.saveDraftTitle", { shortcut: "Ctrl+S" })}>
              <Save size={15} /> {bezig === "bewaren" ? t("compose.savingDraft") : t("compose.draft")}
            </button>
            <button className="email-knop" onClick={() => bestandskiezer.current?.click()} title={t("compose.addAttachment")}>
              <Paperclip size={15} /> {t("compose.attachment")}
            </button>
            <button className="email-iconknop" onClick={() => void probeerSluiten()} aria-label={t("common:close")} title={t("dialog.closeEsc")}>
              <X size={17} />
            </button>
          </div>
        </header>
        {fout && (
          <div className="email-opstelfout" role="alert">
            <TriangleAlert size={15} />
            <span>{fout}</span>
            <button onClick={() => setFout("")} aria-label={t("compose.dismissError")}>
              <X size={13} />
            </button>
          </div>
        )}
        <div className="email-opstelvelden">
          <div className="email-veldrij">
            <label className="email-veldlabel" htmlFor="email-van">
              {t("compose.from")}
            </label>
            <select id="email-van" value={accountId} onChange={(e) => wisselAccount(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatAdres({ naam: a.volledigeNaam, adres: a.email })}
                  {accounts.length > 1 ? ` (${a.naam})` : ""}
                </option>
              ))}
            </select>
            <span className="email-ccknoppen">
              {!toonCc && (
                <button type="button" onClick={() => setToonCc(true)}>
                  {t("compose.cc")}
                </button>
              )}
              {!toonBcc && (
                <button type="button" onClick={() => setToonBcc(true)}>
                  {t("compose.bcc")}
                </button>
              )}
            </span>
          </div>
          <Adresveld label={t("compose.to")} waarde={aan} wijzig={(a) => (setAan(a), markeerGewijzigd())} backend={backend} accountId={account.id} autoFocus={!begin.aan?.length} />
          {toonCc && <Adresveld label={t("compose.cc")} waarde={cc} wijzig={(a) => (setCc(a), markeerGewijzigd())} backend={backend} accountId={account.id} />}
          {toonBcc && <Adresveld label={t("compose.bcc")} waarde={bcc} wijzig={(a) => (setBcc(a), markeerGewijzigd())} backend={backend} accountId={account.id} />}
          <div className="email-veldrij">
            <label className="email-veldlabel" htmlFor="email-onderwerp">
              {t("compose.subject")}
            </label>
            <input
              id="email-onderwerp"
              value={onderwerp}
              onChange={(e) => {
                setOnderwerp(e.target.value);
                markeerGewijzigd();
              }}
            />
          </div>
        </div>
        <div className="email-opmaakbalk" role="toolbar" aria-label={t("compose.format.label")}>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("bold")} aria-label={t("compose.format.bold")} title={t("compose.format.withShortcut", { action: t("compose.format.bold"), shortcut: "Ctrl+B" })}>
            <Bold size={15} />
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("italic")} aria-label={t("compose.format.italic")} title={t("compose.format.withShortcut", { action: t("compose.format.italic"), shortcut: "Ctrl+I" })}>
            <Italic size={15} />
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("underline")} aria-label={t("compose.format.underline")} title={t("compose.format.withShortcut", { action: t("compose.format.underline"), shortcut: "Ctrl+U" })}>
            <Underline size={15} />
          </button>
          <i />
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("insertUnorderedList")} aria-label={t("compose.format.bullets")} title={t("compose.format.bullets")}>
            <List size={15} />
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("insertOrderedList")} aria-label={t("compose.format.numbering")} title={t("compose.format.numbering")}>
            <ListOrdered size={15} />
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={startKoppeling} aria-label={t("compose.format.link")} title={t("compose.format.insertLink")}>
            <Link size={15} />
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("removeFormat")} aria-label={t("compose.format.clear")} title={t("compose.format.clear")}>
            <RemoveFormatting size={15} />
          </button>
          {koppeling && (
            <span className="email-koppelingsinvoer">
              <input
                autoFocus
                aria-label={t("compose.format.linkAddress")}
                value={koppeling.url}
                onChange={(e) => setKoppeling({ ...koppeling, url: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    plaatsKoppeling();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setKoppeling(null);
                  }
                }}
              />
              <button className="email-knop" onClick={plaatsKoppeling}>
                {t("compose.format.insert")}
              </button>
            </span>
          )}
        </div>
        <div
          ref={editor}
          className="email-editor"
          contentEditable={!bezig}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={t("compose.body")}
          spellCheck
          lang={i18n.language}
          onInput={markeerGewijzigd}
          onPaste={(e) => {
            // Geplakte HTML gaat door de sanitizer; externe afbeeldingen vallen weg.
            const html = e.clipboardData.getData("text/html");
            if (html) {
              e.preventDefault();
              document.execCommand("insertHTML", false, saneerHtml(html, { stijlblokken: false, klassen: false }).html);
            } else if (e.clipboardData.files.length) {
              e.preventDefault();
              void voegBestandenToe(e.clipboardData.files);
            }
            markeerGewijzigd();
          }}
        />
        {bijlagen.length > 0 && (
          <div className="email-opstelbijlagen" aria-label={t("reader.attachments.label")}>
            <span>
              <Paperclip size={13} /> {t("compose.attachmentsSummary", { count: bijlagen.length, size: grootteTekst(totaal) })}
            </span>
            {bijlagen.map((b, i) => (
              <span key={b.bestandsnaam + i} className="email-chip">
                {b.bestandsnaam} <small>{grootteTekst(b.bytes.length)}</small>
                <button
                  aria-label={t("compose.removeAttachment", { name: b.bestandsnaam })}
                  onClick={() => {
                    setBijlagen(bijlagen.filter((_, j) => j !== i));
                    markeerGewijzigd();
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {slepen && <div className="email-sleepvlak">{t("compose.dropToAttach")}</div>}
        <input
          ref={bestandskiezer}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void voegBestandenToe(e.target.files);
            e.target.value = "";
          }}
        />
      </section>
      {vraagElement}
    </div>
  );
}
