"""Independent original gzip/XML qualification; no Office or engine execution."""
import hashlib
import struct
import zlib
from xml.etree import ElementTree as E

G='{http://www.gnumeric.org/v10.dtd}'
def sha(b):return hashlib.sha256(b).hexdigest()

def unpack(data,bound=100000):
    assert len(data)>=18 and data[:4]==bytes.fromhex('1f8b0800')
    decoder=zlib.decompressobj(-15)
    raw=decoder.decompress(data[10:-8],bound+1)
    assert len(raw)<=bound and decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail
    crc,size=struct.unpack('<II',data[-8:])
    assert crc==zlib.crc32(raw)&0xffffffff and size==len(raw)
    return raw,{'members':1,'flags':data[3],'mtime':struct.unpack('<I',data[4:8])[0],
                'os':data[9],'crc32':f'{crc:08x}','isize':size,'deflateBytes':len(data)-18,
                'expandedXmlSha256':sha(raw),'xmlBytes':len(raw)}

def native(data):
    raw,container=unpack(data)
    assert b'<!DOCTYPE' not in raw.upper() and b'<!ENTITY' not in raw.upper()
    root=E.fromstring(raw);assert root.tag==G+'Workbook'
    sheets=root.find(G+'Sheets');assert len(sheets)==3 and all(s.tag==G+'Sheet' for s in sheets)
    inventory=[]
    for s in sheets:
        cells=s.find(G+'Cells');assert cells is not None and len(cells)==0
        styles=s.find(G+'Styles')
        inventory.append({'name':s.findtext(G+'Name'),'typedCellCount':0,'cellFormulaCount':0,
                          'styleRegionCount':len(styles),
                          'defaultColumns':s.find(G+'Cols').attrib,'defaultRows':s.find(G+'Rows').attrib,
                          'displayFormulasSetting':s.get('DisplayFormulas'),
                          'positiveStyleOrFontPreservationAccepted':False})
    names=[s['name'] for s in inventory];assert names==['Sheet1','Sheet2','Sheet3']
    index=[e.text for e in root.find(G+'SheetNameIndex')];assert index==names
    return {'container':container,'namespace':G[1:-1],
            'generatorVersionSelfReport':root.find(G+'Version').attrib,
            'schemaLocationInventory':root.attrib,'externalSchemaLoaded':False,'schemaConformanceAccepted':False,
            'sheets':inventory,'sheetNameIndex':index,'ordinaryTypedCellCount':0,'originalFormulaCount':0,
            'calculationMetadataOnly':root.find(G+'Calculation').attrib,
            'positiveTypeValueFormulaImportWitness':False,
            'sourceQualification':'Authentic valid empty-workbook regression source; not corrupt and not a positive cell/formula witness',
            'originalContainerRoute':'.gnumeric','newGnmAliasExecutionClaim':False,'fullFormatAccepted':False}

def controls(data):
    variants=[]
    corrupt=bytearray(data);corrupt[-8]^=1
    for name,value,bound in [('wrong-crc',bytes(corrupt),100000),('truncated-trailer',data[:-1],100000),
                             ('concatenated-members-outside-single-source-contract',data+data,100000),
                             ('source-exceeds-explicit-reader-bound',data,100)]:
        try:unpack(value,bound)
        except (AssertionError,zlib.error):variants.append({'case':name,'sourceReaderRejected':True})
        else:raise AssertionError('Container oracle control unexpectedly accepted: '+name)
    return variants
