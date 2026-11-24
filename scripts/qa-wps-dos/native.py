"""Read-only, bounded native Works DOS source inventory; no Office/parser call.

Offsets are checked against pinned libwps source, not a Microsoft normative
specification. Byte-range evidence is independent of conversion output.
"""
import hashlib
import re
import struct


def inspect_source(data):
    assert len(data) >= 256 and data[:4] == b'\x01\xfe\x01\x00', 'bounded DOS2 header'
    limits = list(struct.unpack_from('<4i', data, 0x1a))
    header_limit, footer_limit, begin, end = limits
    declared_end = struct.unpack_from('<I', data, 0x2a)[0]
    assert header_limit == footer_limit == -1, 'fixture has no referenced header/footer stories'
    assert 256 <= begin <= end <= declared_end == len(data), 'primary text / file bounds'
    names = ['BTEC','BTEP','SHdr','SFtr','DLINK','FTNp','FTNd','BKMK','FONT']
    entries = []
    for index, name in enumerate(names):
        at = 0x2e + index * 6
        offset, size = struct.unpack_from('<IH', data, at)
        assert 0 <= offset <= offset + size <= declared_end, 'directory range'
        if size:
            assert end <= offset, 'unexpected directory/text overlap'
        entries.append(dict(name=name, descriptorOffset=at, offset=offset, bytes=size,
                            rawHex=data[offset:offset+size].hex()))
    active = [e for e in entries if e['bytes']]
    ranges = sorted((e['offset'], e['offset']+e['bytes']) for e in active)
    assert all(a[1] <= b[0] for a,b in zip(ranges,ranges[1:])), 'overlapping directory ranges'
    body = data[begin:end]
    unclassified_end = min(e['offset'] for e in active) if active else declared_end
    outside = data[end:unclassified_end]
    runs = [dict(offset=end+m.start(), bytes=len(m.group()), ascii=m.group().decode('ascii'))
            for m in re.finditer(rb'[\x20-\x7e]{4,}', outside)]
    printable = ''.join(chr(b) for b in body if 32 <= b < 127)
    return dict(headerHex=data[:4].hex(), versionByte=data[0], creatorWord=struct.unpack_from('<H',data,2)[0],
                nativeVersionQualification='Header maps to Works DOS2 in the referenced implementation; exact 2.00A producer build is not attested',
                container='flat native bytes, not the Works6 CHNKWKS/CFB route',
                oemWord=struct.unpack_from('<H',data,0x10)[0],
                oemCodeBits=(struct.unpack_from('<H',data,0x10)[0] >> 4) & 0x7ff,
                oemBoundary='Header bits only; no positive charset conversion witness',
                textLimits=limits, declaredFileBytes=declared_end,
                primaryText=dict(begin=begin,endExclusive=end,bytes=len(body),hex=body.hex(),
                                 codeUnits=list(body),printableAscii=printable,
                                 crCount=body.count(13),lfCount=body.count(10),
                                 nonCRLFBytes=[b for b in body if b not in (13,10)]),
                directory=entries,
                outsidePrimaryText=dict(begin=end,endExclusive=unclassified_end,sha256=hashlib.sha256(outside).hexdigest(),
                    printableRuns=runs,interpretation='Unclassified outside primary interval; not accepted as body or proved editing history'),
                independentNonemptyPrimaryTextWitness=bool([b for b in body if b not in (13,10)]),
                logicalParagraphCount=None,wholeDocumentEmptyProved=False,fullFormatAcceptance=False)


def controls(raw):
    result = []
    def rejected(name, mutation):
        changed = bytearray(raw)
        mutation(changed)
        try:
            inspect_source(bytes(changed))
            ok = False
        except (AssertionError, ValueError, struct.error):
            ok = True
        result.append(dict(control=name,passed=ok))
    rejected('wrong-native-header',lambda x: x.__setitem__(1,0))
    rejected('primary-end-outside-file',lambda x: struct.pack_into('<I',x,0x26,len(raw)+1))
    rejected('truncated-file',lambda x: x.pop())
    rejected('directory-entry-outside-file',lambda x: struct.pack_into('<H',x,0x32,len(raw)))
    changed = bytearray(raw)
    changed[0x103] = ord('Q')
    result.append(dict(control='outside-printable-byte-does-not-enter-primary-story',
                       passed=inspect_source(bytes(changed))['primaryText'] == inspect_source(raw)['primaryText']))
    changed = bytearray(raw)
    changed[0x100] = ord('Q')
    candidate = inspect_source(bytes(changed))
    result.append(dict(control='in-range-printable-byte-is-detected',
                       passed=candidate['independentNonemptyPrimaryTextWitness'] and candidate['primaryText']['printableAscii'] == 'Q'))
    return result
