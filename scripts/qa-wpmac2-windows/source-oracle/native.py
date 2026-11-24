"""Independent bounded WPMac byte reader; no converter output baseline.

Only first three paragraphs/C3 spans are accepted, not whole-format semantics.
"""
import struct


def native(b, edit):
    assert b[:4] == b'\xffWPC'
    start = struct.unpack_from('<I', b, 4)[0]
    assert start == 16 and b[8:12] == bytes([1, 0x2c, 2, 2])
    assert b[12:16] == bytes(4)
    p = start
    paragraphs, text, properties, events = [], [], [], []
    state = {}
    while p < len(b):
        c = b[p]
        if 32 <= c < 127:
            text.append(chr(c)); properties.append(dict(state)); p += 1
            continue
        if 0x80 <= c < 0xc0:
            events.append({'offset': p, 'single': c, 'acceptedSemantics': False})
            p += 1
            continue
        if 0xc0 <= c <= 0xcf:
            size = {0xc1: 8, 0xc3: 4, 0xcd: 9}[c]
            assert p + size <= len(b) and b[p + size - 1] == c
            event = {'offset': p, 'group': c, 'bytes': size, 'hex': b[p:p+size].hex()}
            if c == 0xc3:
                assert b[p+1] in (0, 1) and b[p+2] in (0, 1, 128, 129)
                state['bold' if b[p+1] == 0 else 'italic'] = bool(b[p+2] & 1)
                event['explicitAttribute'] = dict(state)
            elif c == 0xc1:
                # Tail is inventory only, never an accepted paragraph/layout oracle.
                text.append('\t'); properties.append(dict(state))
            events.append(event); p += size
            continue
        assert 0xd0 <= c <= 0xef
        length = struct.unpack_from('>H', b, p+2)[0]
        end = p + length + 4
        assert length >= 2 and end <= len(b)
        assert b[end-2:end] == bytes([b[p+1], c])
        if length >= 4:
            assert b[end-4:end-2] == b[p+2:p+4]
        event = {'offset': p, 'group': c, 'subgroup': b[p+1], 'length': length, 'end': end}
        if c == 0xdc and b[p+1] == 2:
            paragraphs.append({'text': ''.join(text), 'properties': properties, 'terminatorOffset': p})
            text, properties = [], []
        events.append(event); p = end
    expected = [p['text'] for p in paragraphs[:3]]
    assert expected == ['This is a file created by WP 2.1.3', 'Bold', 'Italic']
    assert all(x.get('bold') is True for x in paragraphs[1]['properties'])
    assert all(x.get('italic') is True for x in paragraphs[2]['properties'])
    edited = list(expected); edited[edit['paragraph']] = edit['text'] + edited[edit['paragraph']]
    return {'method': 'Own native header/framing/ASCII/C3/DC reader; oracle defined before converter; later Mac manual subset, not full Mac2 conformance',
            'header': {'documentOffset': start, 'product': 1, 'type': 44, 'major': 2, 'minor': 2, 'encryptionField': 0},
            'producerQualification': 'Macintosh2.x family independently identified; body self-reports WP2.1.3, not authenticated producing application',
            'leadingParagraphs': paragraphs[:3], 'events': events,
            'unacceptedTailInventory': {'text': ''.join(text), 'properties': properties},
            'expected': {'texts': expected, 'editedTexts': edited, 'edit': edit,
                         'documentMainContentType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'},
            'fullFormatAcceptance': False}
