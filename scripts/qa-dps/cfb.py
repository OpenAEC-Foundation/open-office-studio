"""Independent read-only version3 CFB reader for the pinned DPS candidates.

No product library or Office engine is imported. No Office execution or importer
acceptance. Reused own SDD/ET reader; no earlier proof is modified.
"""
import hashlib
import struct


def u16(b,p): return struct.unpack_from("<H",b,p)[0]
def u32(b,p): return struct.unpack_from("<I",b,p)[0]
def i32(b,p): return struct.unpack_from("<i",b,p)[0]
def digest(b): return hashlib.sha256(b).hexdigest()


def cfb_streams(data):
    assert data[:8] == bytes.fromhex("d0cf11e0a1b11ae1")
    assert u16(data,26) == 3 and u16(data,28) == 0xfffe
    size,mini_size=1<<u16(data,30),1<<u16(data,32)
    assert size == 512 and mini_size == 64 and u32(data,72) == 0
    def sector(i):
        assert 0 <= i < len(data)//size-1
        return data[(i+1)*size:(i+2)*size]
    fats=[u32(data,76+4*i) for i in range(109) if u32(data,76+4*i)<0xfffffffa]
    assert len(fats) == u32(data,44)
    fat=b"".join(sector(i) for i in fats)
    def chain(first,table,reader):
        parts=[];seen=set();i=first
        while i != 0xfffffffe:
            assert i < 0xfffffffa and i not in seen and 4*i+4 <= len(table)
            seen.add(i);parts.append(reader(i));i=u32(table,4*i)
        return b"".join(parts)
    directory=chain(u32(data,48),fat,sector)
    entries=[]
    for p in range(0,len(directory),128):
        d=directory[p:p+128];n=u16(d,64)
        if not n or not d[66]:continue
        entries.append({"id":p//128,"name":d[:n-2].decode("utf-16le"),"type":d[66],"first":u32(d,116),"bytes":struct.unpack_from("<Q",d,120)[0]})
    root=next(e for e in entries if e["type"]==5)
    mini=chain(root["first"],fat,sector)[:root["bytes"]]
    mf=chain(u32(data,60),fat,sector)
    streams={}
    for e in entries:
        if e["type"] != 2:continue
        reader=lambda i:mini[i*mini_size:(i+1)*mini_size]
        b=chain(e["first"],mf,reader) if e["bytes"]<u32(data,56) else chain(e["first"],fat,sector)
        b=b[:e["bytes"]];assert len(b)==e["bytes"]
        assert e["name"] not in streams
        streams[e["name"]]=b;e["sha256"]=digest(b)
    return entries,streams
