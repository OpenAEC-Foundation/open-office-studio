import type { YrsSession, YrsStoryRange } from "@betteroffice/docx/yrs";

export const VELDEN = ["PAGE", "NUMPAGES", "DATE", "TIME", "FILENAME", "AUTHOR", "TITLE"] as const;
export type VeldSoort = typeof VELDEN[number];
export interface VeldOmgeving {
  bestandsnaam: string; auteur: string; titel: string; locale?: string; nu?: Date;
  paginas: number;
  pagina: (story: string, index: number) => { nummer: number; label?: string } | null;
}

export function datumVeld(d: Date, patroon: string, locale = "nl-NL") {
  const twee = (n: number) => String(n).padStart(2, "0");
  return patroon.replace(/'[^']*'|dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy|HH|H|hh|h|mm|m|ss|s|AM\/PM|am\/pm/g, t => {
    switch (t) {
      case "dddd": case "ddd": return new Intl.DateTimeFormat(locale, { weekday: t === "dddd" ? "long" : "short" }).format(d);
      case "MMMM": case "MMM": return new Intl.DateTimeFormat(locale, { month: t === "MMMM" ? "long" : "short" }).format(d);
      case "d": return String(d.getDate()); case "dd": return twee(d.getDate());
      case "M": return String(d.getMonth() + 1); case "MM": return twee(d.getMonth() + 1);
      case "yy": return twee(d.getFullYear() % 100); case "yyyy": return String(d.getFullYear());
      case "H": return String(d.getHours()); case "HH": return twee(d.getHours());
      case "h": return String(d.getHours() % 12 || 12); case "hh": return twee(d.getHours() % 12 || 12);
      case "m": return String(d.getMinutes()); case "mm": return twee(d.getMinutes());
      case "s": return String(d.getSeconds()); case "ss": return twee(d.getSeconds());
      case "AM/PM": return d.getHours() < 12 ? "AM" : "PM"; case "am/pm": return d.getHours() < 12 ? "am" : "pm";
      default: return t.slice(1, -1);
    }
  });
}

function getal(n: number, notatie: string) {
  if (/^roman$/i.test(notatie)) {
    let r = "", getal = Math.floor(n);
    if (getal < 1 || getal > 3999) return String(n);
    for (const [waarde, teken] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]] as const) while (getal >= waarde) { r += teken; getal -= waarde; }
    return notatie === "roman" ? r.toLowerCase() : r;
  }
  if (/^alphabetic$/i.test(notatie)) {
    let r = ""; for (let i = Math.floor(n); i > 0; i = Math.floor((i - 1) / 26)) r = String.fromCharCode(65 + (i - 1) % 26) + r;
    return notatie === "alphabetic" ? r.toLowerCase() : r;
  }
  return String(n);
}

export function veldWaarde(code: string, o: VeldOmgeving, story: string, index: number): string | null {
  const type = /^\s*([A-Za-z]+)/.exec(code)?.[1].toUpperCase();
  if (!VELDEN.includes(type as VeldSoort)) return null;
  let waarde: string;
  if (type === "PAGE") {
    const p = o.pagina(story, index); if (!p) return null;
    const notatie = /\\\*\s+(roman|ROMAN|alphabetic|ALPHABETIC|Arabic)\b/.exec(code)?.[1];
    waarde = notatie ? getal(p.nummer, notatie) : p.label ?? String(p.nummer);
  } else if (type === "NUMPAGES") waarde = getal(o.paginas, /\\\*\s+(\w+)/.exec(code)?.[1] ?? "Arabic");
  else if (type === "DATE" || type === "TIME") waarde = datumVeld(o.nu ?? new Date(), /\\@\s+"([^"]*)"/.exec(code)?.[1] ?? (type === "DATE" ? "yyyy-MM-dd" : "HH:mm"), o.locale);
  else waarde = type === "FILENAME" ? o.bestandsnaam.split(/[\\/]/).at(-1)! : type === "AUTHOR" ? o.auteur : o.titel;
  const hoofd = /\\\*\s+(Upper|Lower|Caps|FirstCap)\b/i.exec(code)?.[1]?.toLowerCase();
  if (hoofd === "upper") return waarde.toLocaleUpperCase(o.locale);
  if (hoofd === "lower") return waarde.toLocaleLowerCase(o.locale);
  if (hoofd === "caps") return waarde.replace(/\p{L}[\p{L}\p{M}]*/gu, w => w[0].toLocaleUpperCase(o.locale) + w.slice(1).toLocaleLowerCase(o.locale));
  if (hoofd === "firstcap") return waarde.charAt(0).toLocaleUpperCase(o.locale) + waarde.slice(1);
  return waarde;
}

export function veldPayload(soort: VeldSoort, o: VeldOmgeving, story: string, index: number, patroon?: string) {
  if (!VELDEN.includes(soort) || patroon?.includes('"') || (patroon?.length ?? 0) > 250) throw new Error("Invalid field instruction");
  const instruction = ` ${soort}${(soort === "DATE" || soort === "TIME") ? ` \\@ "${patroon ?? (soort === "DATE" ? "yyyy-MM-dd" : "HH:mm")}"` : ""} `;
  const displayText = veldWaarde(instruction, o, story, index) ?? "1";
  const field = { type: "simpleField", fieldType: soort, instruction, content: [{ type: "run", content: [{ type: "text", text: displayText }] }] };
  return { fieldType: soort, instruction, displayText, fieldKind: "simple", fieldData: JSON.stringify(field), fldLock: false, dirty: false, displayMode: "result", hasCachedResult: true, modelKind: "field" };
}

/** Fields are map-backed native embeds; insertion is one normal Undo step. */
export function voegVeldIn(s: YrsSession, range: YrsStoryRange, soort: VeldSoort, o: VeldOmgeving, patroon?: string) {
  const raw = s.locateParagraph(range.story, range.start.paraId).start + range.start.offset;
  const payload = veldPayload(soort, o, range.story, raw, patroon);
  s.addUndoBoundary(); s.beginUndoCapture();
  try {
    if (range.start.paraId !== range.end.paraId || range.start.offset !== range.end.offset) s.deleteRange(range);
    const index = s.locateParagraph(range.story, range.start.paraId).start + range.start.offset;
    s.applyRawOps(range.story, [{ op: "insertEmbed", index, kind: "field", payload }]);
    const head = { story: range.story, paraId: range.start.paraId, offset: range.start.offset + 1 };
    s.setSelection(head);
  } finally { s.addUndoBoundary(); }
}

/** Update every story, preserve locked/unknown fields and retain their instructions. */
export function werkVeldCachesBij(s: YrsSession, o: VeldOmgeving) {
  let gewijzigd = 0; const onopgelost: string[] = [], verhalen: string[] = [];
  s.addUndoBoundary(); s.beginUndoCapture();
  try {
    for (const story of s.storyIds()) {
      let index = 0; const ops: Parameters<YrsSession["applyRawOps"]>[1][number][] = [];
      for (const deel of s.storySegments(story)) {
        if (deel.kind === "embed" && deel.embedKind === "field" && !deel.payload.fldLock && !deel.attributes.del) {
          const code = String(deel.payload.instruction ?? ""), type = /^\s*([A-Za-z]+)/.exec(code)?.[1].toUpperCase();
          if (VELDEN.includes(type as VeldSoort)) {
            const waarde = veldWaarde(code, o, story, index);
            if (waarde === null) onopgelost.push(`${story}: ${code.trim()}`);
            else if (waarde !== deel.payload.displayText) {
              let model: Record<string, unknown>;
              try { model = JSON.parse(String(deel.payload.fieldData)); } catch { model = { type: deel.payload.fieldKind === "complex" ? "complexField" : "simpleField", fieldType: type, instruction: code }; }
              const sleutel = model.type === "complexField" ? "fieldResult" : "content";
              const oud = model[sleutel] as { type: string; formatting?: unknown; content?: { type: string }[] }[] | undefined;
              if (oud?.some(r => r.type !== "run" || r.content?.some(c => !["text", "tab"].includes(c.type)))) { onopgelost.push(`${story}: ${code.trim()}`); index++; continue; }
              const runs = [{ type: "run", ...(oud?.[0]?.formatting ? { formatting: oud[0].formatting } : {}), content: [{ type: "text", text: waarde }] }];
              model[sleutel] = runs;
              if (model.structuredResult && typeof model.structuredResult === "object") model.structuredResult = { ...model.structuredResult, inline: runs };
              if (model.fieldTree && typeof model.fieldTree === "object") { const tree = model.fieldTree as Record<string, unknown>; model.fieldTree = { ...tree, ...(tree.result && typeof tree.result === "object" ? { result: { ...tree.result, inline: runs } } : {}) }; }
              model.dirty = false;
              for (const [key, value] of Object.entries({ displayText: waarde, fieldData: JSON.stringify(model), hasCachedResult: true, dirty: false })) ops.push({ op: "setEmbedAttr", index, key, value });
              gewijzigd++;
            }
          }
        }
        index += deel.kind === "text" ? deel.text.length : 1;
      }
      if (ops.length) { s.applyRawOps(story, ops); verhalen.push(story); }
    }
  } finally { s.addUndoBoundary(); }
  return { gewijzigd, onopgelost, verhalen };
}
