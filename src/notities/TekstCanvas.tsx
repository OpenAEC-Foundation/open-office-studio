import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { GripHorizontal, MoveDiagonal2, Plus, X } from "lucide-react";
import { begrensVak, type Tekstvak, type VakPlaats } from "./model";

type Gebaar = {
  pointer: number;
  x: number;
  y: number;
  scrollX: number;
  scrollY: number;
  begin: VakPlaats;
  laatste: VakPlaats | null;
  soort: "slepen" | "grootte";
};

function VrijTekstvak({
  vak,
  index,
  actief,
  zoom,
  venster,
  kies,
  wijzig,
  verwijder,
  kinderen,
  meet,
}: {
  vak: Tekstvak;
  index: number;
  actief: boolean;
  zoom: number;
  venster: RefObject<HTMLDivElement | null>;
  kies: () => void;
  wijzig: (plaats: VakPlaats) => void;
  verwijder: () => void;
  kinderen: ReactNode;
  meet: (hoogte: number) => void;
}) {
  const kader = useRef<HTMLDivElement>(null);
  const gebaar = useRef<Gebaar | null>(null);
  const [voorvertoning, setVoorvertoning] = useState<VakPlaats | null>(null);
  const meetRef = useRef(meet);
  meetRef.current = meet;
  useEffect(() => {
    if (!kader.current) return;
    const observer = new ResizeObserver(() =>
      meetRef.current(kader.current!.offsetHeight),
    );
    observer.observe(kader.current);
    return () => observer.disconnect();
  }, []);
  const plaats = voorvertoning ?? vak;
  function begin(
    e: ReactPointerEvent<HTMLButtonElement>,
    soort: Gebaar["soort"],
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    kies();
    e.currentTarget.focus({ preventScroll: true });
    gebaar.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      scrollX: venster.current?.scrollLeft ?? 0,
      scrollY: venster.current?.scrollTop ?? 0,
      begin: {
        x: vak.x,
        y: vak.y,
        breedte: vak.breedte,
        hoogte:
          soort === "grootte"
            ? Math.max(vak.hoogte, kader.current?.offsetHeight ?? 0)
            : vak.hoogte,
      },
      laatste: null,
      soort,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function beweeg(e: ReactPointerEvent<HTMLButtonElement>) {
    const g = gebaar.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx =
      (e.clientX - g.x + (venster.current?.scrollLeft ?? 0) - g.scrollX) / zoom;
    const dy =
      (e.clientY - g.y + (venster.current?.scrollTop ?? 0) - g.scrollY) / zoom;
    if (!g.laatste && Math.abs(dx) + Math.abs(dy) < 3) return;
    g.laatste = begrensVak(
      g.soort === "slepen"
        ? { ...g.begin, x: g.begin.x + dx, y: g.begin.y + dy }
        : {
            ...g.begin,
            breedte: g.begin.breedte + dx,
            hoogte: g.begin.hoogte + dy,
          },
    );
    setVoorvertoning(g.laatste);
  }
  function afronden(e: ReactPointerEvent<HTMLButtonElement>) {
    const g = gebaar.current;
    if (!g || g.pointer !== e.pointerId) return;
    gebaar.current = null;
    if (g.laatste) wijzig(g.laatste);
    setVoorvertoning(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function annuleer() {
    gebaar.current = null;
    setVoorvertoning(null);
  }
  function toets(e: React.KeyboardEvent<HTMLButtonElement>, grootte = false) {
    if (e.key === "Escape") {
      e.preventDefault();
      annuleer();
      return;
    }
    const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const dy = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    e.stopPropagation();
    const stap = e.shiftKey ? 10 : 1;
    wijzig(
      begrensVak(
        grootte
          ? {
              ...vak,
              breedte: vak.breedte + dx * stap,
              hoogte:
                Math.max(vak.hoogte, kader.current?.offsetHeight ?? 0) +
                dy * stap,
            }
          : { ...vak, x: vak.x + dx * stap, y: vak.y + dy * stap },
      ),
    );
  }
  const pointer = {
    onPointerMove: beweeg,
    onPointerUp: afronden,
    onPointerCancel: annuleer,
    onLostPointerCapture: annuleer,
  };
  return (
    <div
      ref={kader}
      className={`notities-tekstvak ${actief ? "is-actief" : ""} ${voorvertoning ? "is-bewegen" : ""}`}
      data-vak={vak.id}
      style={{
        left: plaats.x,
        top: plaats.y,
        width: plaats.breedte,
        minHeight: plaats.hoogte,
        zIndex: actief ? 3 : 1,
      }}
      onFocusCapture={kies}
    >
      <div className="notities-vakkop">
        <button
          className="notities-vakgreep"
          aria-label={`Tekstvak ${index + 1} verplaatsen`}
          title="Sleep om te verplaatsen · Pijltjes voor 1 pixel, Shift voor 10 · Escape annuleert"
          onPointerDown={(e) => begin(e, "slepen")}
          {...pointer}
          onKeyDown={(e) => toets(e)}
        >
          <GripHorizontal size={15} />
          <span>Tekstvak {index + 1}</span>
        </button>
        <button
          className="notities-vakverwijderen"
          aria-label={`Tekstvak ${index + 1} verwijderen`}
          title="Tekstvak verwijderen · Ongedaan maken met Ctrl+Z"
          onClick={verwijder}
        >
          <X size={13} />
        </button>
      </div>
      <div className="notities-vakinhoud">{kinderen}</div>
      <button
        className="notities-vakformaat"
        aria-label={`Tekstvak ${index + 1} vergroten of verkleinen`}
        title="Sleep om de grootte te wijzigen · Pijltjes voor 1 pixel, Shift voor 10"
        onPointerDown={(e) => begin(e, "grootte")}
        {...pointer}
        onKeyDown={(e) => toets(e, true)}
      >
        <MoveDiagonal2 size={15} />
      </button>
    </div>
  );
}

export function TekstCanvas({
  vakken,
  actiefId,
  zoom,
  raster,
  venster,
  kies,
  wijzig,
  verwijder,
  nieuw,
  render,
}: {
  vakken: Tekstvak[];
  actiefId?: string;
  zoom: number;
  raster: boolean;
  venster: RefObject<HTMLDivElement | null>;
  kies: (vak: Tekstvak) => void;
  wijzig: (id: string, plaats: VakPlaats) => void;
  verwijder: (id: string) => void;
  nieuw: (x?: number, y?: number) => void;
  render: (vak: Tekstvak) => ReactNode;
}) {
  const [maten, setMaten] = useState<Record<string, number>>({});
  const [zicht, setZicht] = useState({ breedte: 800, hoogte: 600 });
  useEffect(() => {
    if (!venster.current) return;
    const observer = new ResizeObserver(() =>
      setZicht({
        breedte: venster.current!.clientWidth,
        hoogte: venster.current!.clientHeight,
      }),
    );
    observer.observe(venster.current);
    return () => observer.disconnect();
  }, [venster]);
  const breedte = Math.max(
    zicht.breedte / zoom,
    ...vakken.map((v) => v.x + v.breedte + 60),
  );
  const hoogte = Math.max(
    800,
    zicht.hoogte / zoom,
    ...vakken.map((v) => v.y + Math.max(v.hoogte, maten[v.id] ?? 0) + 180),
  );
  return (
    <div
      ref={venster}
      className="notities-canvasvenster"
      aria-label="Vrije notitiepagina"
    >
      <div
        className="notities-canvasruimte"
        style={{ width: breedte * zoom, height: hoogte * zoom }}
      >
        <div
          className={`notities-canvas ${raster ? "met-raster" : ""}`}
          style={{
            width: breedte,
            height: hoogte,
            transform: `scale(${zoom})`,
          }}
          onDoubleClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const r = e.currentTarget.getBoundingClientRect();
            nieuw((e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom);
          }}
        >
          <span className="notities-canvastip">
            Dubbelklik op een lege plek om een tekstvak toe te voegen
          </span>
          {!vakken.length && (
            <button className="notities-eerstevak" onClick={() => nieuw()}>
              <Plus size={20} />
              <strong>Begin waar je wilt.</strong>
              <span>Tekstvak toevoegen</span>
            </button>
          )}
          {vakken.map((vak, index) => (
            <VrijTekstvak
              key={vak.id}
              vak={vak}
              index={index}
              actief={vak.id === actiefId}
              zoom={zoom}
              venster={venster}
              kies={() => kies(vak)}
              wijzig={(plaats) => wijzig(vak.id, plaats)}
              verwijder={() => verwijder(vak.id)}
              meet={(hoogte) =>
                setMaten((oud) =>
                  oud[vak.id] === hoogte ? oud : { ...oud, [vak.id]: hoogte },
                )
              }
              kinderen={render(vak)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
