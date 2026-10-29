import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatProcent } from "../../i18n/opmaak";
import {
  isCirkel,
  kleurVan,
  leesGetal,
  toonGetal,
  PALET,
  type GrafiekModel,
} from "../model.ts";

/** Percentage van een fractie in de notatie van de interfacetaal. */
const procentTekst = (fractie: number, decimalen = 0) =>
  formatProcent(fractie, { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });

const B = 400;
const H = 250;
const TEKST = "#57534e";
const RASTER = "#e7e5e4";

/** Mooie asindeling: ondergrens, bovengrens en stapgrootte. */
export function asSchaal(min: number, max: number, stappen = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, stap: 0.2 };
  if (min > 0) min = 0;
  if (max < 0) max = 0;
  if (max === min) max = min + 1;
  const ruw = (max - min) / stappen;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const stap = [1, 2, 2.5, 5, 10].map((f) => f * macht).find((s) => s >= ruw) ?? 10 * macht;
  return { min: Math.floor(min / stap) * stap, max: Math.ceil(max / stap) * stap, stap };
}

function afkorten(t: string, n: number) {
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** Een eigen SVG-tekening van het model, voor het live voorbeeld in het venster. */
export function Voorvertoning({ model, klein }: { model: GrafiekModel; klein?: boolean }) {
  const { t, i18n } = useTranslation("charts");
  // Getallen volgen de interfacetaal: opnieuw tekenen bij een taalwissel.
  const taal = i18n.language;
  const inhoud = useMemo(() => teken(model), [model, taal]);
  return (
    <svg
      className={klein ? "grafiek-voorbeeld-klein" : "grafiek-voorbeeld"}
      viewBox={`0 0 ${B} ${H}`}
      role="img"
      aria-label={model.titel ? t("preview.label", { title: model.titel }) : t("preview.untitled")}
    >
      <rect width={B} height={H} fill="#fff" />
      {inhoud}
    </svg>
  );
}

function teken(model: GrafiekModel) {
  const delen: React.ReactNode[] = [];
  let boven = 10;
  if (model.titel) {
    delen.push(
      <text key="t" x={B / 2} y={boven + 13} textAnchor="middle" fontSize="14" fontWeight="600" fill="#36363e">
        {afkorten(model.titel, 50)}
      </text>,
    );
    boven += 19;
  }
  if (model.ondertitel) {
    delen.push(
      <text key="o" x={B / 2} y={boven + 11} textAnchor="middle" fontSize="11" fill={TEKST}>
        {afkorten(model.ondertitel, 60)}
      </text>,
    );
    boven += 16;
  }
  const cirkel = isCirkel(model.soort);
  const n = model.categorieen.length;
  const reeksen = model.soort === "taart" ? model.reeksen.slice(0, 1) : model.reeksen;
  // Legenda.
  const items = cirkel
    ? model.categorieen.map((c, i) => ({ naam: c, kleur: PALET[i % PALET.length] }))
    : reeksen.map((r, i) => ({ naam: r.naam, kleur: kleurVan(model, i) }));
  let links = 12, rechts = B - 12, onder = H - 10;
  if (model.legenda !== "geen" && items.length) {
    const zichtbaar = items.slice(0, 8);
    if (model.legenda === "onder" || model.legenda === "boven") {
      const breedte = Math.min(90, (B - 24) / zichtbaar.length);
      const y = model.legenda === "onder" ? H - 12 : boven + 8;
      const start = B / 2 - (breedte * zichtbaar.length) / 2;
      zichtbaar.forEach((it, i) =>
        delen.push(
          <g key={`l${i}`}>
            <rect x={start + i * breedte} y={y - 7} width="8" height="8" fill={`#${it.kleur}`} rx="1.5" />
            <text x={start + i * breedte + 11} y={y} fontSize="9.5" fill={TEKST}>
              {afkorten(it.naam, Math.max(4, Math.floor(breedte / 6.2)))}
            </text>
          </g>,
        ),
      );
      if (model.legenda === "onder") onder -= 18;
      else boven += 18;
    } else {
      const x = model.legenda === "rechts" ? B - 88 : 12;
      zichtbaar.forEach((it, i) =>
        delen.push(
          <g key={`l${i}`}>
            <rect x={x} y={boven + 14 + i * 15} width="8" height="8" fill={`#${it.kleur}`} rx="1.5" />
            <text x={x + 11} y={boven + 21 + i * 15} fontSize="9.5" fill={TEKST}>
              {afkorten(it.naam, 11)}
            </text>
          </g>,
        ),
      );
      if (model.legenda === "rechts") rechts -= 92;
      else links += 92;
    }
  }
  if (!n || !reeksen.length) return delen;
  const label = (w: number | null, procent = false) =>
    w === null ? "" : procent ? procentTekst(w, model.decimalen) : toonGetal(w, model.decimalen);

  if (cirkel) {
    const cx = (links + rechts) / 2, cy = (boven + 6 + onder) / 2;
    const r = Math.max(20, Math.min((rechts - links) / 2, (onder - boven - 6) / 2) - 4);
    const ringen = model.soort === "ring" ? reeksen : reeksen.slice(0, 1);
    ringen.forEach((reeks, ri) => {
      const waarden = reeks.waarden.map((w) => Math.max(0, w ?? 0));
      const som = waarden.reduce((a, b) => a + b, 0) || 1;
      const buiten = model.soort === "ring" ? r - (ri * r * 0.45) / ringen.length : r;
      const binnen = model.soort === "ring" ? buiten - (r * 0.45) / ringen.length : 0;
      let hoek = -Math.PI / 2;
      waarden.forEach((w, i) => {
        const deel = (w / som) * Math.PI * 2;
        if (deel <= 0) return;
        const a2 = hoek + Math.min(deel, Math.PI * 2 - 0.0001);
        const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
        const groot = deel > Math.PI ? 1 : 0;
        const d = binnen
          ? `M${p(buiten, hoek)}A${buiten},${buiten} 0 ${groot} 1 ${p(buiten, a2)}L${p(binnen, a2)}A${binnen},${binnen} 0 ${groot} 0 ${p(binnen, hoek)}Z`
          : `M${cx},${cy}L${p(buiten, hoek)}A${buiten},${buiten} 0 ${groot} 1 ${p(buiten, a2)}Z`;
        delen.push(<path key={`p${ri}-${i}`} d={d} fill={`#${PALET[i % PALET.length]}`} stroke="#fff" strokeWidth="1.5" />);
        if (model.gegevenslabels && ri === ringen.length - 1 && deel > 0.25) {
          const m = hoek + deel / 2;
          const lr = binnen ? (buiten + binnen) / 2 : buiten * 0.62;
          delen.push(
            <text key={`pl${i}`} x={cx + lr * Math.cos(m)} y={cy + lr * Math.sin(m) + 3} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="600">
              {label(w / som, true)}
            </text>,
          );
        }
        hoek += deel;
      });
    });
    return delen;
  }

  // Assen.
  const horizontaal = model.soort === "staaf";
  const spreiding = model.soort === "spreiding";
  const combinatie = model.soort === "combinatie";
  const stapel = model.soort === "kolomGestapeld" || model.soort === "kolom100";
  const procent = model.soort === "kolom100";
  const hoofd = combinatie ? reeksen.slice(0, -1) : reeksen;
  const tweede = combinatie ? reeksen.slice(-1) : [];
  const waardenVan = (rs: typeof reeksen) => rs.flatMap((r) => r.waarden).filter((w): w is number => w !== null && Number.isFinite(w));
  let lo: number, hi: number;
  if (procent) {
    lo = 0;
    hi = 1;
  } else if (stapel) {
    const sommen = model.categorieen.map((_, i) => hoofd.reduce((s, r) => s + Math.max(0, r.waarden[i] ?? 0), 0));
    const neg = model.categorieen.map((_, i) => hoofd.reduce((s, r) => s + Math.min(0, r.waarden[i] ?? 0), 0));
    lo = Math.min(0, ...neg);
    hi = Math.max(0, ...sommen);
  } else {
    const alle = waardenVan(hoofd);
    lo = Math.min(...alle, 0);
    hi = Math.max(...alle, 0);
  }
  const schaal = procent ? { min: 0, max: 1, stap: 0.2 } : asSchaal(lo, hi);
  const schaal2 = combinatie ? asSchaal(Math.min(...waardenVan(tweede), 0), Math.max(...waardenVan(tweede), 0)) : null;
  const xs = spreiding ? model.categorieen.map((c) => leesGetal(c) ?? 0) : [];
  const xSchaal = spreiding ? asSchaal(Math.min(...xs), Math.max(...xs)) : null;
  const asLabel = (w: number) => (procent ? procentTekst(w) : toonGetal(w, Math.abs(schaal.stap) < 1 ? Math.min(3, Math.ceil(-Math.log10(schaal.stap))) : 0));
  const breedteLabels = horizontaal ? Math.min(70, 6 + 5.5 * Math.max(...model.categorieen.map((c) => afkorten(c, 12).length))) : 8 + 5.5 * Math.max(...[schaal.min, schaal.max].map((w) => asLabel(w).length));
  if (model.asTitelY) links += 14;
  if (model.asTitelX) onder -= 14;
  const x0 = links + breedteLabels, x1 = rechts - (schaal2 ? 34 : 6) - (combinatie && model.asTitelY2 ? 14 : 0);
  const y0 = boven + 8, y1 = onder - 16;
  const W = Math.max(10, x1 - x0), Hh = Math.max(10, y1 - y0);
  // Waarde → pixel langs de waardeas.
  const vw = (w: number, s = schaal) => (horizontaal ? x0 + ((w - s.min) / (s.max - s.min)) * W : y1 - ((w - s.min) / (s.max - s.min)) * Hh);
  for (let w = schaal.min, k = 0; w <= schaal.max + schaal.stap / 1e6 && k < 30; w += schaal.stap, k++) {
    const p = vw(w);
    if (model.rasterlijnen)
      delen.push(
        horizontaal ? <line key={`g${k}`} x1={p} x2={p} y1={y0} y2={y1} stroke={RASTER} /> : <line key={`g${k}`} x1={x0} x2={x1} y1={p} y2={p} stroke={RASTER} />,
      );
    delen.push(
      horizontaal ? (
        <text key={`a${k}`} x={p} y={y1 + 12} textAnchor="middle" fontSize="9" fill={TEKST}>{asLabel(w)}</text>
      ) : (
        <text key={`a${k}`} x={x0 - 4} y={p + 3} textAnchor="end" fontSize="9" fill={TEKST}>{asLabel(w)}</text>
      ),
    );
  }
  if (schaal2)
    for (let w = schaal2.min, k = 0; w <= schaal2.max + schaal2.stap / 1e6 && k < 30; w += schaal2.stap, k++)
      delen.push(<text key={`b${k}`} x={x1 + 4} y={vw(w, schaal2) + 3} fontSize="9" fill={TEKST}>{toonGetal(w)}</text>);
  // Categorie-as.
  const nul = vw(Math.max(schaal.min, Math.min(0, schaal.max)));
  delen.push(
    horizontaal ? <line key="as" x1={x0} x2={x0} y1={y0} y2={y1} stroke="#bfbfbf" /> : <line key="as" x1={x0} x2={x1} y1={spreiding ? y1 : nul} y2={spreiding ? y1 : nul} stroke="#bfbfbf" />,
  );
  const vak = (horizontaal ? Hh : W) / n;
  const elke = Math.max(1, Math.ceil(n / (horizontaal ? 12 : Math.max(1, Math.floor(W / 46)))));
  if (spreiding && xSchaal) {
    const xw = (w: number) => x0 + ((w - xSchaal.min) / (xSchaal.max - xSchaal.min)) * W;
    for (let w = xSchaal.min, k = 0; w <= xSchaal.max + xSchaal.stap / 1e6 && k < 30; w += xSchaal.stap, k++)
      delen.push(<text key={`x${k}`} x={xw(w)} y={y1 + 12} textAnchor="middle" fontSize="9" fill={TEKST}>{toonGetal(w, xSchaal.stap < 1 ? 1 : 0)}</text>);
    reeksen.forEach((r, ri) =>
      r.waarden.forEach((w, i) => {
        if (w === null) return;
        delen.push(<circle key={`s${ri}-${i}`} cx={xw(xs[i])} cy={vw(w)} r="3.5" fill={`#${kleurVan(model, ri)}`} stroke="#fff" />);
      }),
    );
  } else
    model.categorieen.forEach((c, i) => {
      if (i % elke) return;
      const m = (horizontaal ? y0 : x0) + vak * (i + 0.5);
      delen.push(
        horizontaal ? (
          <text key={`c${i}`} x={x0 - 4} y={y1 - (m - y0) + 3} textAnchor="end" fontSize="9" fill={TEKST}>{afkorten(c, 12)}</text>
        ) : (
          <text key={`c${i}`} x={m} y={y1 + 12} textAnchor="middle" fontSize="9" fill={TEKST}>{afkorten(c, Math.max(3, Math.floor((vak * elke) / 5.5)))}</text>
        ),
      );
    });
  // Staven.
  const staven = ["kolom", "kolomGestapeld", "kolom100", "staaf", "combinatie"].includes(model.soort);
  if (staven) {
    const groep = vak * 0.72;
    const aantal = stapel ? 1 : hoofd.length;
    const dik = groep / aantal;
    model.categorieen.forEach((_, i) => {
      let plus = 0, min = 0;
      const totaal = procent ? hoofd.reduce((s, r) => s + Math.abs(r.waarden[i] ?? 0), 0) || 1 : 1;
      hoofd.forEach((r, ri) => {
        const ruw = r.waarden[i];
        if (ruw === null || ruw === undefined) return;
        const w = procent ? Math.abs(ruw) / totaal : ruw;
        let a: number, b: number;
        if (stapel) {
          if (w >= 0) { a = plus; b = plus += w; } else { a = min; b = min += w; }
        } else { a = 0; b = w; }
        const p1 = vw(a), p2 = vw(b);
        const start = vak * i + (vak - groep) / 2 + (stapel ? 0 : ri * dik);
        const kleur = `#${kleurVan(model, ri)}`;
        if (horizontaal) {
          const y = y1 - start - dik;
          delen.push(<rect key={`r${ri}-${i}`} x={Math.min(p1, p2)} y={y + 0.5} width={Math.max(0.5, Math.abs(p2 - p1))} height={Math.max(0.5, dik - 1)} fill={kleur} />);
          if (model.gegevenslabels && n * aantal <= 24) delen.push(<text key={`rl${ri}-${i}`} x={Math.max(p1, p2) + 3} y={y + dik / 2 + 3} fontSize="8.5" fill={TEKST}>{label(ruw)}</text>);
        } else {
          const x = x0 + start;
          delen.push(<rect key={`r${ri}-${i}`} x={x + 0.5} y={Math.min(p1, p2)} width={Math.max(0.5, dik - 1)} height={Math.max(0.5, Math.abs(p2 - p1))} fill={kleur} />);
          if (model.gegevenslabels && n * aantal <= 24) delen.push(<text key={`rl${ri}-${i}`} x={x + dik / 2} y={stapel ? (p1 + p2) / 2 + 3 : Math.min(p1, p2) - 3} textAnchor="middle" fontSize="8.5" fill={stapel ? "#fff" : TEKST}>{procent ? label(w, true) : label(ruw)}</text>);
        }
      });
    });
  }
  // Lijnen en vlakken.
  const lijnen = model.soort === "lijn" || model.soort === "lijnMarkering" || model.soort === "vlak" ? reeksen : tweede;
  lijnen.forEach((r, j) => {
    const ri = combinatie ? reeksen.length - 1 : j;
    const s = combinatie && schaal2 ? schaal2 : schaal;
    const punten = r.waarden.map((w, i) => (w === null ? null : [x0 + vak * (i + 0.5), vw(w, s)] as const));
    const kleur = `#${kleurVan(model, ri)}`;
    let d = "";
    punten.forEach((p, i) => {
      if (!p) return;
      d += `${d && punten[i - 1] ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    });
    if (model.soort === "vlak") {
      const geldig = punten.filter((p): p is readonly [number, number] => !!p);
      if (geldig.length) {
        const basis = vw(Math.max(s.min, 0), s);
        const vlak = `M${geldig[0][0]},${basis}` + geldig.map((p) => `L${p[0]},${p[1]}`).join("") + `L${geldig[geldig.length - 1][0]},${basis}Z`;
        delen.push(<path key={`v${ri}`} d={vlak} fill={kleur} fillOpacity={0.55} />);
      }
    } else delen.push(<path key={`ln${ri}`} d={d} fill="none" stroke={kleur} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />);
    if (model.soort === "lijnMarkering" || combinatie)
      punten.forEach((p, i) => p && delen.push(<circle key={`m${ri}-${i}`} cx={p[0]} cy={p[1]} r="3.2" fill={kleur} stroke="#fff" />));
    if (model.gegevenslabels && n <= 16)
      punten.forEach((p, i) => p && delen.push(<text key={`ml${ri}-${i}`} x={p[0]} y={p[1] - 6} textAnchor="middle" fontSize="8.5" fill={TEKST}>{label(r.waarden[i])}</text>));
  });
  // Astitels.
  if (model.asTitelX)
    delen.push(<text key="tx" x={(x0 + x1) / 2} y={onder + 12} textAnchor="middle" fontSize="10" fill={TEKST}>{afkorten(model.asTitelX, 50)}</text>);
  if (model.asTitelY)
    delen.push(
      <text key="ty" x={links - 4} y={(y0 + y1) / 2} textAnchor="middle" fontSize="10" fill={TEKST} transform={`rotate(-90 ${links - 4} ${(y0 + y1) / 2})`}>{afkorten(model.asTitelY, 34)}</text>,
    );
  if (combinatie && model.asTitelY2)
    delen.push(
      <text key="ty2" x={rechts - 4} y={(y0 + y1) / 2} textAnchor="middle" fontSize="10" fill={TEKST} transform={`rotate(90 ${rechts - 4} ${(y0 + y1) / 2})`}>{afkorten(model.asTitelY2, 34)}</text>,
    );
  return delen;
}

/** Kleine pictogrammen voor de soortkeuze. */
export function SoortIcoon({ soort }: { soort: GrafiekModel["soort"] }) {
  const a = "#d97706", b = "#3f62b9", c = "#2f7a55";
  const g = (inhoud: React.ReactNode) => (
    <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true">
      <line x1="3" y1="25" x2="37" y2="25" stroke="#a1a1aa" strokeWidth="1" />
      {inhoud}
    </svg>
  );
  switch (soort) {
    case "kolom":
      return g(<><rect x="6" y="12" width="5" height="13" fill={a} /><rect x="11" y="7" width="5" height="18" fill={b} /><rect x="21" y="9" width="5" height="16" fill={a} /><rect x="26" y="4" width="5" height="21" fill={b} /></>);
    case "kolomGestapeld":
      return g(<><rect x="7" y="14" width="7" height="11" fill={a} /><rect x="7" y="7" width="7" height="7" fill={b} /><rect x="18" y="11" width="7" height="14" fill={a} /><rect x="18" y="4" width="7" height="7" fill={b} /><rect x="29" y="17" width="7" height="8" fill={a} /><rect x="29" y="12" width="7" height="5" fill={b} /></>);
    case "kolom100":
      return g(<><rect x="7" y="13" width="7" height="12" fill={a} /><rect x="7" y="3" width="7" height="10" fill={b} /><rect x="18" y="9" width="7" height="16" fill={a} /><rect x="18" y="3" width="7" height="6" fill={b} /><rect x="29" y="17" width="7" height="8" fill={a} /><rect x="29" y="3" width="7" height="14" fill={b} /></>);
    case "staaf":
      return g(<><rect x="4" y="4" width="22" height="5" fill={a} /><rect x="4" y="11" width="30" height="5" fill={b} /><rect x="4" y="18" width="15" height="5" fill={a} /></>);
    case "lijn":
      return g(<><polyline points="4,20 13,12 22,16 35,5" fill="none" stroke={a} strokeWidth="2" /><polyline points="4,23 13,19 22,21 35,13" fill="none" stroke={b} strokeWidth="2" /></>);
    case "lijnMarkering":
      return g(<><polyline points="4,20 13,12 22,16 35,5" fill="none" stroke={a} strokeWidth="2" />{[[4, 20], [13, 12], [22, 16], [35, 5]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2.3" fill={a} />)}</>);
    case "vlak":
      return g(<><path d="M4,25 L4,16 L13,9 L22,13 L35,5 L35,25Z" fill={a} fillOpacity=".7" /><path d="M4,25 L4,21 L13,18 L22,20 L35,14 L35,25Z" fill={b} fillOpacity=".8" /></>);
    case "taart":
      return <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true"><circle cx="20" cy="14" r="11" fill={b} /><path d="M20,14 L20,3 A11,11 0 0 1 30.5,17.3 Z" fill={a} /><path d="M20,14 L30.5,17.3 A11,11 0 0 1 14,23.4 Z" fill={c} /></svg>;
    case "ring":
      return <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true"><circle cx="20" cy="14" r="9" fill="none" stroke={b} strokeWidth="5" /><path d="M20,5 A9,9 0 0 1 28.6,16.7" fill="none" stroke={a} strokeWidth="5" /></svg>;
    case "spreiding":
      return g(<>{[[6, 20, a], [11, 16, a], [16, 17, b], [21, 11, a], [26, 12, b], [31, 6, a], [34, 9, b]].map(([x, y, k]) => <circle key={`${x}`} cx={x as number} cy={y as number} r="2.2" fill={k as string} />)}</>);
    case "combinatie":
      return g(<><rect x="6" y="12" width="6" height="13" fill={b} /><rect x="17" y="8" width="6" height="17" fill={b} /><rect x="28" y="14" width="6" height="11" fill={b} /><polyline points="9,8 20,13 31,4" fill="none" stroke={a} strokeWidth="2" /></>);
  }
}
