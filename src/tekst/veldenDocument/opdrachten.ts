import type { DocxEditorRef } from "@betteroffice/docx-react";
import i18next from "../../i18n/config";
import { meldWijziging } from "../../lint/editorApi";
import { wachtendeEigenschappen } from "../info/opslaan";
import { leesEigenschappen } from "../info/docprops";
import { werkVeldCachesBij, type VeldOmgeving } from "./model";

const namen = new WeakMap<object, { naam: string; handle?: object; auteur?: string; titel?: string }>();
export function registreerVeldNaam(ref: DocxEditorRef, naam: string, handle?: object, bytes?: Uint8Array) {
  let kern: { auteur?: string; titel?: string } = {};
  if (bytes) { try { kern = leesEigenschappen(bytes); } catch { /* an already reported package error */ } }
  const metadata = { naam, handle, auteur: kern.auteur, titel: kern.titel };
  namen.set(ref, metadata);
  const s = ref.getEditorRef()?.getYrsSession(); if (s) namen.set(s, metadata);
}

/** Read layout without moving the user's cursor, including note and HF stories. */
export function veldOmgeving(ref: DocxEditorRef): VeldOmgeving {
  const ed = ref.getEditorRef(), s = ed?.getYrsSession(), layout = ed?.getLayout(), doc = ref.getDocument();
  if (!ed || !s || !doc) throw new Error(i18next.t("writer:styles.errors.notReady"));
  const pages = layout?.pages ?? [], verhalen = s.listStories().stories;
  const spans = new Map<string, { start: number; end: number; paraId: string }[]>();
  const metadata = namen.get(s) ?? namen.get(ref), wachtend = wachtendeEigenschappen(metadata?.handle);
  return { bestandsnaam: metadata?.naam ?? "", auteur: wachtend.auteur ?? metadata?.auteur ?? doc.package.properties?.creator ?? "", titel: wachtend.titel ?? metadata?.titel ?? doc.package.properties?.title ?? "", locale: i18next.language,
    paginas: pages.length || ref.getTotalPages(), pagina: (story, index) => {
      let lijst = spans.get(story);
      if (!lijst) { lijst = s.paragraphs(story).map(p => ({ ...s.locateParagraph(story, p.paraId), paraId: p.paraId })); spans.set(story, lijst); }
      const par = lijst.find(p => index >= p.start && index <= p.end);
      const pos = par ? ed.yrsLocToDisplayPosition({ story, paraId: par.paraId, offset: index - par.start }) : null;
      const info = verhalen.find(v => v.story === story), root = info?.root ?? story;
      const noot = /^(fn|en):(.+)$/.exec(root);
      const p = noot ? pages.find(p => p.noteAreas?.some(a => a.kind === (noot[1] === "fn" ? "footnote" : "endnote") && a.notes?.some(n => n.id === Number(noot[2]))))
        : info?.kind === "header" || info?.kind === "footer" || /^(?:hf|header|footer):/.test(root)
          ? pages.find(p => info?.uses?.some(u => u.sectionIndex === (p.sectionIndex ?? 0)))
          : pages.find(p => p.fragments.some(f => (par && String(f.blockId) === par.paraId) || (pos !== null && f.pmStart !== undefined && f.pmEnd !== undefined && pos >= f.pmStart && pos < f.pmEnd)));
      return p ? { nummer: p.sectionPageNumber ?? p.number, label: p.pageLabel } : null;
    } };
}

export type VeldBijwerker = (ref: DocxEditorRef) => Promise<{ gewijzigd: number; onopgelost: string[] }>;
const extra = new Set<VeldBijwerker>();
/** Other field owners can join F9 without replacing the document between updates. */
export function registreerVeldBijwerker(bijwerker: VeldBijwerker) { extra.add(bijwerker); return () => { extra.delete(bijwerker); }; }
const bezig = new WeakMap<DocxEditorRef, Promise<{ gewijzigd: number; onopgelost: string[] }>>();
export function werkDocumentVeldenBij(ref: DocxEditorRef) {
  const lopend = bezig.get(ref); if (lopend) return lopend;
  const werk = (async () => {
    await ref.flushPendingInput();
    await ref.whenLayoutComplete({ timeoutMs: 15000 }).catch(() => 0);
    const ed = ref.getEditorRef(), s = ed?.getYrsSession();
    if (!ed || !s) throw new Error(i18next.t("writer:styles.errors.notReady"));
    const nu = new Date(), result = werkVeldCachesBij(s, { ...veldOmgeving(ref), nu });
    if(result.gewijzigd)ed.syncYrsInputState(true,result.verhalen);
    for (const bijwerker of extra) { const r = await bijwerker(ref); result.gewijzigd += r.gewijzigd; result.onopgelost.push(...r.onopgelost); }
    if (result.gewijzigd) {
      ed.syncYrsInputState(true); meldWijziging(ref);
      // A longer title/date can change pagination. Refresh PAGE/NUMPAGES from
      // the resulting layout rather than persisting the previous page count.
      for (let ronde = 0; ronde < 2; ronde++) {
        await ref.flushPendingInput(); await ref.whenLayoutComplete({ timeoutMs: 15000 }).catch(() => 0);
        const nog = werkVeldCachesBij(s, { ...veldOmgeving(ref), nu });
        if(nog.gewijzigd)ed.syncYrsInputState(true,nog.verhalen);
        result.onopgelost.push(...nog.onopgelost);
        for (const bijwerker of extra) {
          const r = await bijwerker(ref);
          nog.gewijzigd += r.gewijzigd; result.onopgelost.push(...r.onopgelost);
        }
        if (!nog.gewijzigd) break;
        result.gewijzigd += nog.gewijzigd; ed.syncYrsInputState(true);
      }
    }
    await ref.flushPendingInput();
    return { gewijzigd: result.gewijzigd, onopgelost: [...new Set(result.onopgelost)] };
  })();
  bezig.set(ref, werk); void werk.finally(() => bezig.delete(ref)).catch(() => {}); return werk;
}
