"""Read the actual exported PDFs independently using pypdf."""
import json
import os
from pathlib import Path
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/os.environ.get("OFFICE_TEST_UIT",".local/proef-opmerkingen")
end=PdfReader(OUT/"comments-at-end.pdf")
displayed=PdfReader(OUT/"comments-displayed.pdf")
text="\n".join(p.extract_text() for p in end.pages)
visible="\n".join(p.extract_text() for p in displayed.pages)
checks={
    "pageCounts":len(end.pages)==2 and len(displayed.pages)==1,
    "threadAndReply":all(s in text for s in ["B3","Anna","A question for the project","Renée","Reply with Unicode: café & ideas"]),
    "classicNotes":all(s in text for s in ["D6","Visible classic note","E7","Hidden classic note"]),
    "asDisplayedIncludesVisibleOnly":"Visible classic note" in visible and "Hidden classic note" not in visible and "A question for the project" not in visible,
    "cellPayload":"Cell payload" in text and "Cell payload" in visible,
}
report={"checks":checks,"pass":all(checks.values())}
(OUT/"pdf-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
(OUT/"pdf-extracted.txt").write_text(text,encoding="utf8")
print(json.dumps(report))
assert report["pass"],report
