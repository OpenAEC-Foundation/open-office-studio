"""Bounded native record/RPN reader for lo-wks-1. No converter output input.

Implementation-guided layout, not a normative producer specification. COUNT
and STD-family type/statistical semantics retain explicit variant limits.
"""
import math
import statistics
import struct


def address(col,row):
    assert 0 <= col < 26 and row >= 0
    return chr(65+col)+str(row+1)


def formula(tokens,col,row):
    stack, ledger = [], []
    pos = 0
    def reference(at):
        raw = struct.unpack_from('<HH',tokens,at)
        out = []
        for value,origin in zip(raw,(col,row)):
            # Only this source's small signed relative offsets are qualified.
            assert value & 0x8000
            delta = value & 0x3fff
            if delta & 0x2000:
                delta -= 0x4000
            assert -2 <= delta <= 1
            out.append(origin+delta)
        return dict(kind='ref',address=address(*out),encodedWords=list(raw)),at+4
    while pos < len(tokens):
        at = pos
        op = tokens[pos]
        pos += 1
        ledger.append(dict(offset=at,opcode=op))
        if op == 1:
            node,pos = reference(pos)
            stack.append(node)
        elif op == 2:
            a,pos = reference(pos)
            b,pos = reference(pos)
            stack.append(dict(kind='range',first=a,last=b))
        elif op == 5:
            value = struct.unpack_from('<h',tokens,pos)[0]
            pos += 2
            stack.append(dict(kind='integer',value=value))
        elif op == 6:
            end = tokens.index(0,pos)
            value = tokens[pos:end].decode('ascii')
            pos = end+1
            stack.append(dict(kind='text',value=value))
        elif op in (0x0e,0x2f,0x3b,0x50,0x52,0x58):
            name,arity = {0x0e:('EQUAL',2),0x2f:('MOD',2),0x3b:('IF',3),
                          0x50:('SUM',None),0x52:('COUNT_NUMERIC_ONLY_FAMILY',None),
                          0x58:('STD_POPULATION_INTERPRETATION',None)}[op]
            if arity is None:
                arity = tokens[pos]
                pos += 1
            assert arity > 0 and len(stack) >= arity
            args = stack[-arity:]
            del stack[-arity:]
            stack.append(dict(kind='call',function=name,sourceOpcode=op,args=args))
        elif op == 3:
            assert pos == len(tokens) and len(stack) == 1, 'formula terminator/stack'
            return dict(ast=stack[0],tokenLedger=ledger)
        else:
            raise AssertionError('unqualified token '+hex(op))
    raise AssertionError('missing formula terminator')


def evaluate(node,numbers):
    if node['kind']=='ref':
        return numbers[node['address']]
    if node['kind'] in ('integer','text'):
        return node['value']
    if node['kind']=='range':
        a,b = node['first']['address'],node['last']['address']
        assert a=='A1' and b=='B1', 'only source range qualified'
        return [numbers[a],numbers[b]]
    args = [evaluate(a,numbers) for a in node['args']]
    name = node['function']
    if name=='SUM':
        return sum(args[0])
    if name=='COUNT_NUMERIC_ONLY_FAMILY':
        assert all(isinstance(v,(int,float)) for v in args[0])
        return len(args[0])
    if name=='STD_POPULATION_INTERPRETATION':
        return statistics.pstdev(args)
    if name=='MOD':
        return args[0] % args[1]
    if name=='EQUAL':
        return args[0] == args[1]
    assert name=='IF'
    return args[1] if args[0] else args[2]


def inspect_source(data):
    pos = 0
    records, cells, companion = [], {}, {}
    bounds = None
    while pos < len(data):
        assert pos+4 <= len(data)
        kind,size = struct.unpack_from('<HH',data,pos)
        begin,end = pos+4,pos+4+size
        assert end <= len(data), 'record overrun'
        payload = data[begin:end]
        records.append(dict(offset=pos,type=kind,bytes=size,payloadHex=payload.hex()))
        if pos==0:
            assert kind==0 and payload==b'\x04\x04', 'BOF signature'
        elif kind==0:
            raise AssertionError('unexpected second BOF')
        if kind==6:
            assert size==8 and bounds is None
            bounds = list(struct.unpack('<4H',payload))
        elif kind in (0x0e,0x10,0x33):
            assert size>=5
            fmt,col,row = struct.unpack_from('<BHH',payload)
            ref = address(col,row)
            if kind==0x33:
                assert payload[5:].endswith(b'\0') and b'\0' not in payload[5:-1]
                assert ref not in companion
                companion[ref] = dict(recordOffset=pos,formatByte=fmt,text=payload[5:-1].decode('ascii'))
            else:
                assert ref not in cells
                cached = struct.unpack_from('<d',payload,5)[0]
                cell = dict(recordOffset=pos,formatByte=fmt,rawCacheHex=payload[5:13].hex())
                if kind==0x0e:
                    assert size==13 and math.isfinite(cached)
                    cell.update(kind='number',value=cached)
                else:
                    count = struct.unpack_from('<H',payload,13)[0]
                    assert count==size-15
                    decoded = formula(payload[15:],col,row)
                    cell.update(kind='formula',formulaBytes=payload[15:].hex(),formula=decoded,
                                cacheKind='number' if math.isfinite(cached) else 'nonfinite-with-unresolved-result',
                                cachedValue=cached if math.isfinite(cached) else None)
                cells[ref] = cell
        if kind==1:
            assert size==0 and end==len(data), 'EOF/trailer'
        pos = end
    assert records[-1]['type']==1 and bounds==[0,0,2,4]
    for ref,entry in companion.items():
        assert ref in cells and cells[ref]['kind']=='formula'
        assert cells[ref]['cacheKind']=='nonfinite-with-unresolved-result'
        cells[ref].update(cacheKind='string-companion',cachedValue=entry['text'],companion=entry)
    assert all(c.get('cacheKind')!='nonfinite-with-unresolved-result' for c in cells.values())
    numbers = {ref:c['value'] for ref,c in cells.items() if c['kind']=='number'}
    for cell in cells.values():
        if cell['kind']=='formula':
            cell['independentlyCalculatedValue'] = evaluate(cell['formula']['ast'],numbers)
            cell['calculationMatchesSourceCache'] = cell['independentlyCalculatedValue']==cell['cachedValue']
    return dict(bofPayload='0404',variantBoundary='Shared historical WKS-family signature; producer/Works/Lotus version is not independently attested',
                bounds=bounds,records=records,cells=cells,
                formulaBoundary='Opcode 0x58 population interpretation follows the pinned Lotus mapping and source cache; other variant semantics remain unqualified. Opcode 0x52 COUNT/COUNTA distinctions are untested on numeric-only data.',
                sampleStdAlternative=statistics.stdev([numbers['A1'],numbers['B1']]),
                sourceSheetName=None,fullFormatAcceptance=False)
