"""Six synthetic UI inputs. No fixture is a native application result."""
from pathlib import Path
from email.message import EmailMessage
from email.policy import SMTP
from contextlib import closing
import hashlib
import json
import sqlite3
import zipfile

SEEDS = {name: "STANDALONE_" + name.upper() + "_SEED" for name in
         ("writer", "spreadsheet", "presentation", "email", "notition", "database")}
MARKERS = {name: "STANDALONE_" + name.upper() + "_EDIT" for name in SEEDS}
CONTROL = "STANDALONE_UNCHANGED_CONTROL"


def rewrite(template, target, member, transform):
    with zipfile.ZipFile(template) as source, zipfile.ZipFile(target, "w") as output:
        assert source.namelist().count(member) == 1
        for entry in source.infolist():
            raw = source.read(entry.filename)
            if entry.filename == member:
                raw = transform(raw.decode("utf-8")).encode("utf-8")
            output.writestr(entry, raw)


def create(output, templates):
    output, templates = Path(output).resolve(), Path(templates).resolve()
    output.mkdir(parents=True, exist_ok=False)
    writer = output / "writer.docx"
    def document(text):
        assert text.count("<w:p/>") == 1
        return text.replace("<w:p/>", "<w:p><w:r><w:t>" + SEEDS["writer"] + " " + CONTROL + "</w:t></w:r></w:p>")
    rewrite(templates / "nieuw.docx", writer, "word/document.xml", document)
    sheet = output / "spreadsheet.xlsx"
    def worksheet(text):
        assert text.count("<sheetData></sheetData>") == 1
        rows = ('<row r="1"><c r="A1" t="inlineStr"><is><t>' + SEEDS["spreadsheet"] + '</t></is></c></row>'
                '<row r="2"><c r="B2"><v>2</v></c><c r="C2"><f>SUM(B2,1)</f><v>3</v></c></row>'
                '<row r="3"><c r="A3" t="inlineStr"><is><t>' + CONTROL + '</t></is></c></row>')
        return text.replace("<sheetData></sheetData>", "<sheetData>"+rows+"</sheetData>").replace('ref="A1:A1"', 'ref="A1:C3"')
    rewrite(templates / "nieuw.xlsx", sheet, "xl/worksheets/sheet1.xml", worksheet)
    slides = output / "presentation.pptx"
    def slide(text):
        assert "Titel van de presentatie" in text and "Voeg een ondertitel toe" in text
        return text.replace("Titel van de presentatie", SEEDS["presentation"]).replace("Voeg een ondertitel toe", CONTROL)
    rewrite(templates / "nieuw.pptx", slides, "ppt/slides/slide1.xml", slide)
    mail = EmailMessage(policy=SMTP)
    mail["From"], mail["To"] = "fixture@example.invalid", "qa@example.invalid"
    mail["Subject"], mail["Message-ID"] = SEEDS["email"], "<standalone-seed@example.invalid>"
    mail["Date"] = "Mon, 23 Nov 2026 08:00:00 +0000"
    mail.set_content(SEEDS["email"] + "\n" + CONTROL)
    (output / "email.eml").write_bytes(mail.as_bytes())
    notes = {"formaat": "openaec-notities", "versie": 3, "boeken": [{"id": "qa_book", "naam": "Standalone QA",
             "secties": [{"id": "qa_section", "naam": "Own Markdown", "soort": "markdown", "paginas": [
                 {"id": "qa_page", "titel": "Standalone page", "bijgewerkt": "2026-11-23T08:00:00.000Z",
                  "vastgezet": False, "verwijderd": False, "vakken": [], "markdown": SEEDS["notition"]+"\n"+CONTROL}]}]}]}
    (output / "notition.openaec-notities").write_text(json.dumps(notes, ensure_ascii=False), encoding="utf-8")
    database = output / "database.sqlite"
    with closing(sqlite3.connect(database)) as connection:
        connection.execute("CREATE TABLE standalone_data(id INTEGER PRIMARY KEY, label TEXT NOT NULL, amount INTEGER NOT NULL)")
        connection.executemany("INSERT INTO standalone_data VALUES(?,?,?)", [(1, SEEDS["database"], 10), (2, "beta", 20), (3, CONTROL, 30)])
        connection.commit()
    files = {key: output / filename for key, filename in {"writer": "writer.docx", "spreadsheet": "spreadsheet.xlsx",
             "presentation": "presentation.pptx", "email": "email.eml", "notition": "notition.openaec-notities", "database": "database.sqlite"}.items()}
    receipt = {"kind": "Synthetic fixtures only; not native acceptance", "files": {
        key: {"path": str(path), "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
              "seed": SEEDS[key], "editMarker": MARKERS[key]} for key, path in files.items()}}
    (output / "fixture-receipt.json").write_text(json.dumps(receipt, indent=2)+"\n", encoding="utf-8")
    return receipt
