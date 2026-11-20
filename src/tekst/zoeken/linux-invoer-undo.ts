import type { KeyboardEvent } from "react";

/** GTK3 does not bind these keys to the webview's existing input history.
 * Keep this compatibility mapping local to Writer's Find/Replace inputs;
 * the document editor owns its own history and must never receive it.
 */
export function linuxInvoerUndo(e: KeyboardEvent<HTMLInputElement>): boolean {
  if (
    typeof window === "undefined" || !("__TAURI_INTERNALS__" in window) ||
    typeof navigator === "undefined" || !/^linux/i.test(navigator.platform) ||
    e.defaultPrevented || !e.ctrlKey || e.metaKey || e.altKey ||
    e.nativeEvent.isComposing || e.currentTarget.readOnly || e.currentTarget.disabled
  ) return false;

  const key = e.key.toLowerCase();
  const command = key === "z" ? (e.shiftKey ? "redo" : "undo")
    : key === "y" && !e.shiftKey ? "redo" : null;
  const doc = e.currentTarget.ownerDocument;
  if (!command || doc.activeElement !== e.currentTarget || !doc.execCommand?.(command)) return false;

  // execCommand preserves native grouping/selection and emits input events,
  // so React's controlled value and the displayed field stay synchronized.
  e.preventDefault();
  e.stopPropagation();
  return true;
}
