import { describe, expect, it, vi } from "vitest";
import { kolomMetDocumentfocus } from "./tekst-kolomfocus";

function context() {
  const editor = { focus: vi.fn() };
  const lint = {
    closest: () => ({}),
    matches: () => false,
  } as unknown as Element;
  return {
    editor,
    lint,
    invoer: {
      editor: () => editor,
      eigenaar: () => editor,
      zichtbaar: () => true,
      actief: () => lint as Element | null,
      dialoogOpen: () => false,
    },
  };
}

describe("Writer column command focus", () => {
  it("restores document focus after a successful command from unchanged ribbon focus", async () => {
    const c = context();
    const result = { ok: true };
    expect(await kolomMetDocumentfocus(async () => result, c.invoer)).toBe(
      result,
    );
    expect(c.editor.focus).toHaveBeenCalledOnce();
  });
  it.each([
    "failed",
    "hidden",
    "other-editor",
    "other-focus",
    "dialog",
    "input",
    "body",
  ])("does not steal focus: %s", async (kind) => {
    const c = context();
    if (kind === "hidden") c.invoer.zichtbaar = () => false;
    if (kind === "dialog") c.invoer.dialoogOpen = () => true;
    if (kind === "input") c.lint.matches = () => true;
    if (kind === "body") c.lint.closest = () => null;
    await kolomMetDocumentfocus(async () => {
      if (kind === "other-editor")
        c.invoer.eigenaar = () => ({ focus: vi.fn() });
      if (kind === "other-focus") c.invoer.actief = () => null;
      return { ok: kind !== "failed" };
    }, c.invoer);
    expect(c.editor.focus).not.toHaveBeenCalled();
  });
  it("uses the updated SDK ref when the document owner is unchanged", async () => {
    const c = context();
    const updated = { focus: vi.fn() };
    await kolomMetDocumentfocus(async () => {
      c.invoer.editor = () => updated;
      return { ok: true };
    }, c.invoer);
    expect(updated.focus).toHaveBeenCalledOnce();
    expect(c.editor.focus).not.toHaveBeenCalled();
  });
  it("leaves rejected commands to the existing error handler", async () => {
    const c = context();
    await expect(
      kolomMetDocumentfocus(async () => {
        throw Error("failure");
      }, c.invoer),
    ).rejects.toThrow("failure");
    expect(c.editor.focus).not.toHaveBeenCalled();
  });
});
