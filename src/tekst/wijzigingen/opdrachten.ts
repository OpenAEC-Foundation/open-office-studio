/**
 * Wijzigingen accepteren en weigeren in bulk (#28) via de Yrs-sessie:
 * `listRevisions`, `acceptChange`/`rejectChange` per revisie of voor een
 * bereik. Alles in één ongedaan-maakstap. Daarnaast de alleen-lezen
 * voorbeelden voor de markeringsweergaven (geen markeringen, origineel).
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import i18next from "../../i18n/config";
import { begin, engine, klaar, type Sessie } from "../gedeeld/engine.ts";
import { getoond, inSelectie, type Revisie } from "./logica.ts";

export function revisies(s: Sessie): Revisie[] {
  return s.listRevisions() as Revisie[];
}

export function lijst(ref: DocxEditorRef | null): Revisie[] {
  try {
    return revisies(engine(ref).sessie);
  } catch {
    return [];
  }
}

export type Besluit = "accepteren" | "weigeren";
export interface Reikwijdte {
  /** Alleen wijzigingen die (deels) in de selectie liggen. */
  selectie?: boolean;
  /** Verborgen auteurs: hun wijzigingen blijven staan (zoals ‘alle getoonde wijzigingen’ in Word). */
  verborgen?: ReadonlySet<string>;
  /** Precies deze revisies. */
  ids?: readonly string[];
}

/** Accepteert of weigert wijzigingen; geeft het aantal afgehandelde revisies. */
export function besluit(ref: DocxEditorRef | null, wat: Besluit, reikwijdte: Reikwijdte = {}): number {
  const e = engine(ref);
  const s = e.sessie;
  let doel = getoond(revisies(s), reikwijdte.verborgen ?? new Set());
  if (reikwijdte.ids) {
    const ids = new Set(reikwijdte.ids);
    doel = doel.filter((r) => ids.has(r.revisionId));
  }
  if (reikwijdte.selectie) {
    const sel = s.selection();
    if (!sel) throw new Error(i18next.t("writer:changes.selectFirst"));
    const volgordes = new Map<string, Map<string, number>>();
    const volgorde = (story: string, paraId: string) => {
      let m = volgordes.get(story);
      if (!m) {
        m = new Map(s.paragraphs(story).map((p, i) => [p.paraId, i]));
        volgordes.set(story, m);
      }
      return m.get(paraId) ?? -1;
    };
    doel = doel.filter((r) => inSelectie(r, sel.anchor, sel.head, volgorde));
  }
  if (!doel.length) return 0;
  const verhalen = new Set<string>();
  const afgehandeld = new Set<string>();
  begin(e);
  try {
    for (const r of doel) {
      if (afgehandeld.has(r.revisionId)) continue;
      const ontvangst = wat === "accepteren" ? s.acceptChange({ revisionId: r.revisionId }) : s.rejectChange({ revisionId: r.revisionId });
      ontvangst.revisionIds.forEach((id) => afgehandeld.add(id));
      afgehandeld.add(r.revisionId);
      verhalen.add(r.story);
    }
  } finally {
    klaar(e, [...verhalen], false);
  }
  return afgehandeld.size;
}

/**
 * Een kopie van het document met alle wijzigingen geaccepteerd (geen
 * markeringen) of geweigerd (origineel), voor het alleen-lezen voorbeeld.
 * Geeft ook de alinea's (paraId) waar iets veranderde, voor de streep in de
 * marge bij ‘eenvoudige markering’.
 */
export async function voorbeeld(bytes: Uint8Array, wat: Besluit) {
  const s = await createYrsSession();
  try {
    s.openDocx(bytes, true);
    const lijst = revisies(s);
    const gewijzigd = new Set<string>();
    for (const r of lijst) {
      if (r.range.story === "body") {
        gewijzigd.add(r.range.start.paraId);
        gewijzigd.add(r.range.end.paraId);
      }
    }
    for (const r of lijst) {
      try {
        if (wat === "accepteren") s.acceptChange({ revisionId: r.revisionId });
        else s.rejectChange({ revisionId: r.revisionId });
      } catch {
        // Al afgehandeld als deel van een eerdere revisie.
      }
    }
    const opgeslagen = await saveYrsDocx(s);
    return { bytes: opgeslagen.bytes, gewijzigd: [...gewijzigd], aantal: lijst.length };
  } finally {
    s.destroy?.();
  }
}
