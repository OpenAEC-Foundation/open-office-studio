/**
 * Pagina-eindevoorbeeld van een rekenblad (#65): het afdrukgebied als schema
 * met de pagina's, hun nummers en de pagina-einden. Een einde versleep je naar
 * een andere rij- of kolomgrens; dat wordt een handmatig pagina-einde, zoals in
 * Excel en Calc. Dubbelklik op een grens voegt een einde toe, dubbelklik op een
 * handmatig einde haalt het weg.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../i18n/opmaak";
import type { RekenbladBron } from "./bron";
import type { RekenbladKeuze } from "./bronRekenblad";
import { indexNaarKolom } from "./rekenbladInstellingen";

type Info = NonNullable<Awaited<ReturnType<RekenbladBron["indeling"]>>>;

interface Sleep {
  as: "rij" | "kolom";
  /** Absolute index van de eerste rij/kolom na het einde. */
  van: number;
  naar: number;
}

const cumulatief = (maten: number[]) => {
  const uit = [0];
  for (const m of maten) uit.push(uit[uit.length - 1] + m);
  return uit;
};

export function PaginaEinden(props: {
  bron: RekenbladBron;
  blad: number;
  keuze: RekenbladKeuze;
  sluit: () => void;
  wijzig: (rijEinden: number[], kolomEinden: number[]) => void;
}) {
  const { t } = useTranslation(["print", "common"]);
  const opmaak = useOpmaak();
  const [info, setInfo] = useState<Info | null>(null);
  const [fout, setFout] = useState("");
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const inst = props.keuze.instellingen[props.blad];
  const sleutel = JSON.stringify(props.keuze);

  useEffect(() => {
    let actief = true;
    props.bron
      .indeling(props.blad, props.keuze)
      .then((i) => {
        if (!actief) return;
        if (!i) setFout(t("pageBreaks.emptySheet"));
        setInfo(i);
      })
      .catch((e) => actief && setFout(e instanceof Error ? e.message : String(e)));
    return () => {
      actief = false;
    };
  }, [sleutel, props.blad]);

  const geo = useMemo(() => {
    if (!info) return null;
    const xs = cumulatief(info.kolomBreedtes);
    const ys = cumulatief(info.rijHoogtes);
    const B = xs[xs.length - 1] || 1;
    const H = ys[ys.length - 1] || 1;
    const schaal = Math.min(860 / B, 520 / H, 1.2);
    return { xs, ys, B, H, schaal };
  }, [info]);

  if (!info || !geo)
    return (
      <div className="afdruk-einden" role="dialog" aria-modal="true" aria-label={t("pageBreaks.title")}>
        <p role="status">{fout || t("pageBreaks.calculating")}</p>
        <button type="button" className="werkruimte-knop" onClick={props.sluit}>
          {t("common:close")}
        </button>
      </div>
    );

  const { xs, ys, B, H, schaal } = geo;
  const handRij = new Set(inst.rijEinden);
  const handKolom = new Set(inst.kolomEinden);
  const kolomEinden = info.verdeling.kolommen.slice(1).map((g) => g[0]);
  const rijEinden = info.verdeling.rijen.slice(1).map((g) => g[0]);
  const marge = 28;
  const aantalPaginas = info.verdeling.kolommen.length * info.verdeling.rijen.length;

  const dichtstbij = (lijst: number[], waarde: number) => {
    let beste = 1;
    for (let i = 1; i < lijst.length - 1; i++)
      if (Math.abs(lijst[i] - waarde) < Math.abs(lijst[beste] - waarde)) beste = i;
    return beste;
  };
  const punt = (e: React.PointerEvent | React.MouseEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - marge) / schaal,
      y: (e.clientY - r.top - marge) / schaal,
    };
  };

  const verplaats = (s: Sleep) => {
    const rijen = [...handRij];
    const kolommen = [...handKolom];
    if (s.as === "rij") {
      const lijst = rijen.filter((r) => r !== s.van);
      if (s.naar > info.eersteRij) lijst.push(s.naar);
      props.wijzig([...new Set(lijst)].sort((a, b) => a - b), kolommen);
    } else {
      const lijst = kolommen.filter((k) => k !== s.van);
      if (s.naar > info.eersteKolom) lijst.push(s.naar);
      props.wijzig(rijen, [...new Set(lijst)].sort((a, b) => a - b));
    }
  };

  const pagina = (k: number, r: number) => {
    const kolommen = info.verdeling.kolommen.length;
    const rijen = info.verdeling.rijen.length;
    return inst.volgorde === "over" ? r * kolommen + k + 1 : k * rijen + r + 1;
  };

  return (
    <div
      className="afdruk-einden"
      role="dialog"
      aria-modal="true"
      aria-label={t("pageBreaks.title")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          props.sluit();
        }
      }}
    >
      <header>
        <strong>{t("pageBreaks.title")}</strong>
        <span>
          {t("pageBreaks.summary", {
            count: aantalPaginas,
            pages: opmaak.getal(aantalPaginas),
            scale: opmaak.procent(Math.round(info.verdeling.schaal * 100) / 100),
          })}
        </span>
      </header>
      <svg
        ref={svg}
        width={B * schaal + marge * 2}
        height={H * schaal + marge * 2}
        onPointerMove={(e) => {
          if (!sleep) return;
          const p = punt(e);
          const naar =
            sleep.as === "rij"
              ? info.eersteRij + dichtstbij(ys, p.y)
              : info.eersteKolom + dichtstbij(xs, p.x);
          if (naar !== sleep.naar) setSleep({ ...sleep, naar });
        }}
        onPointerUp={() => {
          if (sleep && sleep.naar !== sleep.van) verplaats(sleep);
          setSleep(null);
        }}
        onDoubleClick={(e) => {
          const p = punt(e);
          if (p.x < 0 || p.y < 0) return;
          // Dichter bij een rijgrens dan bij een kolomgrens: rij-einde.
          const ri = dichtstbij(ys, p.y);
          const ki = dichtstbij(xs, p.x);
          const rAfstand = Math.abs(ys[ri] - p.y);
          const kAfstand = Math.abs(xs[ki] - p.x);
          if (rAfstand <= kAfstand) {
            const r = info.eersteRij + ri;
            const lijst = handRij.has(r) ? [...handRij].filter((x) => x !== r) : [...handRij, r];
            props.wijzig(lijst.sort((a, b) => a - b), [...handKolom]);
          } else {
            const k = info.eersteKolom + ki;
            const lijst = handKolom.has(k) ? [...handKolom].filter((x) => x !== k) : [...handKolom, k];
            props.wijzig([...handRij], lijst.sort((a, b) => a - b));
          }
        }}
      >
        <g transform={`translate(${marge} ${marge})`}>
          {info.verdeling.kolommen.map((kg, k) =>
            info.verdeling.rijen.map((rg, r) => {
              const x = xs[kg[0]] * schaal;
              const y = ys[rg[0]] * schaal;
              const w = (xs[kg[1]] - xs[kg[0]]) * schaal;
              const h = (ys[rg[1]] - ys[rg[0]]) * schaal;
              return (
                <g key={`${k}-${r}`}>
                  <rect x={x} y={y} width={w} height={h} className="einden-pagina" />
                  <text x={x + w / 2} y={y + h / 2} className="einden-nummer">
                    {t("pages.page", { number: pagina(k, r) })}
                  </text>
                </g>
              );
            }),
          )}
          {xs.length < 120 &&
            xs.slice(1, -1).map((x, i) => (
              <line key={`k${i}`} x1={x * schaal} x2={x * schaal} y1={0} y2={H * schaal} className="einden-raster" />
            ))}
          {ys.length < 200 &&
            ys.slice(1, -1).map((y, i) => (
              <line key={`r${i}`} y1={y * schaal} y2={y * schaal} x1={0} x2={B * schaal} className="einden-raster" />
            ))}
          {xs.length < 60 &&
            info.kolomBreedtes.map((_, i) => (
              <text key={`kl${i}`} x={((xs[i] + xs[i + 1]) / 2) * schaal} y={-8} className="einden-kop">
                {indexNaarKolom(info.eersteKolom + i)}
              </text>
            ))}
          {ys.length < 80 &&
            info.rijHoogtes.map((_, i) => (
              <text key={`rl${i}`} x={-6} y={((ys[i] + ys[i + 1]) / 2) * schaal + 3} className="einden-kop einden-rijkop">
                {info.eersteRij + i + 1}
              </text>
            ))}
          {kolomEinden.map((rel) => {
            const abs = info.eersteKolom + rel;
            const actief = sleep?.as === "kolom" && sleep.van === abs;
            const x = xs[actief ? sleep!.naar - info.eersteKolom : rel] * schaal;
            return (
              <line
                key={`ke${abs}`}
                x1={x}
                x2={x}
                y1={0}
                y2={H * schaal}
                className={`einden-einde ${handKolom.has(abs) ? "is-handmatig" : ""}`}
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setSleep({ as: "kolom", van: abs, naar: abs });
                }}
              >
                <title>{t("pageBreaks.breakBeforeColumn", { column: indexNaarKolom(abs) })}</title>
              </line>
            );
          })}
          {rijEinden.map((rel) => {
            const abs = info.eersteRij + rel;
            const actief = sleep?.as === "rij" && sleep.van === abs;
            const y = ys[actief ? sleep!.naar - info.eersteRij : rel] * schaal;
            return (
              <line
                key={`re${abs}`}
                y1={y}
                y2={y}
                x1={0}
                x2={B * schaal}
                className={`einden-einde ${handRij.has(abs) ? "is-handmatig" : ""}`}
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setSleep({ as: "rij", van: abs, naar: abs });
                }}
              >
                <title>{t("pageBreaks.breakBeforeRow", { row: abs + 1 })}</title>
              </line>
            );
          })}
          <rect x={0} y={0} width={B * schaal} height={H * schaal} className="einden-rand" />
        </g>
      </svg>
      <p className="afdruk-uitleg">
        {t("pageBreaks.help")}
      </p>
      <footer>
        <button
          type="button"
          className="werkruimte-knop"
          disabled={!handRij.size && !handKolom.size}
          onClick={() => props.wijzig([], [])}
        >
          {t("pageBreaks.clearManual")}
        </button>
        <button type="button" className="werkruimte-knop is-primair" data-autofocus onClick={props.sluit}>
          {t("pageBreaks.done")}
        </button>
      </footer>
    </div>
  );
}
