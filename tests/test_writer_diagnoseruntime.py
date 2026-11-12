"""Alleen de gehashte runtime mag worden uitgepakt; bestaande paden blijven intact."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('diagnoseruntime', Path(__file__).resolve().parents[1]/'scripts/pak-writer-diagnoseruntime.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class DiagnoseRuntime(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.pad = Path(self.tmp.name); self.elf = b'\x7fELF-eigen-proef'; b = io.BytesIO()
        with tarfile.open(fileobj=b, mode='w:gz') as t:
            for naam, inhoud in [('writer-foutcontext/open-office-studio', self.elf), ('../niet-uitpakken', b'vreemd')]:
                info = tarfile.TarInfo(naam); info.size = len(inhoud); t.addfile(info, io.BytesIO(inhoud))
        self.zip = self.pad/'fout.zip'
        with zipfile.ZipFile(self.zip, 'w') as z: z.writestr('writer-foutcontext.tar.gz', b.getvalue())
        self.meta = {'zip_sha256': hashlib.sha256(self.zip.read_bytes()).hexdigest(), 'tar_sha256': hashlib.sha256(b.getvalue()).hexdigest(), 'elf_sha256': hashlib.sha256(self.elf).hexdigest()}
        self.json = self.pad/'meta.json'; self.schrijf()

    def schrijf(self): self.json.write_text(json.dumps(self.meta))

    def test_exact_alleen_elf_en_controle_zonder_schrijven(self):
        r = m.controleer(self.zip, self.json); self.assertFalse(r['uitgepakt'])
        doel = self.pad/'runtime'; m.controleer(self.zip, self.json, doel)
        self.assertEqual(doel.read_bytes(), self.elf); self.assertEqual(doel.stat().st_mode & 0o777, 0o755)
        self.assertEqual(set(f.name for f in self.pad.iterdir()), {'fout.zip', 'meta.json', 'runtime'})

    def test_bestaand_pad_of_symlink_nooit_vervangen(self):
        doel = self.pad/'runtime'; doel.write_bytes(b'bestaand')
        with self.assertRaises(FileExistsError): m.controleer(self.zip, self.json, doel)
        link = self.pad/'link'; link.symlink_to(doel)
        with self.assertRaises(FileExistsError): m.controleer(self.zip, self.json, link)
        self.assertEqual(doel.read_bytes(), b'bestaand')

    def test_iedere_afwijkende_hash_weigeren_voor_schrijven(self):
        for sleutel in self.meta:
            oud = self.meta[sleutel]; self.meta[sleutel] = '0'*64; self.schrijf()
            with self.assertRaises(ValueError): m.controleer(self.zip, self.json, self.pad/'runtime')
            self.assertFalse((self.pad/'runtime').exists()); self.meta[sleutel] = oud
