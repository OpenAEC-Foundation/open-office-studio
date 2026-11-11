import type { DocxEditorRef } from "@betteroffice/docx-react";

/** Herlaadnavigatie mag een latere gebruikersselectie nooit terugzetten. */
export function maakDocxHerlaadDoel(paraId: string | undefined, invoer: EventTarget | undefined = typeof document === "undefined" ? undefined : document) {
  let gestart = false, gestopt = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (!gestart) return;
    gestopt = true;
    clearTimeout(timer);
    invoer?.removeEventListener("pointerdown", stop, true);
    invoer?.removeEventListener("keydown", stop, true);
  };
  return {
    stop,
    start(editor: DocxEditorRef | null) {
      if (!editor || !paraId || gestart || gestopt) return;
      gestart = true;
      invoer?.addEventListener("pointerdown", stop, true);
      invoer?.addEventListener("keydown", stop, true);
      const probeer = (resterend: number) => {
        if (gestopt) return;
        try {
          if (editor.scrollToParaId(paraId) || resterend <= 0) return stop();
          timer = setTimeout(() => probeer(resterend - 1), 250);
        } catch { stop(); }
      };
      void editor.whenLayoutComplete({ timeoutMs: 20000 }).catch(() => 0).then(() => probeer(8));
    },
  };
}
