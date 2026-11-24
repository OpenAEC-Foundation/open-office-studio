"""Check/apply the test-only #375 startup proposal; never build or run Office."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

DOCS = Path(__file__).resolve().parents[2] / 'docs/tests/presentation-375'
PATCH = DOCS / '375-neutral-startup-proposal.patch'
MANIFEST = DOCS / 'neutral-startup-proposal.json'
PATCH_SHA256 = '1e7134852548e4f37b1073755882ab1a42ed0f63931acca8c62624364b358a84'
DRAW = 'xmloff/qa/unit/draw.cxx'
RECIPE = 'xmloff/CppunitTest_xmloff_draw.mk'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(source):
    """Requires original #375 test diff and existing UI-recipe patch, not importer."""
    source = Path(source).resolve(strict=True)
    manifest = json.loads(MANIFEST.read_text())
    assert sha(PATCH) == manifest['patchSHA256'] == PATCH_SHA256
    assert set(manifest['files']) == {DRAW, RECIPE}
    for relative, item in manifest['files'].items():
        target = source / relative
        assert target.resolve(strict=True).is_relative_to(source)
        assert sha(target) == item['beforeSHA256'], 'Wrong pre-diagnostic test bytes: ' + relative
    primary = json.loads((DOCS / 'startup-settings-analysis.json').read_text())
    wanted = {'svtools/source/config/miscopt.cxx',
              'svtools/source/config/itemholder2.cxx', 'test/source/unoapi_test.cxx'}
    bindings = {s['path']: s['sha256'] for s in primary['sources'] if s['path'] in wanted}
    assert set(bindings) == wanted
    bindings['include/svtools/miscopt.hxx'] = 'f3eeb444c5a8f4d0a53a00599dc31d66fafd22b75938dcd9caf30493f896b9e3'
    bindings['solenv/gbuild/CppunitTest.mk'] = '6eb8de580d678b77f00cdc8e5081825aaf173158c70d4021e5523fa05ddb420f'
    bindings['xmloff/source/draw/XMLShapeStyleContext.cxx'] = 'c9d4eaeef82d65b406641af27b21e068df609d90b1b98067a62469121529d520'
    for relative, expected in bindings.items():
        assert sha(source / relative) == expected, 'Wrong primary source: ' + relative
    return {'upstreamCommit': manifest['upstreamCommit'], 'patchSHA256': PATCH_SHA256,
            'files': manifest['files'], 'primarySourceSHA256': bindings,
            'compiled': False, 'runtimeExecuted': False}


def plan():
    # A canonical gbuild invocation recreates its .user directory from unittest
    # before each process. A future allocated controller must preserve/rename
    # each completed profile under this unique label before the next invocation.
    # This function describes those requirements; it does not execute them.
    return [{'label': route + '-' + arm, 'arm': arm, 'route': route,
             'environment': {'OOS_375_STARTUP_ARM': arm},
             'argv': ['make', '-j3', 'CppunitTest_xmloff_draw', 'CPPUNIT_TEST_NAME=' + selector],
             'freshProfile': True, 'retainProfileAs': 'startup-profiles/' + route + '-' + arm}
            for route, selector in [('blank', 'testUOP375BlankImpressStartup'),
                                    ('uop', 'testUOFExplicitRectangleFillColors')]
            for arm in ('A', 'B')]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--apply', action='store_true', help='Apply only two verified QA-test files')
    args = parser.parse_args()
    args.source = args.source.resolve(strict=True)
    result = verify(args.source)
    git = lambda *argv: subprocess.check_output(['git', '-C', str(args.source), *argv], text=True).strip()
    assert Path(git('rev-parse', '--show-toplevel')).resolve() == args.source
    assert git('rev-parse', 'HEAD') == result['upstreamCommit'], 'Wrong upstream Git point'
    subprocess.run(['git', 'apply', '--check', '--whitespace=error', str(PATCH)], cwd=args.source, check=True)
    if args.apply:
        subprocess.run(['git', 'apply', '--whitespace=error', str(PATCH)], cwd=args.source, check=True)
        for relative, item in result['files'].items():
            assert sha(args.source / relative) == item['afterSHA256']
    result.update(applied=args.apply, proposedExecutionPlan=plan(),
                  controllerConnected=False, runtimeAllocation=False)
    print(json.dumps(result, indent=2))
