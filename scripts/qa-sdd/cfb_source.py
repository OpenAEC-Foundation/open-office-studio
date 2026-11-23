"""Small independent read-only CFB/native-record reader for the pinned SDD fixture.

No product library or Office engine is imported. This is not a general SDD importer.
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


def native_pages(main):
    assert main[:4] == b"DrMd" and u16(main,4)==17
    assert (u32(main,84),u32(main,88),u16(main,92)) == (1,1,0), "Object unit changed"
    pages=[];start=0
    while True:
        start=main.find(b"DrPg",start)
        if start<0:break
        p=start;start+=4
        assert u16(main,p+4)==17
        length=u32(main,p+6);assert p+length<=len(main)
        assert u32(main,p+10)==6 and main[p+20:p+24]==b"JoeM"
        assert u32(main,p+24)==30 and main[p+54:p+58]==b"DrML"
        assert u16(main,p+64)==1 and main[p+66:p+70]==b"DrMD"
        page={"offset":p,"bytes":length,"masterId":u16(main,p+76),"nativeSize":[i32(main,p+28),i32(main,p+32)],"topObjects":[],"leafObjects":[]}
        q=p+110
        while main[q:q+4]==b"DrOb":
            n=u32(main,q+6);assert n>=36 and q+n<=p+length
            assert main[q+10:q+14]==b"SVDr"
            page["topObjects"].append({"offset":q,"bytes":n,"type":u16(main,q+14)})
            nested=[];j=q
            while j<q+n:
                j=main.find(b"DrOb",j,q+n)
                if j<0:break
                if j+36<=q+n and u16(main,j+4)==17 and main[j+10:j+14]==b"SVDr" and j+u32(main,j+6)<=q+n:
                    nested.append(j)
                j+=4
            for a in nested:
                end=a+u32(main,a+6)
                if any(a<c<end for c in nested):continue
                bounds=[i32(main,a+k) for k in (20,24,28,32)]
                left,top,right,bottom=bounds
                assert right>=left and bottom>=top
                page["leafObjects"].append({"offset":a,"bytes":u32(main,a+6),"type":u16(main,a+14),"boundsNative":bounds,
                    "rectEMU":{"x":left*360,"y":top*360,"width":(right-left)*360,"height":(bottom-top)*360}})
            q+=n
        assert main[q:q+4]==b"DrXX"
        pages.append(page)
    assert [p["masterId"] for p in pages] == [0,1,2,1,2]
    visible=[p for p in pages if p["masterId"]>0 and p["masterId"]%2==1]
    assert len(visible)==2 and [len(p["topObjects"]) for p in visible]==[7,7]
    assert [len(p["leafObjects"]) for p in visible]==[10,9]
    assert all(p["nativeSize"]==[28002,20999] for p in visible)
    return pages,visible
