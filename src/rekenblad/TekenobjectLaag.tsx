import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  XlsxEditorApi,
  XlsxPluginGeometry,
} from "@betteroffice/xlsx-react";
import { alleenLezen } from "../lint/rekenblad-opdrachten";
import { tekenobjecten } from "./tekenAnkers";
import type { ObjectPlek, Tekenobject } from "./tekenobjecten";
import { openObjectVenster } from "./objectBewerking";
import "./tekenobjecten.css";

/** De engine tekent grafieken; deze laag tekent de andere DrawingML-objecten. */
export function TekenobjectLaag({
  api,
  blad,
  geometry,
}: {
  api: XlsxEditorApi;
  blad: number;
  geometry: XlsxPluginGeometry;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [, verversScroll] = useState(0);
  useEffect(() => {
    const scroll = element.current?.closest<HTMLElement>(
      '[data-testid="xlsx-scroll"]',
    );
    const ververs = () => verversScroll((n) => n + 1);
    scroll?.addEventListener("scroll", ververs, { passive: true });
    return () => scroll?.removeEventListener("scroll", ververs);
  }, []);
  return (
    <>
      <span ref={element} hidden aria-hidden="true" />
      {tekenobjecten(api.handle, blad).map((o) => (
        <ObjectOpRaster
          key={`${o.tekening}:${o.id}`}
          api={api}
          object={o}
          geometry={geometry}
        />
      ))}
    </>
  );
}

function ObjectOpRaster({
  api,
  object: o,
  geometry: g,
}: {
  api: XlsxEditorApi;
  object: Tekenobject;
  geometry: XlsxPluginGeometry;
}) {
  const { t } = useTranslation("spreadsheet");
  const element = useRef<HTMLDivElement>(null);
  const oorsprong = useRef<{
    x: number;
    y: number;
    zoom: number;
    blad: number;
  } | null>(null);
  const [preview, setPreview] = useState<{
    dx: number;
    dy: number;
    w: number;
    h: number;
  } | null>(null);
  const url = useMemo(
    () =>
      o.media && o.mime
        ? URL.createObjectURL(
            new Blob([new Uint8Array(o.media)], { type: o.mime }),
          )
        : null,
    [o.media, o.mime],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const zoom = g.layout.zoom,
    h = api.handle,
    start = h.cellPosition(o.blad, o.plek.row, o.plek.col);
  const direct = g.getCellRect({
    sheetId: g.layout.sheetId,
    row: o.plek.row,
    col: o.plek.col,
  });
  const volledig = h.cellRect(o.blad, o.plek.row, o.plek.col);
  const scroll = element.current?.closest<HTMLElement>(
    '[data-testid="xlsx-scroll"]',
  );
  // De viewport bevat de ongeschaalde oorsprong. Het verschil met de werkelijk
  // getekende referentiecel neemt rij-/kolomkoppen en bevroren deelvensters mee.
  let basis = direct
    ? { x: direct.x - start.x * zoom, y: direct.y - start.y * zoom }
    : null;
  if (
    !basis ||
    (direct &&
      (direct.width < volledig.w * zoom - 0.1 ||
        direct.height < volledig.h * zoom - 0.1))
  ) {
    const rect = scroll?.getBoundingClientRect();
    // Een klein blad kan eindigen vóór het midden van de viewport. Probeer
    // daarom ook de eerste zichtbare cellen naast de rij-/kolomkoppen.
    const punten = rect
      ? [
          [rect.width / 2, rect.height / 2],
          [70, 45],
          [70, rect.height / 2],
          [rect.width / 2, 45],
        ]
      : [];
    const ref =
      rect &&
      punten
        .map(([x, y]) => g.getPositionAtPoint?.(rect.left + x, rect.top + y))
        .find((p) => p && g.getCellRect(p));
    const r = ref && g.getCellRect(ref);
    if (ref && r) {
      const p = h.cellPosition(o.blad, ref.row, ref.col),
        info = h.sheetInfo();
      basis = {
        x: o.plek.col < info.frozenCols && basis ? basis.x : r.x - p.x * zoom,
        y: o.plek.row < info.frozenRows && basis ? basis.y : r.y - p.y * zoom,
      };
    }
  }
  // De legacy-host geeft niet op ieder scrollframe een nieuwe plugin-geometrie.
  // Bewaar daarom de gemeten rasteroorsprong en volg de echte scrollcontainer.
  // Dit houdt ook een deels zichtbaar object vast als zijn ankercel al uit beeld is.
  const info = h.sheetInfo();
  if (basis) {
    oorsprong.current = {
      x:
        basis.x +
        (o.plek.col < info.frozenCols ? 0 : g.layout.viewport.x * zoom),
      y:
        basis.y +
        (o.plek.row < info.frozenRows ? 0 : g.layout.viewport.y * zoom),
      zoom,
      blad: o.blad,
    };
  }
  if (
    oorsprong.current?.zoom === zoom &&
    oorsprong.current.blad === o.blad &&
    scroll
  ) {
    basis = {
      x:
        oorsprong.current.x -
        (o.plek.col < info.frozenCols ? 0 : scroll.scrollLeft),
      y:
        oorsprong.current.y -
        (o.plek.row < info.frozenRows ? 0 : scroll.scrollTop),
    };
  }
  // Een onzichtbaar anker krijgt toch een DOM-knoop om na scrollen te kunnen meten.
  const x = (basis?.x ?? 0) + (start.x + o.plek.x) * zoom,
    y = (basis?.y ?? 0) + (start.y + o.plek.y) * zoom;
  const eind = o.einde && h.cellPosition(o.blad, o.einde.row, o.einde.col);
  const breedte = eind
    ? Math.max(1, eind.x + o.einde!.x - start.x - o.plek.x)
    : o.plek.breedte;
  const hoogte = eind
    ? Math.max(1, eind.y + o.einde!.y - start.y - o.plek.y)
    : o.plek.hoogte;
  const uit = o.beveiligd || alleenLezen(api);
  const openen = () =>
    openObjectVenster(h, { ...o, plek: { ...o.plek, breedte, hoogte } });
  function begin(e: ReactPointerEvent<HTMLElement>, schalen = false) {
    e.stopPropagation();
    if (e.button !== 0 || uit) return;
    e.preventDefault();
    element.current?.focus();
    const doel = e.currentTarget,
      versie = h.version(),
      sx = e.clientX,
      sy = e.clientY;
    doel.setPointerCapture(e.pointerId);
    let dx = 0,
      dy = 0,
      geannuleerd = false;
    const beweeg = (ev: PointerEvent) => {
      dx = (ev.clientX - sx) / zoom;
      dy = (ev.clientY - sy) / zoom;
      setPreview({
        dx: schalen ? 0 : dx,
        dy: schalen ? 0 : dy,
        w: schalen ? Math.max(1, breedte + dx) : breedte,
        h: schalen ? Math.max(1, hoogte + dy) : hoogte,
      });
    };
    const los = (ev: PointerEvent) => {
      geannuleerd = ev.type === "pointercancel";
      doel.removeEventListener("pointermove", beweeg);
      doel.removeEventListener("pointerup", los);
      doel.removeEventListener("pointercancel", los);
      setPreview(null);
      if (geannuleerd || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return;
      const plek = {
        ...o.plek,
        breedte: schalen ? Math.max(1, breedte + dx) : breedte,
        hoogte: schalen ? Math.max(1, hoogte + dy) : hoogte,
      };
      if (!schalen) {
        const px = Math.max(0, start.x + o.plek.x + dx),
          py = Math.max(0, start.y + o.plek.y + dy);
        const zoek = (
          maximum: number,
          waarde: number,
          positie: (n: number) => number,
        ) => {
          let laag = 0,
            hoog = maximum;
          while (laag < hoog) {
            const midden = Math.ceil((laag + hoog) / 2);
            if (positie(midden) <= waarde) laag = midden;
            else hoog = midden - 1;
          }
          return laag;
        };
        plek.col = zoek(16383, px, (n) => h.cellPosition(o.blad, 0, n).x);
        plek.row = zoek(1048575, py, (n) => h.cellPosition(o.blad, n, 0).y);
        const p = h.cellPosition(o.blad, plek.row, plek.col);
        plek.x = px - p.x;
        plek.y = py - p.y;
      }
      // Pakketbewerkingen herladen de engine. Laat de gebruiker de voorgestelde
      // positie en het gevolg voor Undo zien vóór deze wordt opgeslagen.
      openObjectVenster(h, { ...o, plek }, versie);
    };
    doel.addEventListener("pointermove", beweeg);
    doel.addEventListener("pointerup", los);
    doel.addEventListener("pointercancel", los);
  }
  return (
    <div
      ref={element}
      className={`rekenblad-tekenobject${o.soort === "onbekend" || (o.soort === "afbeelding" && !url) ? " is-onbekend" : ""}`}
      data-object-id={o.id}
      role="button"
      tabIndex={0}
      aria-label={`${t(`objects.${o.soort === "afbeelding" ? "image" : "shape"}`)}: ${o.naam}`}
      aria-disabled={uit}
      title={o.naam}
      style={{
        visibility: basis ? undefined : "hidden",
        left: x + (preview?.dx ?? 0) * zoom,
        top: y + (preview?.dy ?? 0) * zoom,
        width: (preview?.w ?? breedte) * zoom,
        height: (preview?.h ?? hoogte) * zoom,
        transform: o.rotatie ? `rotate(${o.rotatie}deg)` : undefined,
      }}
      onPointerDown={begin}
      onDoubleClick={(e) => {
        e.stopPropagation();
        openen();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (
          e.key === "Enter" ||
          e.key === " " ||
          e.key === "Delete" ||
          e.key === "Backspace"
        ) {
          e.preventDefault();
          openen();
        }
      }}
    >
      {url ? (
        <Afbeelding object={o} url={url} />
      ) : o.soort === "vorm" ? (
        <Vorm object={o} zoom={zoom} />
      ) : (
        <span>
          {o.naam}
          <br />
          {t("objects.previewLimited")}
        </span>
      )}
      {!uit && (
        <button
          className="rekenblad-objectgreep"
          aria-label={t("objects.resize")}
          onPointerDown={(e) => begin(e, true)}
          tabIndex={-1}
        />
      )}
    </div>
  );
}
function Vorm({ object: o, zoom }: { object: Tekenobject; zoom: number }) {
  const pr = {
    fill: o.vulling,
    stroke: o.lijn,
    strokeWidth: o.lijndikte,
    vectorEffect: "non-scaling-stroke",
  };
  return (
    <>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          transform: `scale(${o.spiegelX ? -1 : 1},${o.spiegelY ? -1 : 1})`,
        }}
      >
        {o.vorm === "ellipse" ? (
          <ellipse cx="50" cy="50" rx="49" ry="49" {...pr} />
        ) : o.vorm === "triangle" ? (
          <polygon points="50,1 99,99 1,99" {...pr} />
        ) : o.vorm === "diamond" ? (
          <polygon points="50,1 99,50 50,99 1,50" {...pr} />
        ) : o.vorm === "line" ? (
          <line x1="0" y1="0" x2="100" y2="100" {...pr} />
        ) : (
          <rect
            x="1"
            y="1"
            width="98"
            height="98"
            rx={o.vorm === "roundRect" ? 12 : 0}
            {...pr}
          />
        )}
      </svg>
      <div
        className="rekenblad-vormtekst"
        style={{ justifyContent: o.verticaal, padding: 8 * zoom }}
      >
        {o.tekstOpmaak.map((p, i) => (
          <div key={i} style={{ textAlign: p.uitlijning }}>
            {p.stukken.map((s, n) => (
              <span
                key={n}
                style={{
                  fontSize: s.grootte * zoom,
                  fontFamily: s.lettertype,
                  fontWeight: s.vet ? "bold" : "normal",
                  fontStyle: s.cursief ? "italic" : "normal",
                  color: s.kleur,
                  textDecoration: s.onderstreept ? "underline" : undefined,
                }}
              >
                {s.tekst}
              </span>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
function Afbeelding({ object: o, url }: { object: Tekenobject; url: string }) {
  const c = o.uitsnede ?? { links: 0, rechts: 0, boven: 0, onder: 0 },
    w = Math.max(0.001, 1 - c.links - c.rechts),
    h = Math.max(0.001, 1 - c.boven - c.onder);
  return (
    <div
      className="rekenblad-objectbeeld"
      style={{
        transform: `scale(${o.spiegelX ? -1 : 1},${o.spiegelY ? -1 : 1})`,
      }}
    >
      <img
        alt={o.naam}
        src={url}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{
          width: `${100 / w}%`,
          height: `${100 / h}%`,
          left: `${(-100 * c.links) / w}%`,
          top: `${(-100 * c.boven) / h}%`,
        }}
      />
    </div>
  );
}
