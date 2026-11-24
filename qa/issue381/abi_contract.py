"""Direct libwps namespace contract, not a claim of complete ABI compatibility.

Four observed weak std::_Rb_tree instantiations are listed individually in the
policy. A template's internal libwps argument does not make it a libwps API.
Unknown libwps-related exports, missing API or changed bindings still reject.
"""
import json
from pathlib import Path
import subprocess

def readelf_rows(listing):
    rows=[]
    for line in listing.splitlines():
        fields=line.split()
        if len(fields)<8 or not fields[0].endswith(':') or not fields[0][:-1].isdigit():continue
        if fields[6]=='UND':continue
        rows.append(dict(name=fields[7],type=fields[3],bind=fields[4],visibility=fields[5]))
    return rows

def classify(rows,policy):
    expected=set(policy['directApiSymbols'])
    known_weak=set(policy['permittedWeakStdTemplateSymbols'])
    assert len(expected)==3 and len(known_weak)==4
    direct={};weak={};other=0
    for symbol in rows:
        name=symbol['name']
        if name in expected:
            assert symbol['bind']=='GLOBAL' and symbol['type']=='FUNC' and symbol['visibility']=='DEFAULT',('Changed real API binding',symbol)
            assert name not in direct,('Duplicate API symbol',name)
            direct[name]=symbol
        elif name in known_weak:
            assert name.startswith('_ZNSt') and symbol['bind']=='WEAK' and symbol['type']=='FUNC' and symbol['visibility']=='DEFAULT',('Changed known std-template binding',symbol)
            assert name not in weak
            weak[name]=symbol
        elif '6libwps' in name:
            raise AssertionError(('Unknown libwps-related export is not waived',symbol))
        else:other+=1
    assert set(direct)==expected,('Missing direct libwps API',sorted(expected-set(direct)))
    return dict(directApi=[direct[n] for n in sorted(direct)],knownWeakStdExtras=[weak[n] for n in sorted(weak)],
        otherDefinedSymbolCount=other)

def compare_rows(baseline,candidate,policy):
    old=classify(baseline,policy);new=classify(candidate,policy)
    assert old['directApi']==new['directApi'],'Direct libwps namespace API changed'
    return dict(status='DIRECT_LIBWPS_API_SYMBOL_CONTRACT_MATCH_ONLY',baseline=old,candidate=new,
        completeAbiCompatibility=False,
        requiredOtherGates='SONAME/NEEDED/RPATH, dependencies, actual loaded ELF, original typed oracle and real conversion/edit/save/new-process reopen remain mandatory')

def compare_files(baseline,candidate,policy_path):
    policy=json.loads(Path(policy_path).read_bytes())
    def inspect(path):
        listing=subprocess.check_output(['readelf','--dyn-syms','--wide',str(path)],text=True)
        return readelf_rows(listing)
    return compare_rows(inspect(baseline),inspect(candidate),policy)
