import gzip,hashlib,json,pathlib,shutil,subprocess,sys
sys.path.insert(0,str(pathlib.Path('qa/issue381').resolve()))
from runtime_prefix import manifest_inventory
from font_cache import load_policy,UUID_PATHS
root=pathlib.Path('.local/issue381/actual-45404556426');raw=root/'raw/.local/issue381'
out=pathlib.Path('.local/issue381/independent-45404556426');out.mkdir(parents=True,exist_ok=True)
manifest=pathlib.Path('C:/Users/alper/Desktop/Documents/ChatGPT/code slaafjes/work/oos-release-prep-2026-11-20-9635/docs/releases/2026-11-20/P2-runtime-input/entry-manifest.json')
assert hashlib.sha256(manifest.read_bytes()).hexdigest()=='79204b36527a7fed0f073b5290df26a86c6a610ba4f78ddf36883507b28da029'
canonical=manifest_inventory(json.loads(manifest.read_bytes()));policy=load_policy()
build=json.loads((raw/'build-proof/build.json').read_bytes());report=json.loads((raw/'real-proof/report.json').read_bytes())
assert build['passed'] and build['runtimeUntouched'] and report['passed'] and report['sourceUnchanged']
assert report['freshProcess']['pid']!=report['pid'] and report['freshProcess']['parentPid']==report['pid']
assert report['savedSha256']==report['reopenedSha256']
library='payload/usr/libexec/Open Office Studio/kantoorruntime/program/libwps-0.4-lo.so.4'
rows=[]
for stepspath in raw.glob('**/steps.json'):
    variant=next((name for name in ['packaged','rebuilt-control','patched'] if name in stepspath.parts),None)
    snapshots={}
    for step in json.loads(stepspath.read_bytes()):
        data=(stepspath.parent/step['inventory']).read_bytes()
        assert hashlib.sha256(data).hexdigest()==step['inventorySha256']
        snapshot=json.loads(gzip.decompress(data));assert len(snapshot)==step['entries']
        assert step['passed'] and not any(step['differences'].values())
        label=step['label'];snapshots[label]=snapshot
        expected=None
        if not variant or label.startswith('canonical-') or label=='variant-copied':expected=canonical
        elif label in ['variant-derived','before-font-metadata','font-metadata-0','font-metadata-1','before-converter','after-converter']:
            expected={p:dict(v) for p,v in canonical.items()}
            selected=build['variants'][variant]
            expected[library].update(sha256=selected['sha256'],bytes=(raw/'build-proof'/pathlib.Path(selected['file']).name).stat().st_size)
            if label in ['font-metadata-0','font-metadata-1','before-converter','after-converter']:
                for index,(path,entry) in enumerate(policy['variants'][variant].items()):
                    if label=='font-metadata-0' and index>0:continue
                    expected[path]=dict(type='file',mode=0o644,bytes=36,sha256=entry['sha256'])
        if expected is not None:assert snapshot==expected,(variant,label)
        rows.append(dict(variant=variant,label=label,entries=len(snapshot),sha256=step['inventorySha256'],fullPinnedPayloadCompared=expected is not None))
    if variant:
        assert snapshots['converter-cache-before-host-probe']==snapshots['converter-cache-after-host-probe']
        assert len(snapshots['converter-cache-before-host-probe'])==2
        before=snapshots['cache-created'];after=snapshots['cache-after-converter']
        assert before==snapshots['variant-caches-after-host-probe']
        project=lambda entries:{p:v for p,v in entries.items() if pathlib.PurePosixPath(p).parts[0]!=variant}
        assert project(before)==project(after)
        for entry in policy['variants'][variant].values():
            matches=[v for p,v in after.items() if pathlib.PurePosixPath(p).parts[0]==variant and pathlib.PurePosixPath(p).name.startswith(entry['uuid']+'-')]
            assert len(matches)==1 and matches[0]['type']=='file' and matches[0]['bytes']>0
for phase in report['phases']:
    converter=phase['converter'];assert converter['passed'] and converter['prefixInventoryPassed']
    assert not converter['ownedProfileProcessesAfter'] and converter['sourceUnchanged']
    assert {x['pid'] for x in converter['actualLibwpsLoads']} & {x['pid'] for x in converter['actualFontconfigLoads']}
    assert converter['fontconfigHost']['readerDebugObserved'] and converter['fontconfigHost']['version']==21301
    assert len(converter['fontCache']['metadataReads'])==2 and len(converter['fontCache']['cacheWrites'])==2
cases=[]
for variant,name,edited,expected in [('packaged','converted',False,False),('rebuilt-control','converted',False,False),('patched','converted',False,True),('patched','saved',True,True),('patched','reopened',True,True)]:
    source=raw/'real-proof'/variant;dest=out/(variant+'-'+name);dest.mkdir(exist_ok=False)
    shutil.copyfile(source/'source-oracle.json',dest/'source-oracle.json')
    command=[sys.executable,'qa/issue381/original-oracle/oracle.py','xlsx','--xlsx',str(source/(name+'.xlsx')),'--out',str(dest)]
    if edited:command.append('--edited')
    child=subprocess.run(command,capture_output=True,text=True)
    (dest/'stdout.txt').write_bytes(child.stdout.encode());(dest/'stderr.txt').write_bytes(child.stderr.encode())
    result=json.loads((dest/(name+'-independent.json')).read_bytes())
    assert child.returncode==(0 if expected else 1) and result['sourceImportAcceptance']==expected
    assert result['checkedPopulatedCells']==61 and result['checkedOriginalFormulas']==4
    assert list(result['importedModernColumnIndices'].values())==([2,3,4,5] if expected else [1,2,3,4])
    cases.append(dict(variant=variant,file=name,edited=edited,expectedAcceptance=expected,actualAcceptance=result['sourceImportAcceptance'],cells=61,formulas=4,returncode=child.returncode,sha256=hashlib.sha256((source/(name+'.xlsx')).read_bytes()).hexdigest()))
result=dict(passed=True,inventorySnapshotsChecked=len(rows),inventories=rows,offlineOriginalOracleChecks=cases,
    enginePid=report['pid'],freshEnginePid=report['freshProcess']['pid'],sameSavedAndReopenedBytes=True,
    nativeGui=False,browserGui=False,realTauriIpc=False,productionRuntimeChanged=False)
(out/'audit.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
print(json.dumps(dict(passed=True,snapshots=len(rows),offlineCases=cases,pids=[report['pid'],report['freshProcess']['pid']])))
