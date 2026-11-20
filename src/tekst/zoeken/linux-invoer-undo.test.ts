import type { KeyboardEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linuxInvoerUndo } from "./linux-invoer-undo";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.stubGlobal("navigator", { platform: "Linux x86_64" });
  const doc = { activeElement: null as unknown, execCommand: vi.fn(() => true) };
  const input = { ownerDocument: doc, readOnly: false, disabled: false };
  doc.activeElement = input;
  const e = {
    key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
    defaultPrevented: false, nativeEvent: { isComposing: false }, currentTarget: input,
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
  };
  return { doc, input, e, run: () => linuxInvoerUndo(e as unknown as KeyboardEvent<HTMLInputElement>) };
}

describe("Linux Find/Replace input history", () => {
  it.each([
    ["z", false, "undo"], ["Z", false, "undo"],
    ["z", true, "redo"], ["y", false, "redo"],
  ] as const)("maps Ctrl%s+%s to native %s", (key, shift, command) => {
    const c = setup(); c.e.key = key; c.e.shiftKey = shift;
    expect(c.run()).toBe(true);
    expect(c.doc.execCommand).toHaveBeenCalledExactlyOnceWith(command);
    expect(c.e.preventDefault).toHaveBeenCalledOnce();
    expect(c.e.stopPropagation).toHaveBeenCalledOnce();
  });

  it.each(["Win32", "MacIntel"])("preserves platform history on %s", (platform) => {
    const c = setup(); vi.stubGlobal("navigator", { platform });
    expect(c.run()).toBe(false); expect(c.doc.execCommand).not.toHaveBeenCalled();
  });
  it("preserves the supported Linux browser's own shortcut handling", () => {
    const c = setup(); vi.stubGlobal("window", {});
    expect(c.run()).toBe(false); expect(c.doc.execCommand).not.toHaveBeenCalled();
  });
  it.each(["handled", "no-ctrl", "meta", "alt", "composing", "readonly", "disabled", "other-focus", "other-key", "shift-y"])(
    "does not consume history outside the focused editable input: %s", (kind) => {
      const c = setup();
      if (kind === "handled") c.e.defaultPrevented = true;
      if (kind === "no-ctrl") c.e.ctrlKey = false;
      if (kind === "meta") c.e.metaKey = true;
      if (kind === "alt") c.e.altKey = true;
      if (kind === "composing") c.e.nativeEvent.isComposing = true;
      if (kind === "readonly") c.input.readOnly = true;
      if (kind === "disabled") c.input.disabled = true;
      if (kind === "other-focus") c.doc.activeElement = {};
      if (kind === "other-key") c.e.key = "a";
      if (kind === "shift-y") { c.e.key = "y"; c.e.shiftKey = true; }
      expect(c.run()).toBe(false);
      expect(c.doc.execCommand).not.toHaveBeenCalled();
      expect(c.e.preventDefault).not.toHaveBeenCalled();
      expect(c.e.stopPropagation).not.toHaveBeenCalled();
    },
  );
  it("leaves an unavailable native history command unconsumed", () => {
    const c = setup(); c.doc.execCommand.mockReturnValue(false);
    expect(c.run()).toBe(false);
    expect(c.e.preventDefault).not.toHaveBeenCalled();
    expect(c.e.stopPropagation).not.toHaveBeenCalled();
  });
});
