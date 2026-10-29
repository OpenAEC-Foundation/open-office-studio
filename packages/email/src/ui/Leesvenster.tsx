import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInstellingen } from "../../../../src/instellingen";
import {
  Archive,
  Download,
  ExternalLink,
  FileText,
  Forward,
  ImageOff,
  Mail,
  Paperclip,
  Presentation,
  Reply,
  ReplyAll,
  Sheet,
  Star,
  Trash2,
  Database,
} from "lucide-react";
import type { Account, Bericht, BijlageInfo, MailBackend } from "../contract";
import { formatAdres, formatAdressen, toonAdres } from "../adressen";
import { formatDatum } from "../citaat";
import { externeUrls, frameDocument, saneerHtml, tekstNaarHtml } from "../sanitizer";
import { grootteTekst, kanDirectOpenen, kantoorModule, moduleNaam } from "../kantoor";
import { isDesktop, laadExterneAfbeeldingen } from "../backend";
import { externToegestaan, onthoudExtern } from "./voorkeuren";
import { BijlageVoorbeeld, maakBron, type VoorbeeldBron } from "../voorbeeld";

const MODULE_ICOON = { docx: FileText, xlsx: Sheet, pptx: Presentation, database: Database };

export function Leesvenster({
  backend,
  account,
  bericht,
  bezig,
  fout,
  beantwoord,
  verwijder,
  archiveer,
  ster,
  openBijlage,
  bewaarBijlage,
  link,
  openBytes,
  bewaarBytes,
  openLink,
  voorbeeldOpen,
}: {
  backend: MailBackend;
  account: Account;
  bericht: Bericht | null;
  bezig: boolean;
  fout: string;
  beantwoord: (modus: "antwoord" | "allen" | "doorsturen") => void;
  verwijder: () => void;
  archiveer: () => void;
  ster: () => void;
  openBijlage: (bijlage: BijlageInfo) => void;
  bewaarBijlage: (bijlage: BijlageInfo) => void;
  link: (href: string, tekst: string) => void;
  /** Voor de voorvertoning: bytes openen in een module of opslaan. */
  openBytes: (naam: string, bytes: Uint8Array) => void;
  bewaarBytes: (naam: string, bytes: Uint8Array, type: string) => void;
  /** Externe link uit de voorvertoning (die vraagt zelf al bevestiging). */
  openLink: (url: string) => void;
  /** Meldt of de voorvertoning open is (sneltoetsen van het hoofdscherm uit). */
  voorbeeldOpen?: (open: boolean) => void;
}) {
  const { t } = useTranslation("email");
  const [cidUrls, setCidUrls] = useState<Record<string, string> | null>(null);
  const [versie, setVersie] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  // Voorvertoning: per bericht één bron per bijlage; maakBron cachet de bytes.
  const [voorbeeld, setVoorbeeld] = useState<number | null>(null);
  const bronnen = useMemo(() => {
    if (!bericht) return [] as { info: BijlageInfo; bron: VoorbeeldBron }[];
    return bericht.bijlagen
      .filter((b) => !b.inline || !b.contentId)
      .map((info) => ({ info, bron: maakBron(info, () => backend.bijlage(account.id, bericht.map, bericht.uid, info.index)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bericht?.map, bericht?.uid, backend, account.id]);
  useEffect(() => setVoorbeeld(null), [bericht?.map, bericht?.uid]);
  useEffect(() => voorbeeldOpen?.(voorbeeld !== null), [voorbeeld, voorbeeldOpen]);
  const afzender = bericht?.van[0]?.adres ?? "";
  // Instelling "nooit automatisch" gaat voor het account; zelf toestaan blijft kunnen.
  const { emailExterneInhoud } = useInstellingen();
  const accountExtern = account.externeInhoud && emailExterneInhoud !== "nooit";
  const extern = !!bericht && (accountExtern || externToegestaan(bericht.berichtId ?? `${bericht.map}:${bericht.uid}`, afzender));

  // Desktopapp: de CSP laat geen externe bronnen toe; na toestemming haalt de
  // backend de afbeeldingen op en komen ze als blob-URL in het frame.
  const viaHost = extern && isDesktop() && !!bericht?.html.trim();
  const [hostAfbeeldingen, setHostAfbeeldingen] = useState<{ sleutel: string; urls: Record<string, string> } | null>(null);
  const berichtSleutel = bericht ? `${bericht.map}:${bericht.uid}` : "";
  useEffect(() => {
    setHostAfbeeldingen(null);
    if (!viaHost || !bericht) return;
    let actueel = true;
    let vrijgeven = () => {};
    void laadExterneAfbeeldingen(externeUrls(bericht.html)).then((uit) => {
      vrijgeven = uit.vrijgeven;
      if (actueel) setHostAfbeeldingen({ sleutel: berichtSleutel, urls: uit.urls });
      else uit.vrijgeven();
    });
    return () => {
      actueel = false;
      setTimeout(() => vrijgeven(), 1000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaHost, berichtSleutel, versie]);

  // Inline afbeeldingen (cid:) uit bijlagen ophalen als blob-URL's.
  useEffect(() => {
    setCidUrls(null);
    if (!bericht) return;
    const inline = bericht.bijlagen.filter((b) => b.contentId && b.inhoudstype.startsWith("image/") && !/svg/i.test(b.inhoudstype));
    if (!inline.length || !bericht.html) {
      setCidUrls({});
      return;
    }
    let actueel = true;
    const urls: string[] = [];
    void Promise.all(
      inline.map(async (b) => {
        try {
          const bytes = await backend.bijlage(account.id, bericht.map, bericht.uid, b.index);
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: b.inhoudstype }));
          urls.push(url);
          return [b.contentId!.replace(/^<|>$/g, ""), url] as const;
        } catch {
          return null;
        }
      }),
    ).then((paren) => {
      if (actueel) setCidUrls(Object.fromEntries(paren.filter((p): p is readonly [string, string] => p !== null)));
    });
    return () => {
      actueel = false;
      setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 1000);
    };
  }, [bericht, backend, account.id]);

  const inhoud = useMemo(() => {
    if (!bericht || !cidUrls) return null;
    if (bericht.html.trim()) {
      if (viaHost) {
        if (hostAfbeeldingen?.sleutel !== berichtSleutel) return null;
        const urls = hostAfbeeldingen.urls;
        const uit = saneerHtml(bericht.html, { externeInhoud: true, extern: (u) => urls[u], cid: (id) => cidUrls[id] });
        return { doc: frameDocument(uit.html), geblokkeerd: 0, mislukt: uit.geblokkeerd };
      }
      const uit = saneerHtml(bericht.html, { externeInhoud: extern, cid: (id) => cidUrls[id] });
      return { doc: frameDocument(uit.html, { externeInhoud: extern }), geblokkeerd: uit.geblokkeerd, mislukt: 0 };
    }
    return { doc: frameDocument(tekstNaarHtml(bericht.tekst)), geblokkeerd: 0, mislukt: 0 };
    // `versie` verandert na "Externe inhoud tonen".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bericht, cidUrls, extern, versie, viaHost, hostAfbeeldingen, berichtSleutel]);

  function koppelFrame() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    // Links nooit in het frame openen: de host toont eerst het echte doeladres.
    const klik = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href");
      if (href && (e.type === "click" || (e as MouseEvent).button === 1)) link(href, a.textContent ?? "");
    };
    doc.addEventListener("click", klik);
    doc.addEventListener("auxclick", klik);
    doc.addEventListener("submit", (e) => e.preventDefault());
    // Sneltoetsen werken ook als het frame de focus heeft.
    doc.addEventListener("keydown", (e) => {
      const kopie = new KeyboardEvent("keydown", e);
      if (!window.dispatchEvent(kopie)) e.preventDefault();
    });
  }

  if (!bericht)
    return (
      <div className="email-leeg">
        {bezig ? <p>{t("reader.loadingMessage")}</p> : fout ? <p role="alert">{fout}</p> : (
          <>
            <Mail size={34} strokeWidth={1.2} />
            <p>{t("reader.chooseMessage")}</p>
          </>
        )}
      </div>
    );

  const bijlagen = bericht.bijlagen.filter((b) => !b.inline || !b.contentId);
  return (
    <article className="email-lezen" aria-label={t("reader.label", { subject: bericht.onderwerp })}>
      <header className="email-leeskop">
        <div className="email-leesacties">
          <button className="email-knop" onClick={() => beantwoord("antwoord")} title={t("reader.replyTitle", { shortcut: "Ctrl+R" })}>
            <Reply size={15} /> {t("reader.reply")}
          </button>
          <button className="email-knop" onClick={() => beantwoord("allen")} title={t("reader.replyAllTitle", { shortcut: "Ctrl+Shift+R" })}>
            <ReplyAll size={15} /> {t("reader.replyAll")}
          </button>
          <button className="email-knop" onClick={() => beantwoord("doorsturen")} title={t("reader.forwardTitle", { shortcut: "Ctrl+L" })}>
            <Forward size={15} /> {t("reader.forward")}
          </button>
          <button className="email-iconknop" onClick={archiveer} aria-label={t("reader.archive")} title={t("reader.archiveTitle", { shortcut: "A" })}>
            <Archive size={16} />
          </button>
          <button className="email-iconknop" onClick={verwijder} aria-label={t("reader.delete")} title={t("reader.deleteTitle", { shortcut: "Del" })}>
            <Trash2 size={16} />
          </button>
          <button
            className={`email-iconknop ${bericht.gemarkeerd ? "is-ster" : ""}`}
            onClick={ster}
            aria-label={bericht.gemarkeerd ? t("list.unstar") : t("list.star")}
            aria-pressed={bericht.gemarkeerd}
            title={t("reader.starTitle", { shortcut: "S" })}
          >
            <Star size={16} fill={bericht.gemarkeerd ? "currentColor" : "none"} />
          </button>
        </div>
        <h1>{bericht.onderwerp || t("list.noSubject")}</h1>
        <dl>
          <dt>{t("reader.from")}</dt>
          <dd>
            <strong>{toonAdres(bericht.van[0])}</strong> {bericht.van[0]?.naam && <span>&lt;{bericht.van[0].adres}&gt;</span>}
          </dd>
          <dt>{t("reader.to")}</dt>
          <dd>{formatAdressen(bericht.aan) || t("reader.none")}</dd>
          {bericht.cc.length > 0 && (
            <>
              <dt>{t("reader.cc")}</dt>
              <dd>{formatAdressen(bericht.cc)}</dd>
            </>
          )}
          {bericht.antwoordAan.length > 0 && formatAdressen(bericht.antwoordAan) !== formatAdressen(bericht.van) && (
            <>
              <dt>{t("reader.replyTo")}</dt>
              <dd>{bericht.antwoordAan.map(formatAdres).join(", ")}</dd>
            </>
          )}
          <dt>{t("reader.date")}</dt>
          <dd>{formatDatum(bericht.datum)}</dd>
        </dl>
      </header>
      {inhoud && inhoud.geblokkeerd > 0 && !extern && (
        <div className="email-externbalk" role="note">
          <ImageOff size={15} />
          <span>
            {t("reader.external.blocked", { count: inhoud.geblokkeerd })}{" "}
            {isDesktop() ? t("reader.external.desktopHint") : t("reader.external.demoHint")}
          </span>
          <button
            className="email-knop"
            onClick={() => {
              onthoudExtern({ bericht: bericht.berichtId ?? `${bericht.map}:${bericht.uid}` });
              setVersie(versie + 1);
            }}
          >
            {t("reader.external.show")}
          </button>
          {afzender && (
            <button
              className="email-knop"
              onClick={() => {
                onthoudExtern({ afzender });
                setVersie(versie + 1);
              }}
            >
              {t("reader.external.alwaysFrom", { sender: afzender })}
            </button>
          )}
        </div>
      )}
      {inhoud && inhoud.mislukt > 0 && (
        <div className="email-externbalk" role="status">
          <ImageOff size={15} />
          <span>{t("reader.external.failed", { count: inhoud.mislukt })}</span>
        </div>
      )}
      {bijlagen.length > 0 && (
        <ul className="email-bijlagen" aria-label={t("reader.attachments.label")}>
          {bijlagen.map((b) => {
            const module = kantoorModule(b.bestandsnaam);
            const Icoon = module ? MODULE_ICOON[module] : Paperclip;
            const direct = module && (kanDirectOpenen(b.bestandsnaam) || isDesktop());
            return (
              <li key={b.index}>
                <button
                  className="email-bijlagevoorbeeld"
                  title={direct ? t("reader.attachments.previewOrOpen", { module: moduleNaam(module!) }) : t("reader.attachments.preview")}
                  onClick={(e) => {
                    if (e.detail <= 1) setVoorbeeld(bronnen.findIndex((x) => x.info.index === b.index));
                  }}
                  onDoubleClick={() => {
                    if (!direct) return;
                    setVoorbeeld(null);
                    openBijlage(b);
                  }}
                >
                  <Icoon size={18} strokeWidth={1.6} />
                  <span className="email-bijlagenaam">
                    <strong>{b.bestandsnaam}</strong>
                    <small>{grootteTekst(b.grootte)}</small>
                  </span>
                </button>
                {direct && (
                  <button className="email-knop is-primair" onClick={() => openBijlage(b)} title={t("reader.attachments.openCopyTitle", { module: moduleNaam(module!) })}>
                    <ExternalLink size={14} /> {t("reader.attachments.openIn", { module: moduleNaam(module!) })}
                  </button>
                )}
                <button className="email-knop" onClick={() => bewaarBijlage(b)} title={t("reader.attachments.saveTitle")}>
                  <Download size={14} /> {t("common:save")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {voorbeeld !== null && bronnen[voorbeeld] && (
        <BijlageVoorbeeld
          bron={bronnen[voorbeeld].bron}
          bijlagen={bronnen.map((x) => x.bron)}
          sluit={() => setVoorbeeld(null)}
          opslaan={async (bron) => bewaarBytes(bron.bestandsnaam, await bron.bytes(), bron.inhoudstype)}
          openInModule={(_soort, naam, bytes) => {
            setVoorbeeld(null);
            openBytes(naam, bytes);
          }}
          openLink={openLink}
        />
      )}
      {inhoud ? (
        <iframe
          key={`${bericht.map}:${bericht.uid}:${extern}:${versie}`}
          ref={frame}
          className="email-berichtframe"
          title={t("reader.content")}
          // Geen allow-scripts: de inhoud kan nooit script uitvoeren. allow-same-origin
          // is nodig om klikken op links in de host af te handelen.
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          srcDoc={inhoud.doc}
          onLoad={koppelFrame}
        />
      ) : (
        <div className="email-leeg">
          <p>{t("reader.loadingContent")}</p>
        </div>
      )}
    </article>
  );
}
