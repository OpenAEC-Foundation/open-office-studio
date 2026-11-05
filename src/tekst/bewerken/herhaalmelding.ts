/**
 * Lintknoppen melden hier welke engine-opdracht ze uitvoerden, zodat F4 (en
 * Ctrl+Y zonder iets om opnieuw te doen) ook een via het lint gekozen opmaak
 * herhaalt. `TekstBewerken` levert de ontvanger.
 */
import { createContext, useContext } from "react";
import { useEditorApi } from "../../lint/editorApi";
import { wisselOpsomming } from "../lijst/opsomming";

export const Herhaalmelding = createContext<(id: string, args: unknown) => void>(() => {});

type Uitvoerbaar = { execute: (args?: never) => Promise<unknown> };

/** Dezelfde opdracht, maar die bij uitvoeren meldt dat hij herhaald kan worden. */
export function useHerhaalbaar<O extends Uitvoerbaar>(id: string, opdracht: O, vasteArgs?: unknown): O {
  const meld = useContext(Herhaalmelding);
  const api = useEditorApi().tekst;
  return {
    ...opdracht,
    execute: async (args?: never) => {
      meld(id, args ?? vasteArgs ?? null);
      if (id === "bulletList" && await wisselOpsomming(api())) return { ok: true, status: "executed" };
      return opdracht.execute(args);
    },
  };
}
