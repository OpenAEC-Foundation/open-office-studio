/**
 * PDF — tijdelijk. Waar de webview zelf betrouwbaar PDF toont (Chromium/
 * WebView2, WKWebView, Firefox) gaat de blob in een iframe; op WebKitGTK
 * (Linux-desktop) en onbekende webviews verschijnt een metadatakaart. De
 * definitieve weergave komt via de Rust-route (zie README.md).
 *
 * Het iframe heeft geen `sandbox`: de ingebouwde PDF-viewer van Chromium
 * weigert in een gesandboxt frame. Daarom wordt het alleen gebruikt als de
 * inhoud aantoonbaar een PDF is (magische bytes) en de blob het type
 * application/pdf heeft, zodat er nooit HTML in de app-origin wordt geladen.
 */
import { useMemo, useState } from "react";
import { FileText, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { leesPdfMeta } from "../pdf-meta";
import { herkenWebview } from "../platform";
import { BestandKnoppen, Fout, Kaart, Laden, basisRegels, datumTekst, getal, useBlobUrl, useBytes } from "./gemeenschappelijk";

export function PdfWeergever({ bron, herkenning, acties }: WeergeverProps) {
  const { t } = useTranslation("email");
  const geladen = useBytes(bron);
  const webview = useMemo(() => herkenWebview(), []);
  const ingebouwd = webview.pdfIngebouwd && herkenning.opInhoud;
  const [kaart, zetKaart] = useState(!ingebouwd);
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  const url = useBlobUrl(ingebouwd && !kaart ? bytes : null, "application/pdf");
  const meta = useMemo(() => {
    if (!bytes || !kaart || bytes.length > LIMIETEN.pdfMetaBytes) return null;
    try {
      return leesPdfMeta(bytes);
    } catch {
      return null;
    }
  }, [bytes, kaart]);

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={t("preview.pdf.loadFailed", { message: geladen.melding })} />;

  if (!kaart && url)
    return (
      <div className="vb-pdf">
        <div className="vb-werkbalk" role="toolbar" aria-label="PDF">
          <button type="button" className="vb-knop" onClick={() => zetKaart(true)}>
            <Info size={15} aria-hidden /> {t("preview.pdf.properties")}
          </button>
          <span className="vb-ruimte" />
          <BestandKnoppen bron={bron} acties={acties} />
        </div>
        <iframe className="vb-pdfframe" src={url} title={t("preview.pdf.frameTitle", { name: bron.bestandsnaam })} referrerPolicy="no-referrer" />
      </div>
    );

  const melding = !ingebouwd
    ? webview.soort === "webkitgtk"
      ? t("preview.pdf.linuxUnsupported")
      : t("preview.pdf.cannotPreview")
    : undefined;
  return (
    <Kaart
      icoon={<FileText size={26} />}
      titel={meta?.titel || bron.bestandsnaam}
      ondertitel={meta?.versie ? t("preview.pdf.subtitleVersion", { version: meta.versie }) : t("preview.pdf.subtitle")}
      regels={[
        ...basisRegels(bron, geladen.waarde.length),
        { label: t("preview.pdf.pages"), waarde: meta?.paginas != null ? getal(meta.paginas) : meta ? t("preview.card.unknown") : undefined },
        { label: t("preview.pdf.author"), waarde: meta?.auteur },
        { label: t("preview.pdf.subject"), waarde: meta?.onderwerp },
        {
          label: t("preview.pdf.createdWith"),
          waarde: meta?.maker && meta.producent && meta.maker !== meta.producent ? `${meta.maker} (${meta.producent})` : meta?.maker || meta?.producent,
        },
        { label: t("preview.pdf.created"), waarde: datumTekst(meta?.aangemaakt) },
        { label: t("preview.pdf.modified"), waarde: datumTekst(meta?.gewijzigd) },
        { label: t("preview.pdf.encrypted"), waarde: meta ? (meta.versleuteld ? t("preview.card.yes") : t("preview.card.no")) : undefined },
        { label: t("preview.card.attention"), waarde: meta?.onvolledig ? t("preview.pdf.incomplete") : undefined },
      ]}
      melding={melding}
      knoppen={
        <>
          {ingebouwd && (
            <button type="button" className="vb-knop is-primair" onClick={() => zetKaart(false)}>
              <FileText size={15} aria-hidden /> {t("preview.pdf.showPreview")}
            </button>
          )}
          <BestandKnoppen bron={bron} acties={acties} />
        </>
      }
    />
  );
}
