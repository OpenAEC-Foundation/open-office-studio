"""Fixture-bounded DIF prefix reader; preserve physical line/framing gaps.

This does not implement general DIF recovery, complete grammar or the converter.
"""
import re

def address(col):
    out=''
    while col>=0:col,n=divmod(col,26);out=chr(65+n)+out;col-=1
    return out+'1'

def native(data):
    raw=data.split(b'\r\n');assert raw[-1]==b''
    # Remove only final split sentinel, not any actual blank physical line.
    lines=[b.decode('ascii') for b in raw[:-1]]
    assert b'\n' not in data.replace(b'\r\n',b'') and b'\r' not in data.replace(b'\r\n',b'')
    offsets=[];offset=0
    for b in raw[:-1]:offsets.append(offset);offset+=len(b)+2
    headers=[]
    for i,topic in enumerate(['TABLE','VECTORS','TUPLES','DATA']):
        start=i*3;assert lines[start]==topic
        match=re.fullmatch(r'(\d+),(\d+)',lines[start+1]);assert match
        payload=lines[start+2];assert payload.startswith('"') and payload.endswith('"')
        assert '"' not in payload[1:-1]  # No generic DIF quote/escape claim.
        headers.append({'topic':topic,'vector':int(match[1]),'value':int(match[2]),'payload':payload[1:-1],
                        'line':start+1,'byteOffset':offsets[start]})
    assert headers[0]['payload']=='EXCEL' and headers[1]['value']==315 and headers[2]['value']==32
    i=12;assert lines[i:i+2]==['-1,0','BOT'];bot={'line':i+1,'byteOffset':offsets[i]};i+=2
    cells={};records=[]
    while i+1<len(lines) and lines[i].startswith('0,'):
        match=re.fullmatch(r'0,([0-9]+)',lines[i]);assert match and lines[i+1]=='V'
        col=len(cells);value=int(match[1]);cell=address(col)
        cells[cell]={'kind':'number','value':value,'formula':None}
        records.append({'line':i+1,'byteOffset':offsets[i],'recordType':0,'status':'V','literalNumber':match[1],'mappedCell':cell})
        i+=2
    assert len(cells)==32 and [c['value'] for c in cells.values()]==list(range(1,33))
    tail=[{'line':j+1,'byteOffset':offsets[j],'text':lines[j]} for j in range(i,len(lines))]
    assert [x['text'] for x in tail]==['-1,0','','EOD']
    return {'method':'Own bounded ASCII CRLF/topic/BOT/numeric-V record reader, no converter output baseline',
            'headers':headers,'tableLabel':'EXCEL','producerAuthenticated':False,
            'populatedTupleCount':1,'numericPrefixCellCount':32,'records':records,'bot':bot,
            'expectedCellsInFirstTuple':cells,'sourceFormulaWitness':False,'sourceFormulaRecordCount':0,
            'terminationInventory':tail,'alignedTerminatorPairQualified':False,
            'completeDIFGrammarQualified':False,
            'qualificationLimit':'A physical empty line separates final -1,0 and EOD. No blank-line removal or recovery is used to assert complete grammar. VECTORS/TUPLES are retained declarations, not invented filled cells.',
            'fullFormatAccepted':False}
