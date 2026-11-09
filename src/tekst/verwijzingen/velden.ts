import { ruw, type Sessie } from "../gedeeld/engine";
import type { Deel } from "./document";

export function veld(instruction: string, displayText: string, doel?: string) {
  const fieldType = instruction.trim().split(/\s/)[0].toUpperCase();
  const inline = [{ type: "run", ...(doel ? { formatting: { hyperlink: { href: `#${doel}` } } } : {}), content: [{ type: "text", text: displayText }] }];
  return { modelKind: "field", fieldKind: "simple", fieldType, instruction, displayText, displayMode: "result", hasCachedResult: true, dirty: false, fldLock: false,
    fieldData: JSON.stringify({ type: "simpleField", instruction, fieldType, content: inline, structuredResult: { inline }, fieldTree: { version: 1, result: { inline } } }) };
}
/** Keep the field's original instruction, type and result formatting. */
export function cache(s: Sessie, story: string, d: Deel, waarde: string, doel?: string) {
  const payload = d.payload!;
  const data = JSON.parse(String(payload.fieldData));
  const oud = data.type === "complexField" ? data.fieldResult : data.content;
  const formatting = oud?.find((x: { type: string }) => x.type === "run")?.formatting ?? data.formatting;
  const inline = [{ type: "run", ...(formatting ? { formatting } : {}), content: [{ type: "text", text: waarde }] }];
  if (doel) inline[0].formatting = { ...formatting, hyperlink: { href: `#${doel}` } };
  if (data.type === "complexField") data.fieldResult = inline; else data.content = inline;
  data.structuredResult = { ...data.structuredResult, inline };
  data.fieldTree = { ...data.fieldTree, version: 1, result: { ...data.fieldTree?.result, inline } };
  data.dirty = false;
  ruw(s, story, Object.entries({ displayText: waarde, hasCachedResult: true, dirty: false, fieldData: JSON.stringify(data) })
    .map(([key, value]) => ({ op: "setEmbedAttr", index: d.index, key, value })));
}
export function code(d: Deel) { return String(d.payload?.instruction ?? "").trim().match(/"[^"]*"|\\[^\s]+|[^\s]+/g)?.map(t => t.replace(/^"|"$/g, "")) ?? []; }
