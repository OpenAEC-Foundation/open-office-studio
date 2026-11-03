import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Vervanging } from "../../lint/tekst-logica";
import { begin, engine, klaar } from "../gedeeld/engine";
import { naarRauw, type Segment } from "../../spelling/tekst/sessie";

/**
 * De batch-API accepteert maximaal 128 stappen. Lange selecties worden eerst
 * volledig gevalideerd en daarna via de sessie in één Undo-stap vervangen.
 * Achteraan beginnen houdt UTF-16-posities geldig bij veranderende tekenlengtes.
 */
export async function vervangHoofdletters(
  ref: DocxEditorRef,
  alinea: { story: string; paraId: string },
  versie: string,
  vervangingen: readonly Vervanging[],
  suggest?: { author: string; date: string },
): Promise<boolean> {
  const steps = vervangingen.map((v) => ({
    op: "replaceText" as const,
    target: {
      kind: "range" as const,
      story: alinea.story,
      start: { paraId: alinea.paraId, offset: v.begin },
      end: { paraId: alinea.paraId, offset: v.eind },
      view: "accepted" as const,
    },
    text: v.tekst,
    ...(suggest ? { suggest } : {}),
  }));
  if (steps.length <= 128)
    return (await ref.applyEdits({ expectVersion: versie, steps })).ok;

  for (let i = 0; i < steps.length; i += 128) {
    const controle = await ref.validateEdits({
      expectVersion: versie,
      steps: steps.slice(i, i + 128),
    });
    if (!controle.ok) return false;
  }
  const e = engine(ref);
  if (e.sessie.version() !== versie) return false;
  // De sessie telt ook verborgen verwijderingen en tabel-embeds mee.
  // De gevalideerde batchposities verwijzen naar de geaccepteerde tekst.
  let segmenten: Segment[] = [];
  let gevonden = false;
  for (const deel of e.sessie.storySegments(alinea.story)) {
    if (deel.kind === "pilcrow") {
      if (deel.paraId === alinea.paraId) {
        gevonden = true;
        break;
      }
      segmenten = [];
    } else segmenten.push(deel);
  }
  if (!gevonden) return false;
  const rauweStappen = steps.map((stap) => ({
    ...stap,
    bereik: {
      story: alinea.story,
      start: {
        paraId: alinea.paraId,
        offset: naarRauw(segmenten, stap.target.start.offset),
      },
      end: {
        paraId: alinea.paraId,
        offset: naarRauw(segmenten, stap.target.end.offset, true),
      },
    },
  }));
  begin(e);
  try {
    for (const stap of rauweStappen.reverse()) {
      e.sessie.replaceRange(
        stap.bereik,
        stap.text,
        suggest ? { name: suggest.author, date: suggest.date } : undefined,
      );
    }
  } finally {
    klaar(e, [alinea.story]);
  }
  return true;
}
