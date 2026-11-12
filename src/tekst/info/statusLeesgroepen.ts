/** Voorbereide statuslezer; pas koppelen na native kandidaatcontrole. */
import type { DocxParagraphText } from "@betteroffice/docx";
import type { DocxEditorRef, DocxPluginContext } from "@betteroffice/docx-react";

type Sessie = NonNullable<ReturnType<NonNullable<ReturnType<DocxEditorRef["getEditorRef"]>>["getYrsSession"]>>;
/** De plug-in moet deze koppeling bij het laden voor zijn eigen editor maken. */
export interface StatusLeesKoppeling {
  context: DocxPluginContext<Record<string, never>>;
  sessie: Sessie;
  generatie: string;
}

/** Geen gedeeltelijke telling: ongeldigheid, weigering en afkapping geven null. */
export async function leesStatusGroepen(
  koppeling: StatusLeesKoppeling,
  huidige: () => DocxEditorRef | null,
  wacht: () => Promise<void> = () => new Promise(klaar => setTimeout(klaar, 0)),
  signal?: AbortSignal,
): Promise<DocxParagraphText[] | null> {
  const { context, sessie, generatie } = koppeling;
  let versie: string;
  const geldig = () => {
    const weergave = huidige()?.getEditorRef();
    return !!versie && !signal?.aborted && !context.lifetimeSignal.aborted && context.snapshot.generation === generatie &&
      weergave?.getYrsSession() === sessie && !weergave.hasPendingInput() && sessie.version() === versie;
  };
  let resultaat: DocxParagraphText[] | null = null;
  let laatsteControle = () => false;
  try {
    versie = sessie.version();
    if (!geldig()) return null;
    const verhalen = sessie.storyIds().filter(id => id === "body" || /^body:t\d+:r\d+c\d+/.test(id));
    if (!verhalen.includes("body")) verhalen.unshift("body");
    if (new Set(verhalen).size !== verhalen.length) return null;
    await context.run(async vers => {
      const actueel = () => geldig() && !vers.lifetimeSignal.aborted && vers.snapshot.generation === generatie;
      laatsteControle = actueel;
      const gelezen: DocxParagraphText[] = [];
      for (let i = 0; i < verhalen.length; i += 32) {
        if (!actueel()) return;
        const ids = verhalen.slice(i, i + 32);
        const groep = await vers.read.readStories({ view: "accepted", stories: ids, expectVersion: versie });
        if (!actueel() || !groep.ok || groep.truncated || groep.view !== "accepted" || groep.version !== versie) return;
        const perVerhaal = new Map(groep.stories.map(r => [r.story, r]));
        if (groep.stories.length !== ids.length || perVerhaal.size !== ids.length) return;
        for (const story of ids) {
          const r = perVerhaal.get(story);
          if (!r?.ok || r.paragraphs.some(p => p.story !== story)) return;
          gelezen.push(...r.paragraphs);
        }
        if (i + 32 < verhalen.length) await wacht();
      }
      if (actueel()) resultaat = gelezen;
    });
    return laatsteControle() ? resultaat : null;
  } catch { return null; }
}
