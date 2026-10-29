/**
 * Afbeeldingen (JPEG, PNG, GIF, WebP, BMP, SVG). SVG alleen als <img> met een
 * blob-URL van het type image/svg+xml: scripts en externe bronnen worden dan
 * door de browser genegeerd en er komt niets in de DOM.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileImage, RotateCw, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../../../../../src/i18n/opmaak";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { MIME_AFBEELDING } from "../herkenning";
import { browserVolgtExif, controleerAfbeelding, exifOrientatie, orientatieTransform } from "../afbeelding-meta";
import { BestandKnoppen, Fout, Kaart, Laden, basisRegels, useBlobUrl, useBytes } from "./gemeenschappelijk";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

export function AfbeeldingWeergever({ bron, herkenning, acties, registreerToetsen }: WeergeverProps) {
  const { t, i18n } = useTranslation("email");
  const opmaak = useOpmaak();
  const geladen = useBytes(bron);
  const type = herkenning.afbeelding ?? "png";
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  // De taal hoort bij de afhankelijkheden: de melding van de controle is vertaald.
  const taal = i18n.language;
  const controle = useMemo(
    () => (bytes ? controleerAfbeelding(bytes, type, LIMIETEN) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bytes, type, taal],
  );
  const url = useBlobUrl(controle?.ok ? bytes : null, MIME_AFBEELDING[type]);
  const exif = useMemo(() => (bytes && type === "jpeg" && !browserVolgtExif() ? exifOrientatie(bytes) : 1), [bytes, type]);

  const [zoom, zetZoom] = useState<number | "passend">("passend");
  const [draai, zetDraai] = useState(0);
  const [natuurlijk, zetNatuurlijk] = useState<{ b: number; h: number } | null>(null);
  const [vlak, zetVlak] = useState({ b: 0, h: 0 });
  const [kapot, zetKapot] = useState(false);
  const vlakRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    zetZoom("passend");
    zetDraai(0);
    zetNatuurlijk(null);
    zetKapot(false);
  }, [bron]);

  useLayoutEffect(() => {
    const el = vlakRef.current;
    if (!el) return;
    const meet = () => zetVlak({ b: el.clientWidth, h: el.clientHeight });
    meet();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => ro.disconnect();
  }, [url]);

  const ex = orientatieTransform(exif);
  const gewisseld = ex.wisselt !== (draai % 180 !== 0);
  const nb = natuurlijk?.b ?? 0;
  const nh = natuurlijk?.h ?? 0;
  const eb = gewisseld ? nh : nb;
  const eh = gewisseld ? nb : nh;
  const marge = 24;
  const passend = eb && eh ? Math.min((vlak.b - marge) / eb, (vlak.h - marge) / eh, 1) : 1;
  const schaal = zoom === "passend" ? Math.max(passend, MIN_ZOOM) : zoom;

  const zoomIn = () => zetZoom((z) => Math.min(MAX_ZOOM, (z === "passend" ? passend : z) * 1.25));
  const zoomUit = () => zetZoom((z) => Math.max(MIN_ZOOM, (z === "passend" ? passend : z) / 1.25));
  const draaiRechts = () => zetDraai((d) => (d + 90) % 360);

  // Laatste versie van de handlers voor het toetsenbord.
  const toetsen = useRef({ zoomIn, zoomUit, draaiRechts });
  toetsen.current = { zoomIn, zoomUit, draaiRechts };
  useEffect(
    () =>
      registreerToetsen((e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.key === "+" || e.key === "=") toetsen.current.zoomIn();
        else if (e.key === "-" || e.key === "_") toetsen.current.zoomUit();
        else if (e.key === "0") zetZoom("passend");
        else if (e.key === "r" || e.key === "R") toetsen.current.draaiRechts();
        else return false;
        return true;
      }),
    [registreerToetsen],
  );

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={t("preview.image.loadFailed", { message: geladen.melding })} />;
  if (controle && !controle.ok)
    return (
      <Kaart
        icoon={<FileImage size={26} />}
        titel={bron.bestandsnaam}
        ondertitel={t("preview.image.subtitle")}
        regels={basisRegels(bron, geladen.waarde.length)}
        melding={controle.melding}
        knoppen={<BestandKnoppen bron={bron} acties={acties} />}
      />
    );
  if (kapot)
    return (
      <Kaart
        icoon={<FileImage size={26} />}
        titel={bron.bestandsnaam}
        ondertitel={t("preview.image.subtitle")}
        regels={basisRegels(bron, geladen.waarde.length)}
        melding={t("preview.image.cannotDisplay")}
        knoppen={<BestandKnoppen bron={bron} acties={acties} />}
      />
    );

  const transform = `translate(-50%, -50%) rotate(${draai}deg) ${ex.transform}`.trim();
  return (
    <div className="vb-afbeelding">
      <div className="vb-werkbalk" role="toolbar" aria-label={t("preview.image.toolbar")}>
        <button type="button" className="vb-iconknop" onClick={zoomUit} title={t("preview.image.zoomOutTitle")} aria-label={t("preview.image.zoomOut")}>
          <ZoomOut size={16} />
        </button>
        <span className="vb-zoomwaarde" aria-live="polite">
          {opmaak.procent(schaal, { maximumFractionDigits: 0, useGrouping: false })}
        </span>
        <button type="button" className="vb-iconknop" onClick={zoomIn} title={t("preview.image.zoomInTitle")} aria-label={t("preview.image.zoomIn")}>
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          className="vb-iconknop"
          onClick={() => zetZoom("passend")}
          aria-pressed={zoom === "passend"}
          title={t("preview.image.fitTitle")}
          aria-label={t("preview.image.fit")}
        >
          <Scan size={16} />
        </button>
        <button type="button" className="vb-iconknop" onClick={() => zetZoom(1)} title={t("preview.image.actualSizeTitle")} aria-label={t("preview.image.actualSize")}>
          1:1
        </button>
        <button type="button" className="vb-iconknop" onClick={draaiRechts} title={t("preview.image.rotateTitle")} aria-label={t("preview.image.rotate")}>
          <RotateCw size={16} />
        </button>
        {natuurlijk && (
          <span className="vb-werkbalkinfo">
            {eb} × {eh} px
          </span>
        )}
      </div>
      <div className="vb-afbeeldingvlak" ref={vlakRef} tabIndex={0} aria-label={t("preview.image.area")} dir="ltr">
        <div
          className="vb-afbeeldingdoek"
          style={{ width: Math.max(eb * schaal, vlak.b - 2), height: Math.max(eh * schaal, vlak.h - 2) }}
        >
          {url && (
            <img
              src={url}
              alt={bron.bestandsnaam}
              draggable={false}
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                const img = e.currentTarget;
                zetNatuurlijk({ b: img.naturalWidth || 1024, h: img.naturalHeight || 768 });
              }}
              onError={() => zetKapot(true)}
              style={{
                width: nb * schaal || undefined,
                height: nh * schaal || undefined,
                transform,
                visibility: natuurlijk ? "visible" : "hidden",
                imageRendering: schaal >= 3 ? "pixelated" : undefined,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
