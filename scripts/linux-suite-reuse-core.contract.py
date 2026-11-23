import copy
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('reuse',Path(__file__).with_name('linux-suite-reuse-core.py'))
reuse=importlib.util.module_from_spec(spec);spec.loader.exec_module(reuse)
class Contracts(unittest.TestCase):
    def test_only_same_source_package_probe_and_closed_core_is_reused(self):
        request=dict(candidate=dict(commit='a',tree='b'),reusedCore=dict(harnessCommit='c'))
        identity=dict(packageSha256='d',executableSha256='e')
        report=dict(source=dict(commit='a',tree='b'),origin=identity,harnessCommit='c',harnessSha256='f',issue368='passed bounded',issue369='passed tested',cleanup=dict(ownedApplicationClosed=True,driverExited=True,remainingApplicationPids=[]),checks=[True]*64)
        reuse.validate_core(report,request,identity,'f')
        for mutate in [lambda r:r['source'].update(commit='other'),lambda r:r['origin'].update(packageSha256='other'),lambda r:r.update(harnessSha256='other'),lambda r:r['cleanup'].update(ownedApplicationClosed=False)]:
            changed=copy.deepcopy(report);mutate(changed)
            with self.assertRaises(AssertionError):reuse.validate_core(changed,request,identity,'f')
if __name__=='__main__':unittest.main()
