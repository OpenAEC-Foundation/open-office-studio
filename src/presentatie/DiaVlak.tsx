/**
 * Een dia passend in zijn vak, met inkt (pen, markeerstift), laserstip en
 * zwart/wit scherm erover. Werkt in elk venster: het beeld komt van
 * `teken`, dat op een canvas van dit vak tekent.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { raaktStreep, type Gereedschap, type Scherm, type Streep } from "./voorstelling-logica";

export interface Rechthoek {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
}

/** Het grootste vak met deze verhouding dat in `b`×`h` past, gecentreerd. */
export function pasIn(b: number, h: number, verhouding: number): Rechthoek {
  let breedte = b;
  let hoogte = b / verhouding;
  if (hoogte > h) {
    hoogte = h;
    breedte = h * verhouding;
  }
  return { x: (b - breedte) / 2, y: (h - hoogte) / 2, breedte, hoogte };
}

/** Grootte van een element, ook in een ander venster (eigen ResizeObserver). */
function useMaat(ref: RefObject<HTMLElement | null>) {
  const [maat, setMaat] = useState({ b: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const venster = (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
    const meet = () => setMaat({ b: el.clientWidth, h: el.clientHeight });
    meet();
    const Waarnemer = venster.ResizeObserver ?? ResizeObserver;
    const w = new Waarnemer(meet);
    w.observe(el);
    return () => w.disconnect();
  }, [ref]);
  return maat;
}

export interface DiaVlakProps {
  verhouding: number;
  /** Tekent de dia op `canvas` van `breedte` beeldpunten; `sleutel` verandert als het beeld verandert. */
  teken: ((canvas: HTMLCanvasElement, breedte: number) => Promise<void> | void) | null;
  sleutel: string;
  scherm?: Scherm;
  einde?: string | null;
  strepen?: readonly Streep[];
  laser?: { x: number; y: number } | null;
  gereedschap?: Gereedschap;
  /** Inkt bewerken: nieuwe lijst strepen voor deze dia. */
  onStrepen?: (strepen: Streep[]) => void;
  onLaser?: (punt: { x: number; y: number } | null) => void;
  /** Klik zonder slepen met de aanwijzer. */
  onKlik?: () => void;
  className?: string;
  label?: string;
}

export function DiaVlak({
  verhouding,
  teken,
  sleutel,
  scherm = "normaal",
  einde = null,
  strepen = [],
  laser = null,
  gereedschap = "aanwijzer",
  onStrepen,
  onLaser,
  onKlik,
  className,
  label,
}: DiaVlakProps) {
  const vak = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { b, h } = useMaat(vak);
  const r = pasIn(b, h, verhouding);
  const venster = vak.current?.ownerDocument.defaultView ?? window;
  const dpr = Math.min(3, venster.devicePixelRatio || 1);
  const pixels = Math.round(r.breedte * dpr);

  useEffect(() => {
    if (!teken || !canvas.current || pixels < 2) return;
    let actief = true;
    void Promise.resolve(teken(canvas.current, pixels)).catch(() => {
      if (actief) {
        // Een dia die niet getekend kan worden blijft leeg.
      }
    });
    return () => {
      actief = false;
    };
  }, [teken, sleutel, pixels]);

  // Inkt: de lopende streep apart, zodat tekenen niet de hele lijst kopieert.
  const [bezig, setBezig] = useState<Streep | null>(null);
  const omlaagPunt = useRef<{ x: number; y: number } | null>(null);
  const punt = (e: ReactPointerEvent) => {
    const el = canvas.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - el.left) / Math.max(1, el.width))),
      y: Math.max(0, Math.min(1, (e.clientY - el.top) / Math.max(1, el.height))),
    };
  };
  const omlaag = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !canvas.current) return;
    const p = punt(e);
    omlaagPunt.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (gereedschap === "pen" || gereedschap === "markeerstift") setBezig({ soort: gereedschap, punten: [p.x, p.y] });
    else if (gereedschap === "gum") onStrepen?.(strepen.filter((s) => !raaktStreep(s, p.x, p.y)));
  };
  const beweeg = (e: ReactPointerEvent) => {
    if (!canvas.current) return;
    const p = punt(e);
    if (gereedschap === "laser") onLaser?.(p);
    else if (bezig) setBezig({ ...bezig, punten: [...bezig.punten, p.x, p.y] });
    else if (gereedschap === "gum" && e.buttons & 1) onStrepen?.(strepen.filter((s) => !raaktStreep(s, p.x, p.y)));
  };
  const omhoog = (e: ReactPointerEvent) => {
    const start = omlaagPunt.current;
    omlaagPunt.current = null;
    if (bezig) {
      if (bezig.punten.length >= 2) onStrepen?.([...strepen, bezig]);
      setBezig(null);
      return;
    }
    if (gereedschap === "aanwijzer" && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) onKlik?.();
  };

  const lijnen = bezig ? [...strepen, bezig] : strepen;
  const cursor =
    gereedschap === "pen" || gereedschap === "markeerstift"
      ? "crosshair"
      : gereedschap === "laser"
        ? "none"
        : gereedschap === "gum"
          ? "cell"
          : "default";
  return (
    <div ref={vak} className={`diavlak ${className ?? ""}`} role={label ? "img" : undefined} aria-label={label}>
      <div
        className="diavlak-dia"
        style={{ left: r.x, top: r.y, width: r.breedte, height: r.hoogte, cursor }}
        onPointerDown={omlaag}
        onPointerMove={beweeg}
        onPointerUp={omhoog}
        onPointerLeave={() => gereedschap === "laser" && onLaser?.(null)}
      >
        <canvas ref={canvas} style={{ width: "100%", height: "100%" }} />
        <svg className="diavlak-inkt" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {lijnen.map((s, i) => (
            <polyline
              key={i}
              points={s.punten.join(" ")}
              fill="none"
              stroke={s.soort === "pen" ? "#e11d48" : "rgba(250, 204, 21, 0.45)"}
              strokeWidth={Math.max(1.5, r.breedte * (s.soort === "pen" ? 0.0035 : 0.018))}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {laser && (
          <span
            className="diavlak-laser"
            style={{ left: `${laser.x * 100}%`, top: `${laser.y * 100}%`, width: Math.max(10, r.breedte * 0.012), height: Math.max(10, r.breedte * 0.012) }}
          />
        )}
        {scherm !== "normaal" && <div className={`diavlak-scherm diavlak-${scherm}`} />}
        {einde && (
          <div className="diavlak-scherm diavlak-zwart diavlak-einde">
            <span>{einde}</span>
          </div>
        )}
      </div>
    </div>
  );
}
