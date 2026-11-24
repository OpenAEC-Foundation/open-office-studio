"""Portable metadata policy/cross-cache negatives. No Fontconfig/ELF execution."""
import copy
import hashlib
from pathlib import Path
import tempfile
import unittest

from font_cache import (CacheGuard, UUID_PATHS, VARIANTS, load_policy, metadata_expected,
                        validate_cache_log, validate_policy, qualification_environment)
from runtime_prefix import Audit


class MetadataTest(unittest.TestCase):
    def setUp(self):
        self.policy=load_policy()
        self.temp=tempfile.TemporaryDirectory(prefix='issue381-cache-')
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)

    def guard(self,variant):
        return CacheGuard(self.root/'caches',variant,Audit(self.root/('audit-'+variant)))

    def log(self,guard,variant='packaged'):
        lines=['FcDirCacheReadUUID '+str(self.root/path)+' -> '+entry['uuid']
               for path,entry in self.policy['variants'][variant].items()]
        for entry in self.policy['variants'][variant].values():
            name=entry['uuid']+'-le64.cache-7'
            lines.append('FcDirCacheWriteDir dir "sample" file "'+str(guard.xdg/'fontconfig'/name)+'"')
        return '\n'.join(lines)

    def test_six_distinct_pinned_uuids_with_exact_modes_and_hashes(self):
        entries=[e for v in self.policy['variants'].values() for e in v.values()]
        self.assertEqual(len({e['uuid'] for e in entries}),6)
        self.assertTrue(all(e['bytes']==36 and e['mode']=='0644' for e in entries))

    def test_host_probe_loader_evidence_cannot_pollute_converter_logs(self):
        env={'LD_DEBUG':'libs','LD_DEBUG_OUTPUT':str(self.root/'converter-loader'),'XDG_CACHE_HOME':'own-cache'}
        probe=qualification_environment(env,self.root/'qualification')
        self.assertNotEqual(probe['LD_DEBUG_OUTPUT'],env['LD_DEBUG_OUTPUT'])
        self.assertEqual(probe['LD_DEBUG_OUTPUT'],str(self.root/'qualification/host-loader'))
        self.assertEqual(env['LD_DEBUG_OUTPUT'],str(self.root/'converter-loader'))
        self.assertEqual(probe['XDG_CACHE_HOME'],env['XDG_CACHE_HOME'])

    def test_wrong_uuid_rejected_even_with_recomputed_hash(self):
        policy=copy.deepcopy(self.policy)
        e=policy['variants']['packaged'][UUID_PATHS[0]]
        e['uuid']='x'*36;e['sha256']=hashlib.sha256(e['uuid'].encode()).hexdigest()
        with self.assertRaises((ValueError,AssertionError)):validate_policy(policy)

    def test_changed_uuid_bytes_without_pinned_hash_rejected(self):
        policy=copy.deepcopy(self.policy)
        policy['variants']['packaged'][UUID_PATHS[0]]['uuid']='12345678-1234-5678-9234-123456789abc'
        with self.assertRaises(AssertionError):validate_policy(policy)

    def test_colliding_variant_uuid_rejected(self):
        policy=copy.deepcopy(self.policy)
        policy['variants']['patched'][UUID_PATHS[0]]=copy.deepcopy(policy['variants']['packaged'][UUID_PATHS[0]])
        with self.assertRaisesRegex(AssertionError,'collision'):validate_policy(policy)

    def test_wrong_metadata_mode_rejected(self):
        policy=copy.deepcopy(self.policy)
        policy['variants']['patched'][UUID_PATHS[0]]['mode']='0666'
        with self.assertRaises(AssertionError):validate_policy(policy)

    def test_extra_metadata_path_rejected(self):
        policy=copy.deepcopy(self.policy)
        policy['variants']['patched']['unexpected']=copy.deepcopy(policy['variants']['patched'][UUID_PATHS[0]])
        with self.assertRaises(AssertionError):validate_policy(policy)

    def test_metadata_plan_preserves_all_existing_entries(self):
        original={Path(p).parent.as_posix():dict(type='directory',mode=0o755) for p in UUID_PATHS}
        original['unrelated-file']=dict(type='file',mode=0o644,bytes=8,sha256='unchanged')
        before=copy.deepcopy(original)
        for variant in VARIANTS:
            planned=metadata_expected(original,variant,self.policy)
            self.assertEqual(original,before)
            self.assertEqual({p:planned[p] for p in original},original)
            self.assertEqual(set(planned)-set(original),set(UUID_PATHS))
        original[UUID_PATHS[0]]=dict(type='file',mode=0o644,bytes=36,sha256='existing')
        with self.assertRaisesRegex(AssertionError,'overwrite'):metadata_expected(original,'packaged',self.policy)

    def test_cache_is_fresh_and_separate_for_every_variant(self):
        guards=[]
        for v in VARIANTS:
            guard=self.guard(v);guard.finish();guards.append(guard)
        self.assertEqual(len({g.environment()['XDG_CACHE_HOME'] for g in guards}),3)
        with self.assertRaisesRegex(AssertionError,'reused'):
            CacheGuard(self.root/'caches','packaged',Audit(self.root/'second-audit'))

    def test_cross_variant_cache_mutation_rejected(self):
        one=self.guard('packaged')
        (one.xdg/'fontconfig/cache').write_bytes(b'first variant')
        two=self.guard('rebuilt-control')
        (one.xdg/'fontconfig/cache').write_bytes(b'foreign mutation')
        with self.assertRaisesRegex(AssertionError,'Unexpected runtime mutation'):two.finish()

    def test_metadata_reads_and_own_cache_writes_required(self):
        guard=self.guard('packaged')
        result=validate_cache_log(self.log(guard),self.root,'packaged',self.policy,guard)
        self.assertEqual(len(result['metadataReads']),2)
        with self.assertRaisesRegex(AssertionError,'reader'):
            validate_cache_log('',self.root,'packaged',self.policy,guard)

    def test_global_or_foreign_cache_write_rejected(self):
        guard=self.guard('packaged')
        log=self.log(guard).replace(str(guard.xdg),str(self.root/'foreign'))
        with self.assertRaisesRegex(AssertionError,'cache write'):
            validate_cache_log(log,self.root,'packaged',self.policy,guard)

    def test_foreign_uuid_in_own_cache_rejected(self):
        guard=self.guard('packaged')
        own=next(iter(self.policy['variants']['packaged'].values()))['uuid']
        foreign=next(iter(self.policy['variants']['patched'].values()))['uuid']
        # Keep the expected reader evidence; change only the written cache filename.
        lines=self.log(guard).splitlines();lines[-2]=lines[-2].replace(own,foreign)
        with self.assertRaisesRegex(AssertionError,'Cross-variant'):
            validate_cache_log('\n'.join(lines),self.root,'packaged',self.policy,guard)


if __name__=='__main__':unittest.main()
