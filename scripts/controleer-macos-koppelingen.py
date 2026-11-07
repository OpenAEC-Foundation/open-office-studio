"""Controleer de bestandskoppelingen in de werkelijk gebouwde macOS-app."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib


def controleer(gegevens, koppelingen, identifier):
    if gegevens.get('CFBundleIdentifier') != identifier:
        raise ValueError('De app heeft niet de verwachte bundle-identificatie.')
    verwacht = {
        ext: (k['name'], k['role'], k.get('rank', 'Default'))
        for k in koppelingen for ext in k['ext']
    }
    gevonden = {}
    for soort in gegevens.get('CFBundleDocumentTypes', []):
        extensies = soort.get('CFBundleTypeExtensions')
        if not isinstance(extensies, list) or not extensies:
            raise ValueError('Een documenttype mist zijn extensielijst.')
        # Tauri leidt public.rtf automatisch af. macOS geeft deze lijst voorrang
        # op extensies: RTF moet daarom een afzonderlijk documenttype zijn.
        typen = soort.get('LSItemContentTypes', [])
        if typen and not (extensies == ['rtf'] and typen == ['public.rtf']):
            raise ValueError('Een UTI-lijst verdringt andere extensiekoppelingen.')
        if extensies == ['rtf'] and typen != ['public.rtf']:
            raise ValueError('Het afzonderlijke RTF-documenttype mist public.rtf.')
        for ext in extensies:
            if not isinstance(ext, str) or ext in gevonden:
                raise ValueError('Ongeldige of dubbele extensie in de app.')
            gevonden[ext] = (soort.get('CFBundleTypeName'),
                             soort.get('CFBundleTypeRole'), soort.get('LSHandlerRank'))
    if gevonden != verwacht:
        raise ValueError('Extensies, documentnamen, rollen of rang wijken af van de platformconfiguratie.')
    return sorted(gevonden)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path)
    parser.add_argument('--bundels', type=Path, default=Path('src-tauri/target/release/bundle'))
    parser.add_argument('--config', type=Path, default=Path('src-tauri/tauri.macos.conf.json'))
    parser.add_argument('--identifier', default='org.openaec.office-studio')
    parser.add_argument('--rapport', type=Path, required=True)
    args = parser.parse_args()
    apps = [args.app] if args.app else list((args.bundels / 'macos').glob('*.app'))
    if len(apps) != 1:
        raise ValueError('Er moet precies één gebouwde macOS-app aanwezig zijn.')
    inhoud = (apps[0] / 'Contents/Info.plist').read_bytes()
    config = json.loads(args.config.read_text(encoding='utf-8'))
    extensies = controleer(plistlib.loads(inhoud), config['bundle']['fileAssociations'], args.identifier)
    rapport = {'identifier': args.identifier, 'extensies': extensies,
               'aantal': len(extensies), 'plistSha256': hashlib.sha256(inhoud).hexdigest()}
    args.rapport.parent.mkdir(parents=True, exist_ok=True)
    args.rapport.write_text(json.dumps(rapport, indent=2) + '\n', encoding='utf-8')
    print(f'macOS-app: {len(extensies)} bestandskoppelingen met juiste rollen en rang gecontroleerd.')


if __name__ == '__main__':
    main()
