#!/usr/bin/env python3
"""Gebruik de desktopcodec in de bestaande onafhankelijke SDK-/DOCX-proeven."""
from pathlib import Path
import base64
import hashlib
import json
import os
import subprocess
import sys
import uuid

def voer():
    if len(sys.argv) != 3:
        raise ValueError('Gebruik verzoek.json uitvoer.json')
    bron, doel = map(Path, sys.argv[1:])
    invoer = json.loads(bron.read_text(encoding="utf-8"))
    aanvraag = dict(invoer, schema=1, requestId=str(uuid.uuid4()),
                    documentId='eigen-protocolproef', sourceVersion='bron-1',
                    snapshotSha256=hashlib.sha256(base64.b64decode(invoer['snapshot'], validate=True)).hexdigest())
    aanvraagpad = bron.with_name(bron.stem + '-protocol.json')
    antwoordpad = doel.with_name(doel.stem + '-protocol.json')
    aanvraagpad.write_text(json.dumps(aanvraag, ensure_ascii=False), encoding="utf-8")
    standaard = Path(__file__).resolve().parents[1] / 'target/release/examples/plak_protocol'
    programma = Path(os.environ.get('OFFICE_PLAK_PROTOCOL_BIN', standaard))
    resultaat = subprocess.run([str(programma), str(aanvraagpad), str(antwoordpad)], capture_output=True, text=True)
    if resultaat.returncode:
        sys.stderr.write(resultaat.stderr)
        return resultaat.returncode
    antwoord = json.loads(antwoordpad.read_text(encoding="utf-8"))
    for veld in ['schema', 'requestId', 'documentId', 'sourceVersion', 'snapshotSha256', 'clientId']:
        if antwoord[veld] != aanvraag[veld]:
            raise ValueError('De bronbinding van het protocolantwoord wijkt af: ' + veld)
    doel.write_text(json.dumps({'delta': antwoord['delta'], 'caret': antwoord['caret'],
                               'import_ms': 0, 'toepassen_ms': antwoord['preparationMs'],
                               'delta_ms': 0, 'delta_bytes': len(base64.b64decode(antwoord['delta'], validate=True))}), encoding="utf-8")
    return 0

if __name__ == '__main__':
    try:
        sys.exit(voer())
    except Exception as fout:
        print(str(fout), file=sys.stderr)
        sys.exit(1)
