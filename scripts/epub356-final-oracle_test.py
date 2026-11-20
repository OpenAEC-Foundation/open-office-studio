"""Contract checks for the independent oracle; no app/engine execution."""
import importlib.util
import io
from pathlib import Path
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("oracle", Path(__file__).with_name("epub356-final-oracle.py"))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


def book(**changes):
    with zipfile.ZipFile(ROOT / "docs/tests/epub356/leesvolgorde.epub") as source:
        image = source.read("Boek/media/beeld een.png")
    w, a, r = oracle.W[1:-1], "http://schemas.openxmlformats.org/drawingml/2006/main", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    text = changes.get("text", "EPUB EERSTE HOOFDSTUK|Café &amp; ideeën|Vette tekst|cursieve tekst|Eerste lijstpunt|EPUB TWEEDE HOOFDSTUK")
    paragraphs = "".join("<w:p><w:r><w:t>" + t + "</w:t></w:r></w:p>" for t in text.split("|"))
    files = {"[Content_Types].xml": b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
             "word/document.xml": (f'<w:document xmlns:w="{w}" xmlns:a="{a}" xmlns:r="{r}"><w:body>{paragraphs}<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Hout</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>42</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><a:blip r:embed="image1"/></w:drawing></w:r></w:p></w:body></w:document>').encode(),
             "word/media/image1.png": image,
             "word/_rels/document.xml.rels": b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="image1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>'}
    files.update(changes.get("files", {}))
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return result.getvalue()


class Oracle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "docs/tests/epub356/leesvolgorde.epub").read_bytes()

    def test_positive_and_no_source_mutation(self):
        before = bytes(self.source)
        result = oracle.validate(self.source, book())
        self.assertEqual(result["status"], "passed")
        self.assertEqual(self.source, before)
        self.assertIn("not native visual", result["scope"])

    def test_changed_original_rejected(self):
        with self.assertRaisesRegex(ValueError, "fixture hash"):
            oracle.validate(self.source + b"x", book())

    def test_reversed_or_missing_content_rejected(self):
        for text in ["EPUB TWEEDE HOOFDSTUK|EPUB EERSTE HOOFDSTUK", "EPUB EERSTE HOOFDSTUK|EPUB TWEEDE HOOFDSTUK"]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                oracle.validate(self.source, book(text=text))

    def test_changed_or_unreferenced_image_rejected(self):
        for changes in [{"word/media/image1.png": b"wrong"}, {"word/_rels/document.xml.rels": b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'}]:
            with self.subTest(changes=list(changes)), self.assertRaisesRegex(ValueError, "PNG"):
                oracle.validate(self.source, book(files=changes))

    def test_wrong_image_relationship_type_rejected(self):
        with zipfile.ZipFile(io.BytesIO(book())) as z:
            rels = z.read("word/_rels/document.xml.rels")
        with self.assertRaisesRegex(ValueError, "image relationship"):
            oracle.validate(self.source, book(files={"word/_rels/document.xml.rels": rels.replace(b"/image\"", b"/hyperlink\"")}))

    def test_table_values_in_different_rows_rejected(self):
        with zipfile.ZipFile(io.BytesIO(book())) as z:
            document = z.read("word/document.xml")
        document = document.replace(b"</w:tc><w:tc>", b"</w:tc></w:tr><w:tr><w:tc>")
        with self.assertRaisesRegex(ValueError, "same table row"):
            oracle.validate(self.source, book(files={"word/document.xml": document}))

    def test_external_link_and_macro_rejected(self):
        for changes in [{"word/vbaProject.bin": b"not-allowed"}, {"word/_rels/document.xml.rels": b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link" Target="https://example.invalid" TargetMode="External"/></Relationships>'}]:
            with self.subTest(changes=list(changes)), self.assertRaises(ValueError):
                oracle.validate(self.source, book(files=changes))

    def test_embedded_active_element_rejected(self):
        with zipfile.ZipFile(io.BytesIO(book())) as z:
            document = z.read("word/document.xml")
        with self.assertRaisesRegex(ValueError, "active/imported"):
            oracle.validate(self.source, book(files={"word/document.xml": document.replace(b"</w:body>", b"<w:object/></w:body>")}))

    def test_missing_table_cell_and_traversal_rejected(self):
        base = book()
        with zipfile.ZipFile(io.BytesIO(base)) as z:
            document = z.read("word/document.xml")
        for changes in [{"word/document.xml": document.replace(b">42<", b">41<")}, {"../outside.xml": b"no"}]:
            with self.subTest(changes=list(changes)), self.assertRaises(ValueError):
                oracle.validate(self.source, book(files=changes))


if __name__ == "__main__":
    unittest.main()
