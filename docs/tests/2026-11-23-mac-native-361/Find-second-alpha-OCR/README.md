# Repeated alpha OCR blocked before Find

Run 45165152644, QA a0700fbd187f83f8c28080691ce58d861fad56ff, unchanged P2. Artifact 14813697068; ZIP 90d21dfc0a3a18977228770c22d613cf8369677f1a87dead8f6d236dd3d88248.

The original first visible alpha click, native X entry, Command-save/XML and Undo/Redo/reset all passed. The redundant second OCR target of alpha was rejected: the real first-cell caret overlapped the word. The original display was inspected and the complete original OCR is retained. No Command-F or Find Undo was executed. This is a target acquisition fault, not a Find failure.

The independent route now reuses that already demonstrated genuine first-cell focus through preflight, gated by unchanged cells and strict same trusted PID, active/frontmost, actual Document input checks. No focus is injected and no OCR threshold or exact-word requirement changes. The table-case route still uses its original visible click when a different cell was previously active.
