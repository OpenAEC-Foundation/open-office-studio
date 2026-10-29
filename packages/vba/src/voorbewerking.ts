/**
 * Voorwaardelijke compilatie (#If/#ElseIf/#Else/#End If en #Const). Inactieve
 * regels worden leeggemaakt, zodat regelnummers gelijk blijven. De runtime
 * gedraagt zich als 32-bits VBA7 op Windows: VBA7 en Win32 zijn waar, Win64 en Mac onwaar.
 */
import i18next from "i18next";
import type { Expr } from "./ast.ts";
import { VbaParseerFout } from "./fouten.ts";
import { NEDERLANDS } from "./land.ts";
import { logisch, niet, negatief, rekenkundig, samenvoegen, vergelijkOp } from "./operatoren.ts";
import { Getal, LEEG, NULL, naarBool, type VbaWaarde } from "./waarden.ts";

export const STANDAARD_COMPILATIECONSTANTEN: Record<string, VbaWaarde> = {
  vba7: true,
  vba6: true,
  win32: true,
  win64: false,
  win16: false,
  mac: false,
};

function evalueer(e: Expr, c: Map<string, VbaWaarde>): VbaWaarde {
  switch (e.k) {
    case "lit":
      if (e.w.t === "getal") return new Getal(e.w.type, e.w.v);
      if (e.w.t === "tekst" || e.w.t === "bool") return e.w.v;
      if (e.w.t === "null") return NULL;
      return LEEG;
    case "id":
      return c.get(e.naam.toLowerCase()) ?? LEEG;
    case "haakjes":
      return evalueer(e.e, c);
    case "un": {
      const w = evalueer(e.e, c);
      return e.op === "not" ? niet(w, NEDERLANDS) : e.op === "-" ? negatief(w, NEDERLANDS) : w;
    }
    case "bin": {
      const a = evalueer(e.l, c);
      const b = evalueer(e.r, c);
      if (["=", "<>", "<", ">", "<=", ">="].includes(e.op)) return vergelijkOp(e.op, a, b, "binary", NEDERLANDS);
      if (e.op === "&") return samenvoegen(a, b, NEDERLANDS);
      if (["+", "-", "*", "/", "\\", "mod", "^"].includes(e.op)) return rekenkundig(e.op, a, b, NEDERLANDS);
      return logisch(e.op, a, b, NEDERLANDS);
    }
  }
  throw new Error(i18next.t("vba:parse.invalidDirectiveExpression"));
}

/** `parseer` is parseerExpressie (doorgegeven om een importkringloop te vermijden). */
export function voorbewerk(bron: string, module: string, parseer: (t: string) => Expr): string {
  if (!/^[ \t]*#/m.test(bron)) return bron;
  const regels = bron.split(/(\r\n|\r|\n)/);
  const constanten = new Map<string, VbaWaarde>(Object.entries(STANDAARD_COMPILATIECONSTANTEN));
  const stapel: { actief: boolean; genomen: boolean; ouder: boolean }[] = [];
  const actief = () => (stapel.length ? stapel[stapel.length - 1].actief : true);
  const waar = (tekst: string, regel: number) => {
    try {
      const w = evalueer(parseer(tekst), constanten);
      return w === NULL ? false : naarBool(w);
    } catch (e) {
      throw new VbaParseerFout(i18next.t("vba:parse.invalidIfCondition", { message: (e as Error).message }), { module, regel, kolom: 1 }, "voorwaardelijke compilatie");
    }
  };
  for (let i = 0; i < regels.length; i += 2) {
    const regel = i / 2 + 1;
    const t = regels[i].trim();
    const zonderCommentaar = t.replace(/\s+'.*$/, "");
    let m: RegExpExecArray | null;
    if ((m = /^#if\s+(.*?)\s+then$/i.exec(zonderCommentaar))) {
      const ouder = actief();
      const w = ouder && waar(m[1], regel);
      stapel.push({ actief: w, genomen: w, ouder });
    } else if ((m = /^#elseif\s+(.*?)\s+then$/i.exec(zonderCommentaar))) {
      const top = stapel[stapel.length - 1];
      if (!top) throw new VbaParseerFout(i18next.t("vba:parse.elseIfWithoutIf"), { module, regel, kolom: 1 }, "voorwaardelijke compilatie");
      const w = top.ouder && !top.genomen && waar(m[1], regel);
      top.actief = w;
      top.genomen ||= w;
    } else if (/^#else$/i.test(zonderCommentaar)) {
      const top = stapel[stapel.length - 1];
      if (!top) throw new VbaParseerFout(i18next.t("vba:parse.elseWithoutIf"), { module, regel, kolom: 1 }, "voorwaardelijke compilatie");
      top.actief = top.ouder && !top.genomen;
      top.genomen = true;
    } else if (/^#end\s*if$/i.test(zonderCommentaar)) {
      if (!stapel.pop()) throw new VbaParseerFout(i18next.t("vba:parse.endIfWithoutIf"), { module, regel, kolom: 1 }, "voorwaardelijke compilatie");
    } else if ((m = /^#const\s+([A-Za-z_]\w*)\s*=\s*(.*)$/i.exec(zonderCommentaar))) {
      if (actief()) constanten.set(m[1].toLowerCase(), evalueer(parseer(m[2]), constanten));
    } else if (actief()) continue;
    regels[i] = "";
  }
  if (stapel.length) throw new VbaParseerFout(i18next.t("vba:parse.endIfMissing"), { module, regel: regels.length / 2, kolom: 1 }, "voorwaardelijke compilatie");
  return regels.join("");
}
