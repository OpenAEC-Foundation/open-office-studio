#!/usr/bin/env python3
"""Bouw de vastgezette tekstkern met de controleerbare nootcorrectie.

De bronmap moet nieuw zijn. Bestaande bronbestanden of npm-pakketten worden
niet overschreven. Download en patch worden vóór het compileren geverifieerd.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import urllib.request


def sha256(pad):
    with pad.open('rb') as bestand:
        return hashlib.file_digest(bestand, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bronmap', type=Path, required=True)
    parser.add_argument('--uitvoer', type=Path, required=True)
    parser.add_argument('--bronarchief', type=Path)
    parser.add_argument('--wasm-bindgen', default='wasm-bindgen')
    parser.add_argument('--wasm-opt', default='wasm-opt')
    parser.add_argument('--controle', action='store_true', help='Draai ook de gerichte native kernproeven.')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    metadata = json.loads((repo / 'patches/tekstengine-nootnummering.json').read_text())
    patch = repo / 'patches' / metadata['patch']
    if sha256(patch) != metadata['patchSha256']:
        raise SystemExit('De nootpatch wijkt af van de vastgelegde checksum.')
    rustc = subprocess.check_output(['rustc', '--version'], text=True).strip()
    if not rustc.startswith('rustc ' + metadata['rustc'] + ' '):
        raise SystemExit('Gebruik de vastgelegde Rust-versie: ' + metadata['rustc'])
    bindgen = subprocess.check_output([args.wasm_bindgen, '--version'], text=True).strip()
    if bindgen != 'wasm-bindgen ' + metadata['wasmBindgen']:
        raise SystemExit('Gebruik wasm-bindgen ' + metadata['wasmBindgen'])
    optimizer = subprocess.check_output([args.wasm_opt, '--version'], text=True).strip()
    if not optimizer.startswith('wasm-opt version ' + metadata['binaryen'] + ' '):
        raise SystemExit('Gebruik Binaryen ' + metadata['binaryen'])
    bronmap = args.bronmap.resolve()
    if bronmap.exists():
        raise SystemExit('De bronmap bestaat al; kies een nieuwe map.')
    bronmap.parent.mkdir(parents=True, exist_ok=True)
    archief = args.bronarchief
    if archief is None:
        archief = bronmap.with_suffix('.tar.gz')
        if archief.exists():
            raise SystemExit('Het downloadpad bestaat al; kies een nieuwe bronmap of geef --bronarchief mee.')
        url = metadata['bronarchiefUrl']
        with urllib.request.urlopen(url, timeout=60) as antwoord, archief.open('xb') as doel:
            while blok := antwoord.read(1024 * 1024):
                doel.write(blok)
    if sha256(archief) != metadata['bronarchiefSha256']:
        raise SystemExit('Het bronarchief wijkt af van de vastgelegde checksum.')
    bronmap.mkdir()
    with tarfile.open(archief) as tar:
        for lid in tar:
            delen = Path(lid.name).parts
            if len(delen) < 2:
                continue
            relatief = Path(*delen[1:])
            doel = bronmap / relatief
            if relatief.is_absolute() or '..' in relatief.parts:
                raise SystemExit('Onveilig pad in het bronarchief.')
            if lid.isdir():
                doel.mkdir(parents=True, exist_ok=True)
            elif lid.isfile():
                doel.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(lid) as bron, doel.open('xb') as bestand:
                    while blok := bron.read(1024 * 1024):
                        bestand.write(blok)
    subprocess.run(['patch', '-p1', '--fuzz=0', '--batch', '--forward', '-i', str(patch)], cwd=bronmap, check=True)
    if args.controle:
        subprocess.run(['cargo', 'test', '-p', 'betteroffice-ooxml-text', '--locked', '--lib', 'math_image'], cwd=bronmap, check=True)
        subprocess.run(['cargo', 'test', '-p', 'betteroffice-docx-edit', '--locked', '--lib', 'math_preview'], cwd=bronmap, check=True)
        subprocess.run(['cargo', 'test', '-p', 'betteroffice-docx-layout', '--locked', '--lib', 'chicago', '--', '--test-threads=1'], cwd=bronmap, check=True)
        subprocess.run(['cargo', 'test', '-p', 'betteroffice-docx-layout', '--locked', '--lib', 'noot', '--', '--test-threads=1'], cwd=bronmap, check=True)
        for proef in ['nootverwijzingen_gebruiken_de_ingestelde_nummering', 'nootverwijzingen_chicago_worden_voor_meting_herhaald', 'a_last_page_footnote_retains_constant_snapshot_entries_and_resumes_exactly']:
            subprocess.run(['cargo', 'test', '-p', 'betteroffice-docx-edit', '--locked', '--lib', proef], cwd=bronmap, check=True)
        for groep in ['ops::table::tests', 'seed::tests']:
            subprocess.run(['cargo', 'test', '-p', 'betteroffice-docx-edit', '--locked', '--lib', groep, '--', '--test-threads=2'], cwd=bronmap, check=True)
    omgeving = {**os.environ, 'CARGO_TARGET_DIR': str(bronmap / 'target-wasm')}
    omgeving.setdefault('CARGO_BUILD_JOBS', '2')
    subprocess.run(['cargo', 'build', '-p', 'betteroffice-docx-edit', '--lib', '--features', 'wasm,tiff,metafile,heap-stats', '--target', 'wasm32-unknown-unknown', '--release', '--locked'], cwd=bronmap, env=omgeving, check=True)
    uitvoer = args.uitvoer.resolve()
    uitvoer.mkdir(parents=True, exist_ok=True)
    # Bouw beide modules apart met hun oorspronkelijke featurekeuze.
    subprocess.run(['cargo', 'build', '-p', 'betteroffice-docx-layout', '--lib', '--target', 'wasm32-unknown-unknown', '--release', '--locked'], cwd=bronmap, env=omgeving, check=True)
    kernen = {}
    for naam, soort, sleutel in [('docx_edit', 'edit', 'oorspronkelijkWasmSha256'), ('docx_layout', 'layout', 'oorspronkelijkLayoutWasmSha256')]:
        subprocess.run([args.wasm_bindgen, '--target', 'web', '--out-name', naam, '--out-dir', str(uitvoer), str(bronmap / f'target-wasm/wasm32-unknown-unknown/release/{naam}.wasm')], check=True)
        kern = uitvoer / f'{naam}_bg.wasm'
        tijdelijk = uitvoer / f'{naam}_bg-geoptimaliseerd.wasm'
        subprocess.run([args.wasm_opt, '-O3', str(kern), '-o', str(tijdelijk)], check=True)
        tijdelijk.replace(kern)
        origineel = repo / f'node_modules/@betteroffice/docx/dist/generated/{soort}/{naam}_bg.wasm'
        if sha256(origineel) != metadata[sleutel]:
            raise SystemExit('De oorspronkelijke npm-kern wijkt af van de vastgezette versie: ' + soort)
        # Controleer de werkelijke bytes, inclusief browsercompatibiliteit.
        subprocess.run(['node', '--input-type=module', '--eval', '''
import { readFileSync } from 'node:fs';
const contract = pad => {
  const module = new WebAssembly.Module(readFileSync(pad));
  return JSON.stringify({
    imports: WebAssembly.Module.imports(module).map(r => `${r.module}:${r.name}:${r.kind}`).sort(),
    exports: WebAssembly.Module.exports(module).map(r => `${r.name}:${r.kind}`).sort()
  });
};
if (contract(process.argv[1]) !== contract(process.argv[2]))
  throw new Error('De gebouwde tekstkern heeft een andere JS/WASM-interface.');
''', str(kern), str(origineel)], check=True)
        kernen[naam] = {'sha256': sha256(kern), 'bytes': kern.stat().st_size}
    resultaat = {'bronCommit': metadata['commit'], 'patchSha256': metadata['patchSha256'], 'rustc': rustc, 'wasmBindgen': bindgen, 'wasmOpt': optimizer, 'kernen': kernen}
    (uitvoer / 'bouw.json').write_text(json.dumps(resultaat, indent=2) + '\n')
    print(json.dumps(resultaat, indent=2))


if __name__ == '__main__':
    main()
