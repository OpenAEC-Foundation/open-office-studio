"""Bounded HWP3 native text reader from Hancom's published binary layout."""
import hashlib,struct,unicodedata,zlib

class Reader:
 def __init__(self,data):self.data=data;self.pos=0
 def take(self,n):
  assert n>=0 and self.pos+n<=len(self.data),'Native record exceeds stream bounds'
  b=self.data[self.pos:self.pos+n];self.pos+=n;return b
 def num(self,n):return int.from_bytes(self.take(n),'little')

MEDIAL=[3,4,5,6,7,10,11,12,13,14,15,18,19,20,21,22,23,26,27,28,29]
FINAL=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20,21,22,23,24,25,26,27,28,29]
def modern_hangul(code):
 initial=(code>>10)&31;medial=(code>>5)&31;final=code&31
 assert code&0x8000 and 2<=initial<=20 and medial in MEDIAL and final in FINAL,'Outside accepted modern Johab syllables'
 return chr(0xAC00+((initial-2)*21+MEDIAL.index(medial))*28+FINAL.index(final))

def native(source,edit):
 assert source[:30]==b'HWP Document File V3.00 \x1a\x01\x02\x03\x04\x05'
 info=source[30:158];assert len(info)==128
 encrypted=int.from_bytes(info[96:98],'little');compressed=info[124];info_len=int.from_bytes(info[126:128],'little');assert encrypted==0 and compressed==1
 begin=30+128+1008+info_len;z=zlib.decompressobj(-15);data=z.decompress(source[begin:],1_000_000);assert z.eof and not z.unconsumed_tail
 data+=z.flush();trailer=z.unused_data;assert len(data)<1_000_000 and len(trailer)>=8
 crc,size=struct.unpack_from('<II',trailer);assert crc==zlib.crc32(data) and size==len(data)
 r=Reader(data);fonts=[]
 for language in range(7):
  at=r.pos;n=r.num(2);assert 0<n<1024;names=r.take(n*40)
  fonts.append({'language':language,'offset':at,'count':n,'bytes':len(names),'sha256':hashlib.sha256(names).hexdigest()})
 style_offset=r.pos;count=r.num(2);assert count<1024;styles=[]
 for i in range(count):
  at=r.pos;name=r.take(20);shape=r.take(31);para=r.take(187)
  styles.append({'index':i,'offset':at,'nameHex':name.hex(),'characterShapeHex':shape.hex(),'paragraphShapeHex':para.hex()})
 start=r.pos;paragraphs=[];previous_shape=None;observed={}
 while True:
  at=r.pos;reuse,nchars,nlines,char_shapes,flags,control_mask,style=struct.unpack('<BHHBBIB',r.take(12));representative=r.take(31)
  if not nchars:
   terminal={'offset':at,'endOffset':r.pos,'characters':0,'representativeShapeHex':representative.hex()};break
  assert len(paragraphs)<1000 and nchars<10000 and nlines<1000
  if reuse:assert previous_shape is not None;shape=previous_shape
  else:shape=r.take(187)
  previous_shape=shape;lines=r.take(nlines*14);shapes=[];current=representative
  if char_shapes:
   for i in range(nchars):
    same=r.num(1)
    if not same:current=r.take(31)
    elif i==0:current=representative
    shapes.append({'index':i,'inherited':bool(same),'hex':current.hex()})
  codes=[];text=[];characters_start=r.pos
  for i in range(nchars):
   code=r.num(2);codes.append(code)
   if code==13:assert i==nchars-1;continue
   assert code>=32,'Control semantics outside accepted CR-only fixture'
   if code<128:character=chr(code)
   else:
    character=modern_hangul(code)
    # Independent Python Johab codec agrees with the own composition formula.
    assert code.to_bytes(2,'big').decode('johab')==character
    observed[f'{code:04x}']=f'U+{ord(character):04X}'
   text.append(character)
  assert codes[-1]==13 and control_mask==0,'Only explicit paragraph end control accepted'
  text=''.join(text);assert unicodedata.normalize('NFC',text)==text
  paragraphs.append({'offset':at,'endOffset':r.pos,'charactersOffset':characters_start,'declaredCharacters':nchars,'lines':nlines,'reuseParagraphShape':reuse,'hasPerCharacterShapes':char_shapes,'flags':flags,'controlMask':control_mask,'styleIndex':style,'representativeShapeHex':representative.hex(),'paragraphShapeHex':shape.hex(),'lineRecordsHex':lines.hex(),'perCharacterShapes':shapes,'nativeCodes':[f'{c:04x}' for c in codes],'text':text,'unicodeCodePoints':[f'U+{ord(c):04X}' for c in text]})
 assert len(paragraphs)==2 and len(data)-r.pos==8
 texts=[p['text'] for p in paragraphs];edited=list(texts);edited[edit['paragraph']]=edit['text']+edited[edit['paragraph']]
 return {'method':'Own bounded reader of Hancom HWP3 binary tables, raw Deflate CRC/size, font/style/paragraph/character records and modern Johab composition; no converter output baseline','signature':source[:30].hex(),'info':{'encrypted':encrypted,'compressed':compressed,'subRevision':info[125],'infoBlockBytes':info_len,'compressedOffset':begin,'summaryBytes':1008},'expanded':{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'crc32':f'{crc:08x}','trailerHex':trailer.hex()},'fonts':fonts,'stylesOffset':style_offset,'styles':styles,'paragraphsOffset':start,'paragraphs':paragraphs,'terminal':terminal,'opaqueExpandedTailHex':data[r.pos:].hex(),'observedModernSyllables':observed,'expected':{'texts':texts,'editedTexts':edited,'edit':edit,'paragraphEndControl':13,'paragraphCount':2},'fullFormatAcceptance':False}
