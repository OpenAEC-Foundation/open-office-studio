"""Pakketbronnen wisselen zonder distributie, sleutels of overige bronnen te wijzigen."""
import importlib.util
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "ubuntu_hoofdarchief",
    Path(__file__).parents[1] / "scripts/gebruik-ubuntu-hoofdarchief.py",
)
bron = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bron)


class UbuntuHoofdarchief(unittest.TestCase):
    def test_behoudt_pakketreeksen_componenten_en_ondertekeningssleutel(self):
        tekst = ("deb [arch=amd64 signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] "
                 "http://azure.archive.ubuntu.com/ubuntu jammy main universe\n"
                 "deb-src https://azure.archive.ubuntu.com/ubuntu/ jammy-updates main\n")
        verwacht = tekst.replace("http://azure.archive.ubuntu.com/ubuntu", "https://archive.ubuntu.com/ubuntu")
        verwacht = verwacht.replace("https://azure.archive.ubuntu.com/ubuntu", "https://archive.ubuntu.com/ubuntu")
        self.assertEqual(bron.herschrijf_bronnen(tekst), verwacht)

    def test_ondersteunt_deb822_en_meerdere_urls(self):
        tekst = ("Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu "
                 "https://security.ubuntu.com/ubuntu\nSuites: jammy jammy-security\n"
                 "Components: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n")
        self.assertEqual(bron.herschrijf_bronnen(tekst), tekst.replace(
            "http://azure.archive.ubuntu.com/ubuntu", "https://archive.ubuntu.com/ubuntu"))

    def test_laat_commentaar_en_andere_hosts_en_paden_staan(self):
        tekst = ("# deb http://azure.archive.ubuntu.com/ubuntu jammy main\n"
                 "deb https://packages.example.org/ubuntu jammy main # http://azure.archive.ubuntu.com/ubuntu\n"
                 "deb https://evil-azure.archive.ubuntu.com/ubuntu jammy main\n"
                 "deb https://azure.archive.ubuntu.com/ubuntu-ander jammy main\n"
                 "deb https://example.org/http://azure.archive.ubuntu.com/ubuntu jammy main\n")
        self.assertEqual(bron.herschrijf_bronnen(tekst), tekst)

    def test_behoudt_regeleinden_en_ontbrekende_slotregel(self):
        tekst = "deb http://azure.archive.ubuntu.com/ubuntu jammy main\r\n# einde"
        self.assertEqual(bron.herschrijf_bronnen(tekst),
                         "deb https://archive.ubuntu.com/ubuntu jammy main\r\n# einde")

    def test_wijzigt_alleen_actieve_bronbestanden_en_is_herhaalbaar(self):
        with tempfile.TemporaryDirectory() as tijdelijk:
            map = Path(tijdelijk)
            (map / "sources.list.d").mkdir()
            tekst = "deb http://azure.archive.ubuntu.com/ubuntu jammy main\r\n"
            for pad in ["sources.list", "sources.list.d/ubuntu.list", "sources.list.d/ubuntu.sources"]:
                (map / pad).write_bytes(tekst.encode())
            (map / "sources.list.d/ubuntu.list.save").write_bytes(tekst.encode())
            (map / "sources.list.d/ander.list").write_text("deb https://example.org/repo jammy main\n")
            self.assertEqual(bron.gebruik_hoofdarchief(map),
                             ["sources.list", "sources.list.d/ubuntu.list", "sources.list.d/ubuntu.sources"])
            self.assertEqual((map / "sources.list").read_bytes(),
                             b"deb https://archive.ubuntu.com/ubuntu jammy main\r\n")
            self.assertEqual((map / "sources.list.d/ubuntu.list.save").read_bytes(), tekst.encode())
            self.assertEqual(bron.gebruik_hoofdarchief(map), [])

    def test_accepteert_een_al_correcte_of_lege_bronnenmap(self):
        with tempfile.TemporaryDirectory() as tijdelijk:
            map = Path(tijdelijk)
            self.assertEqual(bron.gebruik_hoofdarchief(map), [])
            (map / "sources.list").write_text("deb https://archive.ubuntu.com/ubuntu jammy main\n")
            self.assertEqual(bron.gebruik_hoofdarchief(map), [])


if __name__ == "__main__":
    unittest.main()
