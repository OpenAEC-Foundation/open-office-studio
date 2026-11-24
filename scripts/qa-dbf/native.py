"""Bounded native reader for the pinned DBTest.dbf; not a general DBF importer."""
import datetime as dt
import re
import struct


def read_source(data):
    assert len(data) >= 33 and data[0] == 3, 'expected 0x03 native header'
    count, start, size = struct.unpack_from('<IHH', data, 4)
    assert 33 <= start <= len(data) and (start - 33) % 32 == 0
    assert data[start - 1] == 13, 'descriptor terminator'
    assert start + count * size == len(data), 'record bounds / unexpected trailer'
    fields = []
    offset = 1
    for at in range(32, start - 1, 32):
        desc = data[at:at + 32]
        name = desc[:11].split(b'\0', 1)[0].decode('ascii')
        typ, length, decimals = chr(desc[11]), desc[16], desc[17]
        assert name and typ in 'CNLD' and length > 0
        assert typ != 'L' or length == 1
        assert typ != 'D' or length == 8
        fields.append(dict(name=name, type=typ, length=length, decimals=decimals,
                           offset=offset, descriptorHex=desc.hex()))
        offset += length
    assert offset == size and len({f['name'] for f in fields}) == len(fields)
    records = []
    for row in range(count):
        record = data[start + row * size:start + (row + 1) * size]
        assert record[0] in (32, 42), 'deletion flag'
        slots = []
        for f in fields:
            raw = record[f['offset']:f['offset'] + f['length']]
            assert all(b < 128 for b in raw), 'only ASCII qualification for LDID 0'
            slot = dict(field=f['name'], type=f['type'], rawHex=raw.hex())
            if f['type'] == 'C':
                value = raw.rstrip(b' ').decode('ascii')
                slot.update(kind='text' if value else 'blank-character', value=value)
            elif f['type'] == 'N':
                if raw == b' ' * len(raw):
                    slot.update(kind='blank-numeric', value=None)
                else:
                    prefix, sep, tail = raw.partition(b'\0')
                    assert not sep or tail == b'\0' * len(tail), 'non-NUL numeric tail'
                    lexeme = prefix.strip(b' ').decode('ascii')
                    assert re.fullmatch(r'-?\d+(?:\.\d+)?', lexeme), 'numeric lexeme'
                    slot.update(kind='number', value=lexeme,
                                nulPadding=len(raw) - len(prefix) if sep else 0)
            elif f['type'] == 'L':
                assert raw in (b'T', b'F', b' '), 'bounded logical domain'
                slot.update(kind='unknown-logical' if raw == b' ' else 'boolean',
                            value=None if raw == b' ' else raw == b'T')
            else:
                text = raw.decode('ascii')
                assert re.fullmatch(r'\d{8}', text), 'bounded nonempty YYYYMMDD'
                date = dt.date(int(text[:4]), int(text[4:6]), int(text[6:]))
                slot.update(kind='date', value=date.isoformat())
            slots.append(slot)
        records.append(dict(index=row + 1, deleted=record[0] == 42, slots=slots))
    return dict(versionByte=data[0], updateBytes=list(data[1:4]),
                codepageMark=data[29], rawByte28=data[28], recordCount=count,
                headerLength=start, recordLength=size, trailerBytes=0,
                fields=fields, records=records,
                deletedCount=sum(r['deleted'] for r in records),
                memoFields=[], formulaWitness=False,
                numericPaddingQualification='NUL-padded numeric prefixes observed; not canonical space-padding conformance',
                charsetQualification='ASCII payload only; LDID 0 does not identify a codepage')
