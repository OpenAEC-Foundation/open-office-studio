"""Bounded original-byte oracle for the first content section of lo-123-1.

Implementation-guided Lotus123 layout; no Office/converter output and no
complete native object/style/producer conformance claim.
"""
from decimal import Decimal
import hashlib
import struct

PREFIX_END = 3800


def address(col,row):
    assert 0 <= col < 26 and 0 <= row < 100
    return chr(65+col)+str(row+1)


def compact_number(raw):
    word = struct.unpack('<I',raw)[0]
    mantissa = word >> 6
    if word & 0x20:
        mantissa = -mantissa
    exponent = word & 0xf
    value = Decimal(mantissa)
    if exponent:
        value = value / (Decimal(10)**exponent) if word & 0x10 else value * (Decimal(10)**exponent)
    return str(value)


def inspect_source(data):
    assert len(data) >= PREFIX_END
    assert data[:6] == b'\x00\x00\x1a\x00\x03\x10', 'bounded native BOF'
    last_sheet = data[14]
    assert last_sheet == 2
    pos = 0
    records,cells,names,comments = [],{},{},[]
    while pos < PREFIX_END:
        kind,size = struct.unpack_from('<HH',data,pos)
        begin,end = pos+4,pos+4+size
        assert end <= PREFIX_END, 'content-prefix record boundary'
        payload = data[begin:end]
        records.append(dict(offset=pos,type=kind,bytes=size,payloadHex=payload.hex()))
        if kind == 0x23:
            assert size >= 5 and struct.unpack_from('<H',payload)[0] == 14000
            sheet = payload[2]
            assert payload[3] == 0 and payload[4:].endswith(b'\0') and b'\0' not in payload[4:-1]
            assert sheet <= last_sheet and str(sheet) not in names
            names[str(sheet)] = payload[4:-1].decode('ascii')
        elif kind in (0x16,0x25,0x28,0x26):
            assert size >= 5
            row,sheet,col = struct.unpack_from('<HBB',payload)
            assert sheet <= last_sheet
            ref = address(col,row)
            key = str(sheet)+'!'+ref
            if kind == 0x26:
                comments.append(dict(recordOffset=pos,sheet=sheet,address=ref,rawHex=payload[4:].hex(),
                                     accepted=False,boundary='Leading control/comment metadata and rendering unqualified'))
            else:
                assert key not in cells
                cell = dict(recordOffset=pos,sheet=sheet,address=ref,type=kind,rawHex=payload[4:].hex())
                if kind == 0x16:
                    assert payload[4] in (39,92,94,34), 'bounded alignment prefix'
                    text = payload[5:]
                    assert text.endswith(b'\0') and b'\0' not in text[:-1]
                    cell.update(kind='text',value=text[:-1].decode('ascii'),alignmentByte=payload[4])
                elif kind == 0x25:
                    assert size == 8
                    cell.update(kind='number',value=compact_number(payload[4:]))
                else:
                    assert size == 19
                    cached = struct.unpack_from('<d',payload,4)[0]
                    tokens = payload[12:]
                    assert len(tokens) == 7 and tokens[0] == 1 and tokens[-1] == 3, 'bounded cell-reference formula'
                    flags = tokens[1]
                    target_row,target_sheet,target_col = struct.unpack_from('<HBB',tokens,2)
                    assert flags == 7 and target_sheet == sheet
                    target = address(target_col,target_row)
                    cell.update(kind='formula',cachedValue=str(cached),formulaHex=tokens.hex(),
                                formula=dict(expression=target,targetSheet=target_sheet,target=target,rawFlags=flags,
                                             columnRelative=bool(flags&1),rowRelative=bool(flags&2),otherFlagSemanticsAccepted=False))
                cells[key] = cell
        pos = end
    assert pos == PREFIX_END and len(records) == 172
    assert len(cells) == 48 and len(comments) == 1
    assert sum(c['kind']=='text' for c in cells.values()) == 21
    assert sum(c['kind']=='number' for c in cells.values()) == 26
    assert sum(c['kind']=='formula' for c in cells.values()) == 1
    for c in cells.values():
        if c['kind'] == 'formula':
            target = cells[str(c['formula']['targetSheet'])+'!'+c['formula']['target']]
            assert target['kind'] == 'number'
            c['independentlyCalculatedValue'] = target['value']
            c['sourceCacheMatchesCalculation'] = Decimal(target['value']) == Decimal(c['cachedValue'])
    return dict(versionWord='1003',versionBoundary='Lotus123-family revision word; filename/version labels are not producer attestations',
                sourceSheetCountFromBOF=last_sheet+1,explicitSheetNames=names,
                prefix=dict(endExclusive=PREFIX_END,recordCount=len(records),sha256=hashlib.sha256(data[:PREFIX_END]).hexdigest()),
                opaqueSuffix=dict(begin=PREFIX_END,bytes=len(data)-PREFIX_END,sha256=hashlib.sha256(data[PREFIX_END:]).hexdigest(),
                                  accepted=False,boundary='Native object/graphics/other records not decoded or validated by this bounded reader'),
                records=records,cells=cells,comments=comments,
                styleBoundary='Literal labels such as red/protected/italic are cell text, not tested formatting properties',
                fullFormatAcceptance=False)
