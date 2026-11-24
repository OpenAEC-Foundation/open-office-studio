"""Read-only regression on both retained original ELFs; no new runtime/build."""
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
import zipfile

sys.path.insert(0,str(Path('.local/issue381/elf-check').resolve()))
from elftools.elf.elffile import ELFFile
from abi_contract import classify,compare_rows,readelf_rows

policy=json.loads(Path('qa/issue381/abi-symbol-policy.json').read_bytes())
archive=Path('docs/tests/issue381-20261124/runtime-45376152078/artifact.zip').read_bytes()
assert hashlib.sha256(archive).hexdigest()=='9752a031fcce02a403127141bae34fc7c4031755f8ac5f440b501355f9b85b29'
def rows(name):
    with zipfile.ZipFile(io.BytesIO(archive)) as evidence:
        data=evidence.read('.local/issue381/build-proof/'+name+'.so')
    if name=='packaged':assert hashlib.sha256(data).hexdigest()==policy['baselineLibrarySha256']
    elf=ELFFile(io.BytesIO(data))
    return [dict(name=s.name,type=s['st_info']['type'].removeprefix('STT_'),
        bind=s['st_info']['bind'].removeprefix('STB_'),visibility=s['st_other']['visibility'].removeprefix('STV_'))
        for s in elf.get_section_by_name('.dynsym').iter_symbols() if s['st_shndx']!='SHN_UNDEF']
old=rows('packaged');new=rows('rebuilt-control')

class ContractTests(unittest.TestCase):
    def test_original_three_api_exports(self):
        value=classify(old,policy)
        self.assertEqual(len(value['directApi']),3);self.assertEqual(value['knownWeakStdExtras'],[])
    def test_actual_control_three_api_four_separate_std_extras(self):
        value=compare_rows(old,new,policy)
        self.assertEqual(len(value['candidate']['directApi']),3)
        self.assertEqual(len(value['candidate']['knownWeakStdExtras']),4)
        self.assertFalse(value['completeAbiCompatibility'])
    def test_missing_real_api_still_rejects(self):
        for name in policy['directApiSymbols']:
            with self.subTest(name=name),self.assertRaises(AssertionError):
                compare_rows(old,[s for s in new if s['name']!=name],policy)
    def test_changed_api_binding_type_visibility_still_rejects(self):
        for field,value in [('bind','WEAK'),('type','OBJECT'),('visibility','HIDDEN')]:
            changed=copy.deepcopy(new)
            next(s for s in changed if s['name']==policy['directApiSymbols'][0])[field]=value
            with self.subTest(field=field),self.assertRaises(AssertionError):compare_rows(old,changed,policy)
    def test_added_direct_api_still_rejects(self):
        extra=dict(name='_ZN6libwps99UnknownApiEv',type='FUNC',bind='GLOBAL',visibility='DEFAULT')
        with self.assertRaises(AssertionError):compare_rows(old,new+[extra],policy)
    def test_new_rtti_still_rejects(self):
        extra=dict(name='_ZTVN6libwps11WPSDocumentE',type='OBJECT',bind='WEAK',visibility='DEFAULT')
        with self.assertRaises(AssertionError):compare_rows(old,new+[extra],policy)
    def test_known_template_must_remain_weak_function(self):
        for field,value in [('bind','GLOBAL'),('type','OBJECT'),('visibility','HIDDEN')]:
            changed=copy.deepcopy(new)
            next(s for s in changed if s['name']==policy['permittedWeakStdTemplateSymbols'][0])[field]=value
            with self.subTest(field=field),self.assertRaises(AssertionError):compare_rows(old,changed,policy)
    def test_unlisted_libwps_template_not_silently_ignored(self):
        extra=dict(name=policy['permittedWeakStdTemplateSymbols'][0]+'Unknown',type='FUNC',bind='WEAK',visibility='DEFAULT')
        with self.assertRaises(AssertionError):compare_rows(old,new+[extra],policy)
    def test_duplicate_api_not_hidden(self):
        duplicate=next(s for s in new if s['name']==policy['directApiSymbols'][0])
        with self.assertRaises(AssertionError):compare_rows(old,new+[duplicate],policy)
    def test_gnu_readelf_adapter_matches_independent_elf_parser(self):
        listing='\n'.join(f" {i}: 0000000000000000 10 {s['type']} {s['bind']} {s['visibility']} 12 {s['name']}" for i,s in enumerate(new))
        parsed=readelf_rows(listing)
        self.assertEqual(classify(parsed,policy),classify(new,policy))
    def test_undefined_api_does_not_satisfy_contract(self):
        listing='\n'.join(f" {i}: 0 0 FUNC GLOBAL DEFAULT UND {name}" for i,name in enumerate(policy['directApiSymbols']))
        with self.assertRaises(AssertionError):classify(readelf_rows(listing),policy)

if __name__=='__main__':unittest.main()
