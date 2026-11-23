# Bounded native Tab history passed

Run 45166342456, QA 985256d9390f5c4729ff4225d263d7fe71f8bf83, unchanged P2 source/package/fixture. Artifact 14815380479; ZIP 849901dc28b589dfe52d5031eadded2b048568ea585d2917eed74cf5ae3bd659.

After the same native X/save/Undo/Redo preflight and exactly three HID Tabs, the originally planned newrow text and Command-S saved exact4x3. Exactly two Undo and two Redo commands then ran with actual Document input/frontmost/PID guards and normal Command-save after each. Independent saved DOCX XML proves Undo1=empty row4, Undo2=original3x3, Redo1=empty row4, Redo2=row4 newrow. Every original cell remained unchanged, and all four saves produced changed file hashes. This observes the actual separate row and typing history operations; no combined single-Undo assumption or additional input retry was used.

The final original display was viewed and shows newrow beneath delta. Source fixture remains unchanged. The app quit normally and its owned container was removed. ZIP members and every native action's pinned driver/helper source/binary were checked.

The raw report remains diagnosticOnly=true/nativePass=false exactly as recorded; scoped Tab-history acceptance is derived from the four independent XML oracles together with original native evidence. Earlier AX3x3 failures remain preserved, with the separately observed AX/model difference recorded in Tab-save-oracle. No product correction, app rebuild, full issue361/modal or signed-final acceptance is claimed.
