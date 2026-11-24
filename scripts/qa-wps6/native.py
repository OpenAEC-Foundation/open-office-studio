"""Read-only, fixture-bounded CFB/CHNKWKS source inventory, without Office.

The index layout is checked against the pinned primary libwps source. This is
an independently implemented byte reader, not a normative Works specification
or an independent semantic implementation of styles/frames/STRS stories.
"""
import struct

from cfb import cfb_streams, digest, u16, u32


def chunks(contents):
    assert contents[:8] == b"CHNKWKS "
    total = u16(contents, 12)
    assert total == 16
    assert u16(contents, 24) == 504
    assert u16(contents, 26) == total
    assert u32(contents, 28) == 0xFFFFFFFF  # Only this single index block.
    out = []
    for i in range(total):
        p = 32 + 24 * i
        assert u16(contents, p) == 24
        name = contents[p + 2:p + 6].decode("ascii")
        kind = contents[p + 12:p + 16].decode("ascii")
        offset, size = u32(contents, p + 16), u32(contents, p + 20)
        assert 512 <= offset <= offset + size <= len(contents)
        out.append({"indexOffset": p, "name": name, "id": u16(contents, p + 6),
                    "type": kind, "offset": offset, "bytes": size,
                    "sha256": digest(contents[offset:offset + size])})
    assert len({(e["name"], e["id"]) for e in out}) == total
    ranges = sorted((e["offset"], e["offset"] + e["bytes"]) for e in out)
    assert all(a[1] <= b[0] for a, b in zip(ranges, ranges[1:]))
    return out


def text_inventory(contents):
    table = chunks(contents)
    entries = [e for e in table if e["name"] == "TEXT"]
    assert len(entries) == 1
    e = entries[0]
    assert e["id"] == 0 and e["type"] == "TEXT" and e["bytes"] % 2 == 0
    raw = contents[e["offset"]:e["offset"] + e["bytes"]]
    units = list(struct.unpack("<" + "H" * (len(raw) // 2), raw))
    return {"chunk": e, "hex": raw.hex(), "utf16leCodeUnits": units,
            "crCount": units.count(13),
            "nonCrCodeUnits": [u for u in units if u != 13],
            "logicalBodyParagraphCount": None,
            "storyClassification": "STRS semantics not accepted by this reader"}


def assert_blank_text(inventory):
    assert inventory["utf16leCodeUnits"] == [13, 13, 13]
    assert inventory["nonCrCodeUnits"] == []


def inspect_source(data):
    directory, streams = cfb_streams(data)
    assert set(streams) == {"CONTENTS", "\x01CompObj", "SPELLING"}
    content = streams["CONTENTS"]
    text = text_inventory(content)
    assert_blank_text(text)
    assert len(content) == 9728
    return {"bytes": len(data), "sha256": digest(data),
            "directory": directory, "chunkIndex": chunks(content), "text": text,
            "independentNonemptyTextWitness": False,
            "nativeVersionQualification": "Published filename Works_6.0; shared CHNKWKS family only independently observed",
            "fullFormatAccepted": False}, content


def negative_controls(contents):
    # These are controls on OUR oracle, not product import/rejection tests.
    controls = []
    text = next(e for e in chunks(contents) if e["name"] == "TEXT")
    for name, mutate in [
        ("injected-visible-source-character", lambda b: struct.pack_into("<H", b, text["offset"], 65)),
        ("text-range-outside-container", lambda b: struct.pack_into("<I", b, text["indexOffset"] + 16, len(b) + 1)),
        ("wrong-text-chunk-type", lambda b: b.__setitem__(slice(text["indexOffset"] + 12, text["indexOffset"] + 16), b"FONT")),
    ]:
        changed = bytearray(contents)
        mutate(changed)
        try:
            assert_blank_text(text_inventory(bytes(changed)))
        except AssertionError:
            controls.append({"name": name, "oracleRejected": True})
        else:
            raise AssertionError("Oracle control unexpectedly accepted: " + name)
    return controls
