/** Eén uitsluitend lezende plug-in per editor, gekoppeld aan diens eigen sessie. */
import { defineDocxPlugin, type DocxEditorRef, type DocxPluginContext } from "@betteroffice/docx-react";
import { leesAlleAlineas } from "../gedeeld/engine";
import { leesStatusGroepen, type StatusLeesKoppeling } from "./statusLeesgroepen";

type Context = DocxPluginContext<Record<string, never>>;
type Koppeling = StatusLeesKoppeling & { huidige: () => DocxEditorRef | null };
const koppelingen = new WeakMap<object, Koppeling>();
export const STATUS_LEES_PLUGIN = "openaec-statuslezing";

export function maakStatusLeesPlugin(huidige: () => DocxEditorRef | null) {
  let eigen: Koppeling | null = null;
  const verwijder = (k: Koppeling) => {
    if (koppelingen.get(k.sessie) === k) koppelingen.delete(k.sessie);
    if (eigen === k) eigen = null;
  };
  const koppel = (context: Context) => {
    const sessie = huidige()?.getEditorRef()?.getYrsSession();
    if (!sessie || context.lifetimeSignal.aborted) return;
    if (eigen?.sessie === sessie && eigen.generatie === context.snapshot.generation &&
        eigen.context.lifetimeSignal === context.lifetimeSignal) {
      eigen.context = context;
      return;
    }
    if (eigen) verwijder(eigen);
    const k: Koppeling = { context, sessie, generatie: context.snapshot.generation, huidige };
    eigen = k;
    koppelingen.set(sessie, k);
    context.onCleanup(() => verwijder(k));
  };
  return defineDocxPlugin<Record<string, never>>({
    id: STATUS_LEES_PLUGIN,
    createState: () => ({}),
    initialize: koppel,
    onEvent: koppel,
  });
}

/** Zonder gekoppelde plug-in blijft de bestaande openbare leesroute bruikbaar. */
export async function leesStatusAlineas(ref: DocxEditorRef, signal: AbortSignal) {
  if (signal.aborted) return null;
  const sessie = ref.getEditorRef()?.getYrsSession();
  if (!sessie) return null;
  const k = koppelingen.get(sessie);
  if (!k) {
    const alineas = await leesAlleAlineas(ref);
    return signal.aborted ? null : alineas;
  }
  const alineas = await leesStatusGroepen(k, k.huidige, undefined, signal);
  return !signal.aborted && koppelingen.get(sessie) === k ? alineas : null;
}
