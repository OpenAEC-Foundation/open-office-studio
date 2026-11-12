"""Controleer een vastgelegd foutarchief; pak uitsluitend de gebonden ELF uit."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile
import zipfile


def controleer(archief, metadata, uitvoer=None):
    meta = json.loads(Path(metadata).read_text())
    with Path(archief).open('rb') as bron:
        som = hashlib.sha256()
        for blok in iter(lambda: bron.read(1024 * 1024), b''):
            som.update(blok)
        if som.hexdigest() != meta['zip_sha256']:
            raise ValueError('Foutarchief wijkt af')
    with zipfile.ZipFile(archief) as z:
        fout = z.testzip()
        if fout:
            raise ValueError('CRC-fout: ' + fout)
        tarbytes = z.read('writer-foutcontext.tar.gz')
        tarsha = hashlib.sha256(tarbytes).hexdigest()
        if tarsha != meta['tar_sha256']:
            raise ValueError('Ingepakt runtimearchief wijkt af')
        with tarfile.open(fileobj=io.BytesIO(tarbytes), mode='r:gz') as t:
            leden = [m for m in t.getmembers() if m.name == 'writer-foutcontext/open-office-studio']
            if len(leden) != 1 or not leden[0].isfile():
                raise ValueError('Geen unieke reguliere runtime')
            gegevens = t.extractfile(leden[0]).read()
    sha = hashlib.sha256(gegevens).hexdigest()
    if not gegevens.startswith(b'\x7fELF') or sha != meta['elf_sha256']:
        raise ValueError('Runtime wijkt af')
    if uitvoer is not None:
        # Nooit een bestaande referentie of symlink vervangen.
        with Path(uitvoer).open('xb') as doel:
            doel.write(gegevens)
        Path(uitvoer).chmod(0o755)
    return {'zip_sha256': meta['zip_sha256'], 'tar_sha256': tarsha,
            'elf_sha256': sha, 'bytes': len(gegevens), 'uitgepakt': uitvoer is not None}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archief', type=Path, required=True)
    p.add_argument('--metadata', type=Path, required=True)
    p.add_argument('--uitvoer', type=Path)
    a = p.parse_args()
    print(json.dumps(controleer(a.archief, a.metadata, a.uitvoer)))
