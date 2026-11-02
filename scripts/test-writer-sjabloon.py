"""Controleer voorbeelden zonder inhoud te verliezen of bindings te verwijderen."""
import unittest
from io import BytesIO
from zipfile import ZipFile
from pathlib import Path
from xml.etree import ElementTree as ET
from writer_sjabloon import normaliseer_writer_voorbeeld

W = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

def inhoud(delen):
    b = BytesIO()
    with ZipFile(b, "w") as z:
        for k, v in delen.items(): z.writestr(k, v)
    return b.getvalue()

def delen(data):
    with ZipFile(BytesIO(data)) as z: return {n: z.read(n) for n in z.namelist()}

class WriterVoorbeeld(unittest.TestCase):
    def test_gekoppelde_gegevens_blijven(self):
        bron = {"word/document.xml": '<w:document xmlns:w="urn:proef"><w:dataBinding w:storeItemID="id"/></w:document>', "customXml/item1.xml": "<waarde>bewaren</waarde>"}
        self.assertEqual(delen(normaliseer_writer_voorbeeld(inhoud(bron)))["customXml/item1.xml"], b"<waarde>bewaren</waarde>")

    def test_alleen_ongekoppelde_xml_en_fontnamen(self):
        bron = {"word/document.xml": '<w:document xmlns:w="urn:proef"><w:rFonts w:ascii="Calibri"/><w:t>Voorbeeldtekst</w:t></w:document>', "customXml/item1.xml": "<leeg/>", "word/_rels/document.xml.rels": '<Relationships><Relationship Id="r1" Type="x/customXml" Target="../customXml/item1.xml"/><Relationship Id="r2" Type="x/styles" Target="styles.xml"/></Relationships>', "[Content_Types].xml": '<Types><Override PartName="/customXml/item1.xml" ContentType="x"/></Types>', "onbekend.bin": b"ongewijzigd"}
        uit = delen(normaliseer_writer_voorbeeld(inhoud(bron)))
        self.assertNotIn("customXml/item1.xml", uit)
        self.assertNotIn(b"x/customXml", uit["word/_rels/document.xml.rels"])
        self.assertIn(b"x/styles", uit["word/_rels/document.xml.rels"])
        self.assertIn(b'"Carlito"', uit["word/document.xml"])
        self.assertEqual(uit["onbekend.bin"], b"ongewijzigd")
        self.assertIn(b"Voorbeeldtekst", uit["word/document.xml"])
        for n in ["word/document.xml", "word/_rels/document.xml.rels", "[Content_Types].xml"]: ET.fromstring(uit[n])

    def test_repo_voorbeelden(self):
        root = Path(__file__).resolve().parents[1]
        for naam in ["docs/voorbeelden/Ontwerpnotitie.docx", "public/templates/nieuw.docx"]:
            with self.subTest(naam=naam):
                uit = delen((root/naam).read_bytes())
                self.assertFalse(any(n.startswith("customXml/") for n in uit))
                for n, data in uit.items():
                    if n.endswith(".xml") or n.endswith(".rels"): ET.fromstring(data)
                self.assertEqual(normaliseer_writer_voorbeeld((root/naam).read_bytes()), (root/naam).read_bytes())

if __name__ == "__main__": unittest.main()
