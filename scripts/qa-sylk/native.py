"""Independent, bounded record reader for the immutable lo-slk-2 source."""
import collections
from decimal import Decimal
import re


def split_fields(line):
    # Doubled semicolons are literal semicolons (including inside P format codes).
    fields, field = [], bytearray()
    i = 0
    while i < len(line):
        if line[i:i+2] == b';;':
            field.append(59)
            i += 2
        elif line[i] == 59:
            fields.append(bytes(field))
            field.clear()
            i += 1
        else:
            field.append(line[i])
            i += 1
    return fields + [bytes(field)]


def read_source(data):
    lines = data.splitlines()
    assert lines and lines[0] == b'ID;PXL;N;E' and lines[-1] == b'E', 'positive source framing'
    assert all(lines), 'empty record outside bounded fixture grammar'
    x = y = 1
    fmt = None
    bounds = None
    formats, cells, ledger = [], {}, []
    for number, line in enumerate(lines, 1):
        fields = split_fields(line)
        kind = fields[0].decode('ascii')
        assert kind in ('ID', 'P', 'F', 'B', 'O', 'C', 'E'), 'unhandled record kind'
        ledger.append(dict(record=number, kind=kind, rawHex=line.hex()))
        if kind == 'ID':
            assert number == 1
        elif kind == 'E':
            assert number == len(lines)
        elif kind == 'P':
            assert len(fields) == 2 and fields[1].startswith(b'P')
            formats.append(fields[1][1:].decode('ascii'))
        elif kind == 'B':
            assert len(fields) == 3 and bounds is None
            bounds = {f[:1].decode(): int(f[1:]) for f in fields[1:]}
            assert set(bounds) == {'X', 'Y'}
        elif kind in ('F', 'C'):
            for field in fields[1:]:
                if re.fullmatch(rb'[XY][0-9]+', field):
                    if field[0] == 88:
                        x = int(field[1:])
                    else:
                        y = int(field[1:])
                elif kind == 'F' and re.fullmatch(rb'P[0-9]+', field):
                    fmt = int(field[1:])
            if kind != 'C':
                continue
            # No formula E, array/shared-formula, or other C-field variant is
            # silently interpreted as a literal. This source has K-only C rows.
            assert len(fields) == 2 and fields[1].startswith(b'K'), 'unhandled C fields/formula'
            assert bounds and 1 <= x <= bounds['X'] <= 26 and 1 <= y <= bounds['Y']
            assert fmt is not None and 0 <= fmt < len(formats)
            ref = chr(64+x) + str(y)
            assert ref not in cells, 'duplicate native coordinate'
            value = fields[1][1:]
            entry = dict(record=number, rawValueHex=value.hex(), formatIndex=fmt, formatCode=formats[fmt])
            if value.startswith(b'"'):
                assert value.endswith(b'"') and b'"' not in value[1:-1], 'bounded quoted string'
                raw = value[1:-1]
                if all(b < 128 for b in raw):
                    entry.update(kind='ascii-text', value=raw.decode('ascii'))
                else:
                    entry.update(kind='opaque-high-byte-text', value=None, payloadHex=raw.hex())
            else:
                lexeme = value.decode('ascii')
                assert re.fullmatch(r'-?\d+(?:\.\d+)?', lexeme), 'bounded numeric literal'
                assert Decimal(lexeme).is_finite()
                entry.update(kind='number', value=lexeme)
            cells[ref] = entry
    assert bounds and cells
    return dict(header=lines[0].decode(), producerTag='PXL (tag only; original producer not proved)',
                bounds=bounds, formats=formats, cells=cells, ledger=ledger,
                recordCounts=dict(collections.Counter(r['kind'] for r in ledger)),
                cellKinds=dict(collections.Counter(c['kind'] for c in cells.values())),
                sourceFormulaCount=0, formulaCacheWitness=False,
                charsetBoundary='0xD1 quoted payload retained as bytes; no independent charset mapping proved',
                sheetNameBoundary='No sheet name is encoded by this bounded source oracle',
                dateBoundary='P10 is m/d/yy; numeric serial and format remain separate, no source epoch inferred')
