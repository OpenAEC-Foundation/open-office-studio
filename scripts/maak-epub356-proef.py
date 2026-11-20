"""Deterministic, project-authored EPUB 3 fixture for #356 (no external books)."""
from pathlib import Path
import zipfile


def main():
    output = Path("docs/tests/epub356/leesvolgorde.epub")
    output.parent.mkdir(parents=True, exist_ok=True)
    files = {
        "mimetype": "application/epub+zip",
        "META-INF/container.xml": '''<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
<rootfiles><rootfile full-path="Boek/inhoud.opf" media-type="application/oebps-package+xml"/></rootfiles></container>''',
        "Boek/inhoud.opf": '''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:6b976295-1259-4784-b5c6-37eb27840bac</dc:identifier>
<dc:title>EPUB leesvolgordeproef</dc:title><dc:language>nl</dc:language><meta property="dcterms:modified">2026-11-16T00:00:00Z</meta></metadata>
<manifest><item id="tweede" href="hoofdstukken/tweede.xhtml" media-type="application/xhtml+xml"/>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="logo" href="media/beeld%20een.png" media-type="image/png"/>
<item id="eerste" href="hoofdstukken/eerste.xhtml" media-type="application/xhtml+xml"/>
<item id="stijl" href="stijl.css" media-type="text/css"/></manifest>
<spine><itemref idref="eerste"/><itemref idref="tweede"/></spine></package>''',
        "Boek/nav.xhtml": '''<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Inhoud</title></head><body><nav epub:type="toc"><ol><li><a href="hoofdstukken/eerste.xhtml">Eerste</a></li><li><a href="hoofdstukken/tweede.xhtml">Tweede</a></li></ol></nav></body></html>''',
        "Boek/hoofdstukken/tweede.xhtml": '''<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Tweede</title></head><body><h1>EPUB TWEEDE HOOFDSTUK</h1><p>Slottekst blijft na de tabel staan.</p><table><tr><th>Materiaal</th><th>Aantal</th></tr><tr><td>Hout</td><td>42</td></tr></table></body></html>''',
        "Boek/hoofdstukken/eerste.xhtml": '''<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Eerste</title><link rel="stylesheet" href="../stijl.css"/></head><body><h1>EPUB EERSTE HOOFDSTUK</h1><p>Café &amp; ideeën in de juiste leesvolgorde. <strong>Vette tekst</strong> en <em>cursieve tekst</em>.</p><ol><li>Eerste lijstpunt</li><li>Tweede lijstpunt</li></ol><p><img src="../media/beeld%20een.png" alt="EPUB proefafbeelding" width="32" height="32"/></p></body></html>''',
        "Boek/stijl.css": "body { font-family: serif; } h1 { color: #008000; }",
        "Boek/media/beeld een.png": Path("src-tauri/icons/32x32.png").read_bytes(),
    }
    with zipfile.ZipFile(output, "w") as archive:
        for name, data in files.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 16, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            archive.writestr(info, data.encode("utf-8") if isinstance(data, str) else data)
    print(output)


if __name__ == "__main__":
    main()
