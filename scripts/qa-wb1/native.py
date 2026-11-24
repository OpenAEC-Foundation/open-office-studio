"""Independent bounded WB1 record/cell/RPN inventory. No product parser call."""
from fractions import Fraction
import hashlib
import math
import struct


class SharedLookupBoundary(Exception):
    """Stop at a lookup opcode; its product fault belongs to the #381 owner."""


def address(col,row):
    assert 0 <= col < 26 and 0 <= row < 8192
    return chr(65+col)+str(row+1)


def parse_formula(payload,col,row,sheet):
    cached,flags,total,ref_offset = struct.unpack_from('<dHHH',payload,6)
    assert len(payload)==20+total and ref_offset <= total
    program = payload[20:20+ref_offset]
    raw_refs = payload[20+ref_offset:]
    assert len(raw_refs)%6==0
    refs = []
    for at in range(0,len(raw_refs),6):
        note,c,p,bits = struct.unpack_from('<HBBH',raw_refs,at)
        dc = c-256 if bits&0x4000 and c&128 else c
        dp = p-256 if bits&0x8000 and p&128 else p
        r = bits&0x1fff
        if bits&0x2000 and r&0x1000:
            r -= 0x2000
        target_col = col+dc if bits&0x4000 else c
        target_sheet = sheet+dp if bits&0x8000 else p
        target_row = row+r if bits&0x2000 else r
        refs.append(dict(note=note,rawHex=raw_refs[at:at+6].hex(),candidateSheet=target_sheet,
                         candidateAddress=address(target_col,target_row),
                         qualified=note==0))
    pos = used = 0
    stack,ops = [],[]
    while pos < len(program):
        op = program[pos]
        pos += 1
        ops.append(op)
        if op==85:
            raise SharedLookupBoundary('Native VLOOKUP boundary: hand source observation to #381 owner')
        if op==1:
            assert used<len(refs)
            stack.append(dict(kind='ref',reference=refs[used]))
            used += 1
        elif op==5:
            value = struct.unpack_from('<h',program,pos)[0]
            pos += 2
            stack.append(dict(kind='integer',value=value))
        elif op==12:
            assert len(stack)>=2
            right,left = stack.pop(),stack.pop()
            stack.append(dict(kind='divide',left=left,right=right))
        elif op==8:
            assert stack
            stack.append(dict(kind='negate',child=stack.pop()))
        elif op==3:
            assert pos==len(program) and len(stack)==1 and used==len(refs)
            break
        else:
            raise AssertionError('Token outside bounded WB1 oracle: '+str(op))
    assert ops[-1]==3 and len(stack)==1
    return dict(programHex=program.hex(),referenceBytesHex=raw_refs.hex(),tokenOpcodes=ops,ast=stack[0],
                sourceFlags=flags,rawCachedHex=payload[6:14].hex(),
                cacheKind='finite-number' if math.isfinite(cached) else 'nonfinite-unqualified',
                cachedValue=repr(cached) if math.isfinite(cached) else None,
                containsLookupOpcode=False)


def evaluate(node,cells):
    if node['kind']=='integer':
        return Fraction(node['value'])
    if node['kind']=='divide':
        return evaluate(node['left'],cells)/evaluate(node['right'],cells)
    if node['kind']=='ref':
        ref = node['reference']
        assert ref['qualified']
        target = cells[str(ref['candidateSheet'])+'!'+ref['candidateAddress']]
        assert target['kind']=='integer'
        return Fraction(int(target['value']))
    raise AssertionError('Error/negation semantics not accepted by this numeric evaluator')


def inspect_source(data):
    assert data[:6]==bytes.fromhex('000002000110'), 'actual WB1, not WB2 or WQ2'
    pos,sheet = 0,None
    records,cells,sheets = [],{},[]
    while pos<len(data):
        assert pos+4<=len(data)
        kind,size = struct.unpack_from('<HH',data,pos)
        begin,end = pos+4,pos+4+size
        assert end<=len(data), 'native record boundary'
        payload = data[begin:end]
        records.append(dict(offset=pos,type=kind,bytes=size,payloadSha256=hashlib.sha256(payload).hexdigest()))
        if kind==202:
            assert size==1 and sheet is None and payload[0]==len(sheets)
            sheet = payload[0]
            sheets.append(dict(id=sheet,name=None))
        elif kind==203:
            assert size==1 and sheet is not None and payload[0]==sheet
            sheet = None
        elif kind==204:
            assert sheet is not None and payload.endswith(b'\0') and b'\0' not in payload[:-1]
            sheets[sheet]['name'] = payload[:-1].decode('ascii')
        elif kind in (12,13,14,15,16):
            assert sheet is not None and size>=6
            col,page,row,style = struct.unpack_from('<BBHH',payload)
            assert page==sheet
            ref = address(col,row)
            key = str(sheet)+'!'+ref
            assert key not in cells
            cell = dict(sheet=sheet,address=ref,recordOffset=pos,recordType=kind,styleWord=style,rawHex=payload[6:].hex())
            if kind==12:
                assert size==6
                cell.update(kind='blank',value=None)
            elif kind==13:
                assert size==8
                cell.update(kind='integer',value=str(struct.unpack_from('<h',payload,6)[0]))
            elif kind==14:
                assert size==14
                value = struct.unpack_from('<d',payload,6)[0]
                assert math.isfinite(value)
                cell.update(kind='float',value=repr(value))
            elif kind==15:
                assert payload[6] in (39,34,94)
                text,separator,tail = payload[7:].partition(b'\0')
                assert separator, 'NUL-terminated native label'
                cell.update(kind='text',value=text.decode('ascii'),alignmentByte=payload[6],
                            afterTerminatorHex=tail.hex(),tailAcceptedAsText=False)
            else:
                cell.update(kind='formula',formula=parse_formula(payload,col,row,sheet))
            cells[key] = cell
        elif kind==1:
            assert size==0 and end==len(data) and sheet is None, 'EOF/trailer/sheet closure'
        pos = end
    assert records[-1]['type']==1 and len(records)==379 and len(sheets)==3
    assert len(cells)==89
    for cell in cells.values():
        if cell['kind']=='formula':
            f = cell['formula']
            if f['cacheKind']=='finite-number' and f['ast']['kind']!='negate':
                calculated = evaluate(f['ast'],cells)
                f['independentFraction'] = str(calculated)
                f['independentlyCalculatedValue'] = repr(float(calculated))
                f['sourceCacheMatchesCalculation'] = float(calculated)==float(f['cachedValue'])
                f['numericSemanticsAccepted'] = True
            else:
                f['numericSemanticsAccepted'] = False
                f['boundary'] = 'Nonfinite cache and nonzero reference note / cross-sheet error projection unqualified'
    return dict(nativeBOF='1001',family='WB1 native flat records; producer/application build not attested',
                sheets=sheets,cells=cells,records=records,recordCount=len(records),trailerBytes=0,
                decodedFormulaPrograms=4,lookupOpcodesObserved=0,
                boundary381='No lookup instruction in these four parsed programs. No #381 product parser, patch or overlay was inspected or changed.',
                opaqueSemantics='Non-cell records inventoried by length/hash only; graph/font/style/macro/link/encryption semantics unaccepted',
                fullFormatAcceptance=False)
