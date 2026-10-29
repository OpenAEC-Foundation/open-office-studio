/**
 * Gedeelde toegang tot de lagere engine-API van @betteroffice/docx-react 0.4.3
 * (`getEditorRef()` → `PagedEditorRef`, `getYrsSession()`). Die API is
 * experimenteel; alles wat de Word-functies (#28, #29, #48, #49, #57) daarmee
 * doen loopt via deze hulpjes, zodat een engine-update op één plek te volgen is.
 *
 * Werkwijze bij een directe Yrs-bewerking:
 *  1. `begin(ref)` sluit de lopende ongedaan-maakstap af, zodat de bewerking
 *     niet samenvalt met eerder typen;
 *  2. de bewerking op de sessie (één of meer aanroepen in dezelfde taak worden
 *     door de engine als één ongedaan-maakstap vastgelegd);
 *  3. `klaar(...)` publiceert de wijziging naar de weergave (herindeling,
 *     selectie, onChange) en sluit de stap af.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import i18next from "../../i18n/config";

/** Sessie en weergave van de editor; gooit een begrijpelijke fout zonder document. */
export function engine(ref: DocxEditorRef | null) {
  const weergave = ref?.getEditorRef() ?? null;
  const sessie = weergave?.getYrsSession() ?? null;
  if (!ref || !weergave || !sessie) throw new Error(i18next.t("writer:general.documentNotReady"));
  return { ref, weergave, sessie };
}
export type Engine = ReturnType<typeof engine>;
export type Sessie = Engine["sessie"];

const vorigeModus = new WeakMap<object, string>();

/**
 * Begint één ongedaan-maakstap. In de modus `auto` maakt de engine per
 * verhaal (elke tabelcel is een verhaal) een eigen stap; tijdens onze
 * bewerking zetten we de modus op `manual`, zodat alles één stap wordt.
 */
export function begin(e: Engine) {
  try {
    // Sommige sessiebewerkingen (ruwe ops, acceptChange) starten de opname
    // niet zelf; zonder dit is zo'n eerste stap na het openen niet terug te draaien.
    e.sessie.beginUndoCapture();
    e.sessie.addUndoBoundary();
    vorigeModus.set(e.sessie, e.sessie.undoCaptureMode());
    e.sessie.setUndoCaptureMode("manual");
  } catch {
    // Oudere sessies kennen dit niet; dan valt de stap hooguit uiteen.
  }
}

/** Publiceert een directe sessiebewerking en sluit de ongedaan-maakstap af. */
export function klaar(e: Engine, verhalen: readonly string[] = ["body"], herindelen = true) {
  e.weergave.syncYrsInputState(true, [...new Set(verhalen)]);
  // Een gewijzigd embed-attribuut (tabelraster, rij-eigenschappen, beeld)
  // verandert de tekst van het verhaal niet; de indeling ziet dat pas na een
  // volledige herindeling.
  if (herindelen) e.weergave.relayout();
  sluitStap(e);
}

/** Sluit de ongedaan-maakstap af en zet de opnamemodus terug. */
export function sluitStap(e: Engine) {
  try {
    e.sessie.addUndoBoundary();
    const modus = vorigeModus.get(e.sessie);
    if (modus === "auto" || modus === "manual") e.sessie.setUndoCaptureMode(modus);
    vorigeModus.delete(e.sessie);
  } catch {
    // Zie begin().
  }
}

/** Voert een directe sessiebewerking uit als één ongedaan-maakstap. */
export function bewerk<T>(ref: DocxEditorRef | null, doe: (e: Engine) => { resultaat: T; verhalen: readonly string[] }) {
  const e = engine(ref);
  begin(e);
  const { resultaat, verhalen } = doe(e);
  klaar(e, verhalen);
  return resultaat;
}

/** De ingestelde auteursnaam (dezelfde sleutel als het opmerkingenvenster), of "". */
export function eigenAuteur() {
  try {
    return localStorage.getItem("open-tekst-auteur")?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Auteur voor bijgehouden wijzigingen. Zonder ingestelde naam een
 * standaardnaam in de interfacetaal van dat moment (zoals Word).
 */
export function auteur() {
  return eigenAuteur() || i18next.t("writer:general.unknownAuthor");
}

/** Het bijhouden-voorstel voor sessiebewerkingen in de modus Voorstellen. */
export function voorstel(ref: DocxEditorRef) {
  const modus = ref.commands.getState("editingMode").value;
  return modus === "suggesting" ? { name: auteur(), date: new Date().toISOString() } : undefined;
}

/**
 * Ruwe bewerkingen (`applyRawOps`) starten de ongedaan-maakopname niet zelf,
 * zoals de gewone sessiebewerkingen wel doen. Zonder deze aanroep is een ruwe
 * bewerking als eerste stap na het openen niet ongedaan te maken. De opname
 * starten is idempotent en kiest het verhaal voor de geschiedenis.
 */
export function vangOngedaanMaken(sessie: Sessie, verhaal: string) {
  (sessie.beginUndoCapture as (verhaal?: string) => void)(verhaal);
}

/** Ruwe bewerkingen op een verhaal, met ongedaan-maakopname. */
export function ruw(sessie: Sessie, verhaal: string, bewerkingen: readonly unknown[]) {
  vangOngedaanMaken(sessie, verhaal);
  sessie.applyRawOps(verhaal, bewerkingen as Parameters<Sessie["applyRawOps"]>[1]);
}

export const fout =(error: unknown) => (error instanceof Error ? error.message : String(error));
