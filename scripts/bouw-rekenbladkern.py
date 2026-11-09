#!/usr/bin/env python3
"""Bouw de vastgezette rekenbladkern met de gecontroleerde bronpatches.

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
    parser.add_argument('--nieuwe-kern', action='store_true', help='Bouw een kandidaat en rapporteer de nieuwe checksum, zonder de vastgezette uitvoerchecksum te eisen. Bron, patches, tools en WASM-interface blijven gecontroleerd.')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    metadata = json.loads((repo / 'patches/rekenbladengine-lange-ketens.json').read_text())
    patches = [metadata, *metadata.get('extraPatches', [])]
    for onderdeel in patches:
        patch = repo / 'patches' / onderdeel['patch']
        if sha256(patch) != onderdeel['patchSha256']:
            raise SystemExit('De rekenbladpatch wijkt af van de vastgelegde checksum: ' + onderdeel['patch'])
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
    for onderdeel in patches:
        patch = repo / 'patches' / onderdeel['patch']
        subprocess.run(['patch', '-p1', '--fuzz=0', '--batch', '--forward', '-i', str(patch)], cwd=bronmap, check=True)
    if args.controle:
        for pakket in ['betteroffice-xlsx-calc', 'betteroffice-xlsx']:
            subprocess.run(['cargo', 'test', '-p', pakket, '--locked', '--test', 'lange_ketens'], cwd=bronmap, check=True)
        for onderdeel in metadata.get('extraPatches', []):
            for proef in onderdeel.get('tests', []):
                subprocess.run(['cargo', 'test', '-p', proef['pakket'], '--locked', '--test', proef['test']], cwd=bronmap, check=True)
    uitvoer = args.uitvoer.resolve()
    if uitvoer.exists():
        raise SystemExit('De uitvoermap bestaat al; kies een nieuwe map.')
    omgeving = dict(os.environ)
    omgeving.setdefault('CARGO_TARGET_DIR', str(bronmap / 'target-wasm'))
    doelmap = Path(omgeving['CARGO_TARGET_DIR']).resolve()
    omgeving['CARGO_TARGET_DIR'] = str(doelmap)
    omgeving.setdefault('CARGO_BUILD_JOBS', '2')
    subprocess.run(['cargo', 'build', '-p', 'xlsx-wasm', '--lib', '--target', 'wasm32-unknown-unknown', '--release', '--locked'], cwd=bronmap, env=omgeving, check=True)
    uitvoer.mkdir(parents=True)
    subprocess.run([args.wasm_bindgen, '--target', 'web', '--out-name', 'xlsx_wasm', '--out-dir', str(uitvoer), str(doelmap / 'wasm32-unknown-unknown/release/xlsx_wasm.wasm')], check=True)
    kern = uitvoer / 'xlsx_wasm_bg.wasm'
    tijdelijk = uitvoer / 'xlsx_wasm_bg-geoptimaliseerd.wasm'
    subprocess.run([args.wasm_opt, '-O3', str(kern), '-o', str(tijdelijk)], check=True)
    tijdelijk.replace(kern)
    if not args.nieuwe_kern and sha256(kern) != metadata['wasmSha256']:
        raise SystemExit('De herbouwde rekenbladkern wijkt af van de vastgelegde checksum.')
    origineel = repo / 'node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm'
    if sha256(origineel) != metadata['oorspronkelijkWasmSha256']:
        raise SystemExit('De oorspronkelijke rekenbladkern wijkt af van de vastgezette versie.')
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
  throw new Error('De gebouwde rekenbladkern heeft een andere JS/WASM-interface.');
''', str(kern), str(origineel)], check=True)
    resultaat = {'bronCommit': metadata['commit'], 'patches': [{'patch': p['patch'], 'sha256': p['patchSha256']} for p in patches], 'rustc': rustc, 'wasmBindgen': bindgen, 'wasmOpt': optimizer, 'wasmSha256': sha256(kern), 'wasmBytes': kern.stat().st_size}
    (uitvoer / 'bouw.json').write_text(json.dumps(resultaat, indent=2) + '\n')
    print(json.dumps(resultaat, indent=2))


if __name__ == '__main__':
    main()
