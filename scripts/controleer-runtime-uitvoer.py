"""Use the same independent content checks with portable pypdf on all platforms."""
from pathlib import Path
import runpy
import sys

from pypdf import PdfReader


def lees_pdf(path):
    reader = PdfReader(path)
    assert reader.pages, path
    return "\n".join(page.extract_text() or "" for page in reader.pages)


if __name__ == "__main__":
    namespace = runpy.run_path(str(Path(__file__).with_name("test-formaatuitvoer.py")))
    namespace["controleer"](sys.argv[1], lees_pdf)
