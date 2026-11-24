"""Own bounded native LWP reader; no converter/parser-output baseline."""
from collections import Counter
import hashlib,struct

class Reader:
 def __init__(self,b,pos=0):self.b=b;self.pos=pos
 def take(self,n):
  assert n>=0 and self.pos+n<=len(self.b),'Native field outside object'
  v=self.b[self.pos:self.pos+n];self.pos+=n;return v
 def num(self,n):return int.from_bytes(self.take(n),'little')
 def oid(self):
  i=self.num(1);lo=None if i else self.num(4);hi=self.num(2)
  return None if (i,lo,hi)==(0,0,0) else [i,lo,hi]
 def extra(self):
  while self.num(2):pass

def expand(data):
 r=Reader(data);out=bytearray()
 while r.pos<len(data):
  code=r.num(1);kind=code>>6
  if kind==0:out+=bytes((code&63)+1)
  elif kind==1:out+=bytes(((code>>3)&7)+1)+r.take((code&7)+1)
  else:out+=(b'\0' if kind==2 else b'')+r.take((code&63)+1)
  assert len(out)<65536,'Expanded native object too large'
 return bytes(out)

def object_at(b,offset):
 r=Reader(b,offset);typ=r.num(2);flags=r.num(1);oid=r.oid()
 version=r.num([0,1,2,4][flags&3]) if flags&3 else 2
 refs=r.num({0:4,4:1,8:2,12:4}[flags&12]);previous=r.num(4) if flags&64 else None
 size=r.num({0:4,16:1,32:2,48:4}[flags&48]);start=r.pos;raw=r.take(size);data=expand(raw) if flags&128 else raw
 return {'offset':offset,'type':typ,'flags':flags,'oid':oid,'version':version,'references':refs,'previousOffset':previous,'headerBytes':start-offset,'storedBytes':size,'expandedBytes':len(data),'expandedSha256':hashlib.sha256(data).hexdigest()},data,r.pos

def indexed_keys(r):
 count=r.num(2);keys=[]
 for i in range(count):
  diff=r.num(1) if i else 255
  low,high=(r.num(4),r.num(2)) if diff==255 else (keys[-1][0],keys[-1][1]+diff+1)
  keys.append([low,high])
 return keys,[[*key,r.num(4)+16] for key in keys]

def para(obj,data):
 r=Reader(data);nxt=r.oid();prev=r.oid();disk=r.num(1);simple=bool(disk&1)
 ordinal=1 if simple else r.num(4)
 if not simple and disk&2:
  for _ in range(2):r.oid();r.extra()
 flags=r.num(2);style=r.oid();hint=None if simple else r.take(8).hex();story=r.oid();level=1 if simple else r.num(2)
 fribs=[]
 while True:
  at=r.pos;tag=r.num(1);typ=tag&63
  if not typ:break
  editor=r.num(1);mods=[]
  if tag&128:
   while True:
    mt=r.num(1)
    if not mt:break
    ln=r.num(1);mods.append({'type':mt,'hex':r.take(ln).hex()})
  ln=r.num(2);raw=r.take(ln)
  # Source acceptance uses ASCII-only text fribs; all other fribs remain typed inventory.
  text=raw.decode('ascii') if typ==2 and all(c<128 for c in raw) else None
  fribs.append({'offsetInObject':at,'type':typ,'tag':tag,'editor':editor,'modifiers':mods,'bytes':ln,'hex':raw.hex(),'text':text})
 props=[]
 while True:
  tag=r.take(4).decode('ascii')
  if tag=='SEnd':break
  ln=r.num(2);props.append({'tag':tag,'bytes':ln,'hex':r.take(ln).hex()})
 assert r.pos==len(data),'Unexplained paragraph payload'
 return {'oid':obj['oid'],'offset':obj['offset'],'next':nxt,'previous':prev,'ordinal':ordinal,'flags':flags,'style':style,'story':story,'level':level,'hintHex':hint,'fribs':fribs,'properties':props,'text':''.join(f['text'] or '' for f in fribs)}

def native(data,edit):
 assert data[:16]==b'WordPro\0'+bytes(8) and data[16:20]==b'LWP7'
 u16=lambda p:struct.unpack_from('<H',data,p)[0]
 u32=lambda p:struct.unpack_from('<I',data,p)[0]
 assert u32(42)==46 and u16(48)==17
 root_offset=u32(62)+16;objects=[];payloads={};end=92
 while end<root_offset:
  obj,payload,end=object_at(data,end);assert end<=root_offset
  objects.append(obj);payloads[obj['offset']]=payload
 assert end==root_offset
 root,rd,tail=object_at(data,root_offset);assert root['type']==65532
 rr=Reader(rd);count=rr.num(2);keys=[]
 for i in range(count):
  d=rr.num(1) if i else 255
  keys.append([rr.num(4),rr.num(2)] if d==255 else [keys[-1][0],keys[-1][1]+d+1])
 roots=[[*k,rr.num(4)+16] for k in keys];children=[rr.num(4)+16 for _ in range(count+1)]
 times=[rr.num(4) for _ in range(rr.num(2))];assert rr.pos==len(rd)
 entries=list(roots)
 for child in children:
  obj,payload,_=object_at(data,child);assert obj['type']==65534
  lr=Reader(payload);_,leaf=indexed_keys(lr);assert lr.pos==len(payload);entries+=leaf
 byoffset={o['offset']:o for o in objects};seen=set()
 for low,high,offset in entries:
  o=byoffset[offset];i,lo,hi=o['oid'];actual_low=times[i-1] if i else lo
  assert (low,high)==(actual_low,hi) and offset not in seen;seen.add(offset)
 assert len(seen)==sum(o['type']!=65534 for o in objects)
 paragraphs=[para(o,payloads[o['offset']]) for o in objects if o['type']==0]
 byid={str(p['oid']):p for p in paragraphs};chain=[];p=byid[str([1,None,155])]
 while p:
  assert p['story']==[1,None,150] and p['oid'] not in [q['oid'] for q in chain]
  if chain:assert p['previous']==chain[-1]['oid']
  chain.append(p);p=byid.get(str(p['next']))
 assert len(chain)==28 and chain[-1]['next'] is None
 prefix=chain[:16]
 assert all(f['type'] in [1,2] and (f['type']!=2 or f['text'] is not None) and all(m['type']!=2 for m in f['modifiers']) for p in prefix for f in p['fribs'])
 center=prefix[11];assert center['text']=='This line is centered align.'
 prop=next(x for x in center['properties'] if x['tag']=='PAln');pr=Reader(bytes.fromhex(prop['hex']));target=pr.oid();assert pr.pos==len(pr.b)
 piece=next(o for o in objects if o['oid']==target);assert piece['type']==196
 ar=Reader(payloads[piece['offset']]);ar.oid();ar.oid();assert ar.num(2)==1
 values,override,apply=ar.num(2),ar.num(2),ar.num(2);ar.extra();align=ar.num(1);position=ar.num(4);character=ar.num(2);ar.extra();opaque_tail=ar.take(len(ar.b)-ar.pos).hex()
 assert align==2 and values&1 and override&1 and apply&1
 texts=[p['text'] for p in prefix];edited=list(texts);edited[edit['paragraph']]=edit['text']+edited[edit['paragraph']]
 return {'method':'Own bounded raw object/RLE/index/time-table/paragraph/frib reader; pinned LibreOffice primary sources consulted for layouts, never executed as source oracle','header':{'appRevision':u16(46),'fileRevision':u16(48),'appRelease':u16(50),'requiredAppRevision':u16(52),'requiredFileRevision':u16(54),'rootIndexOffset':root_offset,'mainObjectStart':92,'rootEnd':tail,'opaqueSuffixBytes':len(data)-tail},'objectCount':len(objects),'objectTypes':dict(Counter(o['type'] for o in objects)),'objects':objects,'index':{'root':root,'rootEntries':roots,'leafOffsets':children,'timeTable':times,'verifiedEntries':len(entries)},'paragraphs':paragraphs,'mainStoryChain':[p['oid'] for p in chain],'acceptedPrefix':prefix,'centerAnchor':{'paragraph':11,'text':center['text'],'property':prop,'piece':piece,'values':values,'override':override,'apply':apply,'opaqueTailHex':opaque_tail,'nativeAlignment':align,'expectedDocxAlignment':'center'},'expected':{'texts':texts,'editedTexts':edited,'edit':edit},'fullFormatAcceptance':False}
