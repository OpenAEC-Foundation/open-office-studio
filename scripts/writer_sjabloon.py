"""Vereenvoudig uitsluitend de eigen Writer-voorbeelden en lege sjablonen."""
from io import BytesIO
from pathlib import Path
import re
import sys
from zipfile import ZipFile

VERVANGERS = {
    "Calibri": "Carlito",
    "Cambria": "Caladea",
    "Courier": "Liberation Mono",
    "Courier New": "Liberation Mono",
}
FONTATTR = re.compile(rb'''(\b(?:w:)?(?:ascii|hAnsi|eastAsia|cs|name|typeface)=)(["'])([^"']+)\2''')


def normaliseer_writer_voorbeeld(inhoud: bytes) -> bytes:
    """Gebruik meegeleverde fonts; behoud gekoppelde XML-gegevens altijd."""
    with ZipFile(BytesIO(inhoud)) as bron:
        delen = [(info, bron.read(info.filename)) for info in bron.infolist()]
    gekoppeld = any(
        re.search(rb"<(?:\w+:)?dataBinding\b", data)
        for info, data in delen
        if info.filename.startswith("word/") and info.filename.endswith(".xml")
    )
    uit = BytesIO()
    with ZipFile(uit, "w") as doel:
        for info, data in delen:
            naam = info.filename
            if not gekoppeld and naam.startswith("customXml/"):
                continue
            if not gekoppeld and naam == "word/_rels/document.xml.rels":
                data = re.sub(
                    rb"<(?:\w+:)?Relationship\b[^>]*/>",
                    lambda m: b"" if re.search(rb'''\bType=["'][^"']*/customXml["']''', m[0]) else m[0],
                    data,
                )
            if not gekoppeld and naam == "[Content_Types].xml":
                data = re.sub(rb'''<(?:\w+:)?Override\b[^>]*\bPartName=["']/customXml/[^>]*?/>''', b"", data)
            if naam.startswith("word/") and naam.endswith(".xml"):
                def font(m):
                    waarde = m[3].decode("utf-8")
                    return m[1] + m[2] + VERVANGERS.get(waarde, waarde).encode("utf-8") + m[2]
                data = FONTATTR.sub(font, data)
            doel.writestr(info, data)
    return uit.getvalue()


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        pad = Path(arg)
        pad.write_bytes(normaliseer_writer_voorbeeld(pad.read_bytes()))
        print(f"Writer-voorbeeld vereenvoudigd: {pad}")
