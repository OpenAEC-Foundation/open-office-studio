/** Reconstrueert opgeslagen Access-query’s uit MSysQueries. Eigen code; de betekenis van de
 * attribuutcodes volgt de openbare beschrijvingen van mdbtools en Jackcess. Er wordt niets uitgevoerd. */
import i18next from "i18next";
export interface QueryRij {
  Attribute: number;
  Expression: string | null;
  Flag: number | null;
  LvExtra: number | null;
  Name1: string | null;
  Name2: string | null;
}
export type Querysoort =
  | "SELECT"
  | "CROSSTAB"
  | "DELETE"
  | "UPDATE"
  | "APPEND"
  | "MAKE TABLE"
  | "DDL"
  | "PASSTHROUGH"
  | "UNION"
  | "ONBEKEND";
export interface QueryReconstructie {
  soort: Querysoort;
  sql: string | null;
  beperkingen: string[];
}

const soortPerVlag: Record<number, Querysoort> = {
  0: "SELECT",
  16: "CROSSTAB",
  32: "DELETE",
  48: "UPDATE",
  64: "APPEND",
  80: "MAKE TABLE",
  96: "DDL",
  112: "PASSTHROUGH",
  128: "UNION",
};
const soortPerType: Record<number, Querysoort> = {
  1: "SELECT",
  2: "MAKE TABLE",
  3: "APPEND",
  4: "UPDATE",
  5: "DELETE",
  6: "CROSSTAB",
  7: "DDL",
  8: "PASSTHROUGH",
  9: "UNION",
};
const parametertypen: Record<number, string> = {
  0: "Value",
  1: "Bit",
  2: "Byte",
  3: "Short",
  4: "Long",
  5: "Currency",
  6: "IEEESingle",
  7: "IEEEDouble",
  8: "DateTime",
  9: "Binary",
  10: "Text",
  11: "LongBinary",
  12: "Memo",
  15: "Guid",
  16: "Decimal",
};
const joins: Record<number, string> = {
  1: " INNER JOIN ",
  2: " LEFT JOIN ",
  3: " RIGHT JOIN ",
};

function citeer(deel: string) {
  return /^\[.*\]$/.test(deel) ? deel : `[${deel}]`;
}
function naamExpressie(naam: string, identifier = true) {
  return (identifier ? naam.split(".") : [naam])
    .map((deel) => (/[^\p{L}\p{N}_]/u.test(deel) ? citeer(deel) : deel))
    .join(".");
}
function alias(naam: string | null) {
  return naam ? ` AS ${naamExpressie(naam, false)}` : "";
}
function opDb(pad: string | null, type: string | null) {
  if (pad === null && type === null) return "";
  return ` IN '${pad ?? ""}'${type !== null ? ` [${type}]` : ""}`;
}

type Bron =
  | { soort: "tabel"; sleutel: string; tekst: string }
  | { soort: "join"; links: Bron; rechts: Bron; type: number; op: string[] };
function bevat(bron: Bron, naam: string): boolean {
  return bron.soort === "tabel"
    ? bron.sleutel.toLowerCase() === naam.toLowerCase()
    : bevat(bron.links, naam) || bevat(bron.rechts, naam);
}
function bronTekst(bron: Bron, bovenste = true): string {
  if (bron.soort === "tabel") return bron.tekst;
  const type = joins[bron.type];
  if (!type) throw new Error(i18next.t("database:analysis.query.unknownJoinType", { type: bron.type }));
  const op = bron.op.length > 1 ? `(${bron.op.join(") AND (")})` : bron.op[0];
  const tekst = `${bronTekst(bron.links, false)}${type}${bronTekst(bron.rechts, false)} ON ${op}`;
  return bovenste ? tekst : `(${tekst})`;
}

export function reconstrueerQuery(
  rijen: QueryRij[],
  objectVlaggen: number,
): QueryReconstructie {
  const beperkingen: string[] = [];
  const met = (attribuut: number) =>
    rijen.filter((r) => r.Attribute === attribuut);
  const een = (attribuut: number) => {
    const lijst = met(attribuut);
    if (lijst.length > 1)
      throw new Error(i18next.t("database:analysis.query.multipleRows", { attribute: attribuut }));
    return lijst[0];
  };
  const typeRij = een(1);
  let soort = soortPerVlag[objectVlaggen & 0xf0] ?? "ONBEKEND";
  if (
    (objectVlaggen & 0xf0) === 0 &&
    typeRij?.Flag &&
    soortPerType[typeRij.Flag]
  )
    soort = soortPerType[typeRij.Flag];
  const bekend = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255]);
  const onbekend = [
    ...new Set(rijen.map((r) => r.Attribute).filter((a) => !bekend.has(a))),
  ];
  if (onbekend.length)
    beperkingen.push(
      i18next.t("database:analysis.query.unknownAttributes", { codes: onbekend.join(", ") }),
    );
  try {
    if (soort === "ONBEKEND")
      throw new Error(i18next.t("database:analysis.query.unknownKind", { flags: objectVlaggen }));
    if (soort === "PASSTHROUGH") {
      const verbinding = typeRij?.Name1 ?? een(4)?.Expression;
      if (verbinding)
        beperkingen.push(
          i18next.t("database:analysis.query.passthroughConnection"),
        );
      beperkingen.push(
        i18next.t("database:analysis.query.passthroughNotRun"),
      );
      return {
        soort,
        sql: (typeRij?.Expression ?? "").replace(/\0+$/, ""),
        beperkingen,
      };
    }
    if (soort === "DDL")
      return {
        soort,
        sql: (typeRij?.Expression ?? "").replace(/\0+$/, ""),
        beperkingen,
      };
    const vlag = een(3)?.Flag ?? 0;
    const heeft = (masker: number) => (vlag & masker) !== 0;
    if (met(2).some((r) => r.Flag === 0))
      beperkingen.push(
        i18next.t("database:analysis.query.parameterTypeZero"),
      );
    const parameters = met(2).map((r) => {
      const type = parametertypen[r.Flag ?? -1];
      if (!type) throw new Error(i18next.t("database:analysis.query.unknownParameterType", { type: r.Flag }));
      return `${r.Name1} ${type}${r.Flag === 10 && (r.LvExtra ?? 0) > 0 ? `(${r.LvExtra})` : ""}`;
    });
    const orderBy = met(11).map(
      (r) =>
        `${r.Expression}${(r.Name1 ?? "").toUpperCase() === "D" ? " DESC" : ""}`,
    );
    const remote = een(4);
    const bronnen = (): string[] => {
      const lijst: Bron[] = met(5).map((r) => ({
        soort: "tabel",
        sleutel: r.Name2 ?? r.Name1 ?? "",
        tekst:
          (r.Expression !== null ? `${citeer(r.Expression)}.` : "") +
          (r.Name1 !== null ? naamExpressie(r.Name1) : "") +
          alias(r.Name2),
      }));
      for (const join of met(7)) {
        const van = join.Name1 ?? "";
        const naar = join.Name2 ?? "";
        let links: Bron | undefined;
        let rechts: Bron | undefined;
        for (let i = 0; i < lijst.length && (!links || !rechts); ) {
          const bron = lijst[i];
          if (!links && bevat(bron, van)) {
            links = bron;
            if (!rechts && bevat(bron, naar)) {
              rechts = bron;
              break;
            }
            lijst.splice(i, 1);
          } else if (!rechts && bevat(bron, naar)) {
            rechts = bron;
            lijst.splice(i, 1);
          } else i++;
        }
        links ??= { soort: "tabel", sleutel: van, tekst: naamExpressie(van) };
        rechts ??= {
          soort: "tabel",
          sleutel: naar,
          tekst: naamExpressie(naar),
        };
        if (links === rechts) {
          if (links.soort === "join" && links.type === join.Flag) {
            links.op.unshift(join.Expression ?? "");
            continue;
          }
          throw new Error(i18next.t("database:analysis.query.conflictingJoins", { from: van, to: naar }));
        }
        lijst.push({
          soort: "join",
          links,
          rechts,
          type: join.Flag ?? 0,
          op: [join.Expression ?? ""],
        });
      }
      return lijst.map((bron) => bronTekst(bron));
    };
    const select = (
      kolomRijen: QueryRij[],
      groepRijen: QueryRij[],
      voorvoegsel: boolean,
      into = "",
    ) => {
      let sql = "";
      if (voorvoegsel) {
        sql = "SELECT ";
        if (heeft(0x02)) sql += "DISTINCT ";
        else if (heeft(0x08)) sql += "DISTINCTROW ";
        else if (heeft(0x10)) {
          const top = een(3)?.Name1;
          if (!top) throw new Error(i18next.t("database:analysis.query.topMissing"));
          sql += `TOP ${top}${heeft(0x20) ? " PERCENT" : ""} `;
        }
      }
      const kolommen = kolomRijen.map(
        (r) => `${r.Expression ?? ""}${alias(r.Name1)}`,
      );
      if (heeft(0x01)) kolommen.push("*");
      sql += kolommen.join(", ") + into;
      const van = bronnen();
      if (van.length)
        sql += `\nFROM ${van.join(", ")}${opDb(remote?.Name1 ?? null, remote?.Expression ?? null)}`;
      const waar = een(8)?.Expression;
      if (waar) sql += `\nWHERE ${waar}`;
      if (groepRijen.length)
        sql += `\nGROUP BY ${groepRijen.map((r) => r.Expression).join(", ")}`;
      const having = een(10)?.Expression;
      if (having) sql += `\nHAVING ${having}`;
      if (orderBy.length) sql += `\nORDER BY ${orderBy.join(", ")}`;
      return sql;
    };
    let sql: string;
    if (soort === "SELECT") sql = select(met(6), met(9), true);
    else if (soort === "DELETE")
      sql = "DELETE " + select(met(6), met(9), false);
    else if (soort === "MAKE TABLE")
      sql = select(
        met(6),
        met(9),
        true,
        ` INTO ${naamExpressie(typeRij?.Name1 ?? "")}${opDb(typeRij?.Name2 ?? null, typeRij?.Expression ?? null)}`,
      );
    else if (soort === "APPEND") {
      const alle = met(6);
      const waarden = alle.filter((r) => ((r.Flag ?? 0) & 0x8000) !== 0);
      const doelen = alle
        .filter((r) => r.Name2 !== null)
        .map((r) => naamExpressie(r.Name2 ?? ""));
      sql = `INSERT INTO ${naamExpressie(typeRij?.Name1 ?? "")}${doelen.length ? ` (${doelen.join(", ")})` : ""}${opDb(typeRij?.Name2 ?? null, typeRij?.Expression ?? null)}\n`;
      sql += waarden.length
        ? `VALUES (${waarden.map((r) => r.Expression).join(", ")})`
        : select(
            alle.filter((r) => ((r.Flag ?? 0) & 0x8000) === 0),
            met(9),
            true,
          );
    } else if (soort === "UPDATE") {
      sql = `UPDATE ${bronnen().join(", ")}${opDb(remote?.Name1 ?? null, remote?.Expression ?? null)}`;
      sql += `\nSET ${met(6)
        .map((r) => `${naamExpressie(r.Name2 ?? "")} = ${r.Expression}`)
        .join(", ")}`;
      const waar = een(8)?.Expression;
      if (waar) sql += `\nWHERE ${waar}`;
    } else if (soort === "CROSSTAB") {
      const kolommen = met(6);
      const transform = kolommen.filter((r) => ((r.Flag ?? 0) & 0x03) === 0);
      const pivot = kolommen.filter((r) => ((r.Flag ?? 0) & 0x01) !== 0);
      if (transform.length > 1 || pivot.length !== 1)
        throw new Error(i18next.t("database:analysis.query.crosstabAmbiguous"));
      sql = transform[0]?.Expression
        ? `TRANSFORM ${transform[0].Expression}${alias(transform[0].Name1)}\n`
        : "";
      sql += select(
        kolommen.filter((r) => ((r.Flag ?? 0) & 0x02) !== 0),
        met(9).filter((r) => ((r.Flag ?? 0) & 0x02) !== 0),
        true,
      );
      sql += `\nPIVOT ${pivot[0].Expression}`;
    } else {
      const deel = (sleutel: string) => {
        const rij = met(5).find((r) => r.Name2 === sleutel);
        if (!rij?.Expression)
          throw new Error(i18next.t("database:analysis.query.unionPartMissing", { part: sleutel }));
        return rij.Expression.trim().replace(/[\r\n]+/g, "\n");
      };
      sql = `${deel("X7YZ_____1")}\nUNION ${heeft(0x02) ? "" : "ALL "}${deel("X7YZ_____2")}`;
      if (orderBy.length) sql += `\nORDER BY ${orderBy.join(", ")}`;
    }
    if (parameters.length) sql = `PARAMETERS ${parameters.join(", ")};\n${sql}`;
    if (heeft(0x04)) sql += "\nWITH OWNERACCESS OPTION";
    if (remote && (remote.Name1 || remote.Expression))
      beperkingen.push(
        i18next.t("database:analysis.query.externalDatabase"),
      );
    return { soort, sql: sql + ";", beperkingen };
  } catch (fout) {
    beperkingen.push(
      i18next.t("database:analysis.query.notReconstructed", { error: fout instanceof Error ? fout.message : String(fout) }),
    );
    return { soort, sql: null, beperkingen };
  }
}
