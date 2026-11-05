import { describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { gaNaarPagina, paginaDoelen } from "./ganaar";

function proef(pages: unknown[]) {
  const setSelection = vi.fn();
  const scrollToPage = vi.fn();
  const focus = vi.fn();
  const ref = {
    getEditorRef: () => ({ getYrsSession: () => ({}), getLayout: () => ({ pages }), setSelection }),
    getTotalPages: () => pages.length,
    scrollToPage, focus,
  } as unknown as DocxEditorRef;
  return { ref, setSelection, scrollToPage, focus };
}

describe("ga naar het begin van een pagina (#127)", () => {
  it("plaatst de cursor voor de eerste tekst, onafhankelijk van de oude cursor", () => {
    const p = proef([{ fragments: [{ kind: "paragraph", pmStart: 1 }] }]);
    paginaDoelen(p.ref)[0].ga(p.ref);
    expect(p.setSelection).toHaveBeenCalledWith(1);
    expect(p.focus).toHaveBeenCalledOnce();
    expect(p.scrollToPage).toHaveBeenCalledWith(1);
  });
  it("gebruikt bij een doorlopende alinea de eerste regel op de gekozen pagina", () => {
    const p = proef([
      { fragments: [{ kind: "paragraph", pmStart: 1 }] },
      { fragments: [{ kind: "paragraph", pmStart: 1, resolvedLines: [{ segments: [{ run: { pmStart: 84 } }] }] }] },
    ]);
    gaNaarPagina(p.ref, 2);
    expect(p.setSelection).toHaveBeenCalledWith(84);
    expect(p.scrollToPage).toHaveBeenCalledWith(2);
  });
  it("vindt op een lege alinea en een lege tussenpagina een invoegpositie", () => {
    const p = proef([
      { fragments: [{ kind: "paragraph", pmStart: 1, pmEnd: 12 }] },
      { fragments: [] },
      { fragments: [{ kind: "paragraph", pmStart: 13 }] },
    ]);
    gaNaarPagina(p.ref, 2);
    expect(p.setSelection).toHaveBeenLastCalledWith(13);
    gaNaarPagina(p.ref, 3);
    expect(p.setSelection).toHaveBeenLastCalledWith(13);
  });
  it("verandert niets bij een onbekende pagina of ontbrekende indeling", () => {
    const p = proef([]);
    gaNaarPagina(p.ref, 1);
    gaNaarPagina(p.ref, 0);
    expect(p.setSelection).not.toHaveBeenCalled();
    expect(p.scrollToPage).not.toHaveBeenCalled();
  });
});
