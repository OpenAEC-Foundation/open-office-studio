import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { DocxEditor, type DocxEditorRef } from "@betteroffice/docx-react";
import type { AfdrukDocument, AfdrukPagina } from "../../afdrukken/model";
import { tekstPaginas } from "../../afdrukken/bronTekst";
import { canvasNaarBlob } from "../../afdrukken/afdrukframe";
import { registreerVeldNaam } from "../veldenDocument/opdrachten";

let wachtrij: Promise<unknown> = Promise.resolve();
function controleer(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); }

/** Render a generated copy in an isolated editor; never replace the open template. */
export function maakSamenvoegPaginas(bytes: Uint8Array, naam: string, signal?: AbortSignal): Promise<AfdrukDocument> {
  const werk = async () => {
    controleer(signal);
    const vlak = document.createElement("div");
    vlak.style.cssText = "position:fixed;left:-20000px;top:0;width:1200px;height:1600px;overflow:hidden;pointer-events:none";
    vlak.setAttribute("aria-hidden", "true"); vlak.setAttribute("inert", ""); document.body.append(vlak);
    const root = createRoot(vlak), ref = createRef<DocxEditorRef>(); let error: Error | null = null;
    try {
      root.render(<DocxEditor legacySyncApi ref={ref} documentBuffer={bytes} showToolbar={false} showFileOpen={false} showHelpMenu={false} showRuler={false} showOutline={false} downloadOnSave={false} colorMode="light" onError={e => { error = e; }} />);
      const begin = Date.now();
      while (!ref.current?.getEditorRef()?.getYrsSession()) {
        controleer(signal); if (error) throw error;
        if (Date.now() - begin > 60000) throw new Error("mailMerge.errors.render");
        await new Promise(r => setTimeout(r, 50));
      }
      const api = ref.current!; registreerVeldNaam(api, naam, undefined, bytes);
      await api.whenLayoutComplete({ timeoutMs: 60000 }); controleer(signal);
      const doc = await tekstPaginas(api, naam), paginas: AfdrukPagina[] = [];
      for (const pagina of doc.paginas) {
        controleer(signal);
        const beeld = await pagina.teken(192), blob = await canvasNaarBlob(beeld.canvas);
        const { tekst, koppelingen } = beeld;
        const { breedte, hoogte, label } = pagina;
        paginas.push({ breedte, hoogte, label, teken: async dpi => {
          const canvas = document.createElement("canvas"); canvas.width = Math.ceil(breedte * dpi / 72); canvas.height = Math.ceil(hoogte * dpi / 72);
          const bitmap = await createImageBitmap(blob);
          try { canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); } finally { bitmap.close(); }
          return { canvas, tekst, koppelingen };
        } });
      }
      return { ...doc, paginas };
    } finally { root.unmount(); vlak.remove(); }
  };
  const result = wachtrij.then(werk, werk); wachtrij = result.catch(() => {}); return result;
}
