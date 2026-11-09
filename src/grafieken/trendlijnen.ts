/** Least-squares regressie voor de voorvertoning; geen wijziging van brongegevens. */
import type { Trendlijn } from "./model";
export interface TrendPunt {
  x: number;
  y: number;
}
export interface TrendResultaat {
  punten: TrendPunt[];
  r2?: number;
}

function losOp(matrix: number[][], vector: number[]): number[] | null {
  const a = matrix.map((r, i) => [...r, vector[i]]),
    n = vector.length;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    if (Math.abs(a[pivot][k]) < 1e-12) return null;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    const deler = a[k][k];
    for (let j = k; j <= n; j++) a[k][j] /= deler;
    for (let i = 0; i < n; i++)
      if (i !== k) {
        const f = a[i][k];
        for (let j = k; j <= n; j++) a[i][j] -= f * a[k][j];
      }
  }
  return a.map((r) => r[n]);
}

export function berekenTrendlijn(
  punten: TrendPunt[],
  trend: Trendlijn,
): TrendResultaat {
  const geldig = punten.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (trend.soort === "unknown" || geldig.length < 2) return { punten: [] };
  if (trend.soort === "movingAvg") {
    const periode = Math.max(2, Math.trunc(trend.periode ?? 2));
    return {
      punten: geldig
        .slice(periode - 1)
        .map((p, i) => ({
          x: p.x,
          y:
            geldig.slice(i, i + periode).reduce((s, p) => s + p.y, 0) / periode,
        })),
    };
  }
  if (
    ((trend.soort === "log" || trend.soort === "power") &&
      geldig.some((p) => p.x <= 0)) ||
    ((trend.soort === "exp" || trend.soort === "power") &&
      geldig.some((p) => p.y <= 0))
  )
    return { punten: [] };
  const graad = trend.soort === "poly" ? (trend.graad ?? 2) : 1;
  if (geldig.length < graad + 1) return { punten: [] };
  // Schalen voorkomt instabiliteit van een Vandermonde-matrix bij grote x.
  const xVan = (x: number) =>
    trend.soort === "log" || trend.soort === "power" ? Math.log(x) : x;
  const yVan = (y: number) =>
    trend.soort === "exp" || trend.soort === "power" ? Math.log(y) : y;
  const xs = geldig.map((p) => xVan(p.x)),
    midden = (Math.min(...xs) + Math.max(...xs)) / 2,
    schaal = (Math.max(...xs) - Math.min(...xs)) / 2 || 1;
  const basis = geldig.map((p) =>
    Array.from(
      { length: graad + 1 },
      (_, i) => ((xVan(p.x) - midden) / schaal) ** i,
    ),
  );
  const matrix = Array.from({ length: graad + 1 }, (_, i) =>
    Array.from({ length: graad + 1 }, (_, j) =>
      basis.reduce((s, r) => s + r[i] * r[j], 0),
    ),
  );
  const vector = Array.from({ length: graad + 1 }, (_, i) =>
    basis.reduce((s, r, k) => s + r[i] * yVan(geldig[k].y), 0),
  );
  const kanIntercept =
    trend.intercept !== undefined &&
    ["linear", "poly", "exp"].includes(trend.soort) &&
    (trend.soort !== "exp" || trend.intercept! > 0);
  if (kanIntercept) {
    const nul = Array.from(
      { length: graad + 1 },
      (_, i) => ((0 - midden) / schaal) ** i,
    );
    matrix.forEach((r, i) => r.push(nul[i]));
    matrix.push([...nul, 0]);
    vector.push(yVan(trend.intercept!));
  }
  const oplossing = losOp(matrix, vector);
  if (!oplossing) return { punten: [] };
  const c = oplossing.slice(0, graad + 1);
  const voorspel = (x: number) => {
    if ((trend.soort === "log" || trend.soort === "power") && x <= 0)
      return NaN;
    const n = (xVan(x) - midden) / schaal;
    const y = c.reduceRight((s, coef) => s * n + coef, 0);
    return trend.soort === "exp" || trend.soort === "power" ? Math.exp(y) : y;
  };
  const min = Math.min(...geldig.map((p) => p.x)) - (trend.achteruit ?? 0),
    max = Math.max(...geldig.map((p) => p.x)) + (trend.vooruit ?? 0);
  const gem = geldig.reduce((s, p) => s + p.y, 0) / geldig.length,
    sst = geldig.reduce((s, p) => s + (p.y - gem) ** 2, 0),
    sse = geldig.reduce((s, p) => s + (p.y - voorspel(p.x)) ** 2, 0);
  const r2 = sst ? 1 - sse / sst : sse < 1e-12 ? 1 : undefined;
  return {
    punten: Array.from({ length: 81 }, (_, i) => {
      const x = min + ((max - min) * i) / 80;
      return { x, y: voorspel(x) };
    }).filter((p) => Number.isFinite(p.y)),
    r2: r2 !== undefined && Number.isFinite(r2) ? r2 : undefined,
  };
}
