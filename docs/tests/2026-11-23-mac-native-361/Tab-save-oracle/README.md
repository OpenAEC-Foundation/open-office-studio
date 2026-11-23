# Three-Tab independent saved model oracle

Run 45164433686, QA f64cfa30fbb3ec39fd799ddac10b9ba55c57c8be, unchanged P2 source/package/fixture. Artifact 14813093059; ZIP eaf722dc6197685b2c908d5c04d4e3f0e67886308743ef2f181eb81a5cbd416e.

The same native focus/typing/save/Undo/Redo preflight passed. Exactly three HID Tabs were posted from the visible delta target. Immediate AX still reported 3x3; no additional Tab, refocus or retry was sent. Only the originally planned newrow text and Command-S followed. Independent saved DOCX XML contains the exact original 3x3 cells plus a fourth row [newrow, empty, empty]. After Save AX also reports 4x3; the original full-display capture visibly shows newrow below delta. Source fixture hash is unchanged. The app quit normally and its owned container was removed.

Both earlier AX failures remain preserved. They do not establish that the document model lacked the row: this bounded follow-up demonstrates an AX/model observation difference before text input. It does not test row-versus-typing Undo/Redo, and nativePass remains false. No product correction or package rebuild was performed. All ZIP payloads and native action driver/helper source and binary identities were checked.
