"""Original ZABW one-member gzip wrapper plus verified reused XML oracle."""
import hashlib,struct,zlib
from xml_oracle import native as xml_native
INNER_SHA='ddcde2c8876a316a8e02501202c1316e9e7c52d8728c7d78e43ccd41ade45d50'
MAX_XML_BYTES=1000000

def inflate_container(data):
 assert len(data)>=28 and data[:3]==b'\x1f\x8b\x08','Not gzip Deflate ZABW'
 flags=data[3];assert flags==8,'Only actual fixture FNAME member variant is accepted'
 end=data.index(b'\0',10);name=data[10:end].decode('ascii');assert name=='hello.abw' and end+1<len(data)-8
 z=zlib.decompressobj(31);xml=z.decompress(data,MAX_XML_BYTES+1)
 assert len(xml)<=MAX_XML_BYTES,'Oversized XML expansion'
 assert z.eof,'Incomplete gzip member'
 assert not z.unconsumed_tail and not z.unused_data,'Concatenated members or trailing gzip data'
 xml+=z.flush();assert len(xml)<=MAX_XML_BYTES
 crc,size=struct.unpack('<II',data[-8:]);assert zlib.crc32(xml)==crc and len(xml)%2**32==size
 return xml,{'magic':data[:2].hex(),'compressionMethod':data[2],'flags':flags,'mtime':struct.unpack_from('<I',data,4)[0],'xfl':data[8],'os':data[9],'filename':name,'headerBytes':end+1,'compressedDeflateBytes':len(data)-(end+1)-8,'crc32':f'{crc:08x}','isize':size,'members':1,'eof':True,'unusedBytes':0,'maxXMLBytes':MAX_XML_BYTES,'expandedBytes':len(xml),'expandedSha256':hashlib.sha256(xml).hexdigest()}

def native(data,edit):
 xml,container=inflate_container(data);assert len(xml)==2615 and hashlib.sha256(xml).hexdigest()==INNER_SHA
 result=xml_native(xml,edit)
 result['container']=container
 result['innerBytesEqualPriorPublishedABW']=True
 result['method']='Own bounded original ZABW gzip/CRC/ISIZE validation followed by exact reused source XML reader; no ABW runtime outcome transferred'
 return result
