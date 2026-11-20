from pathlib import Path
import hashlib, json, subprocess, sys, zipfile, xml.etree.ElementTree as ET
OWN=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
ROOT=Path('C:/Users/alper/Desktop/Documents/ChatGPT/code slaafjes/work/oos-integratie-2026-11-16-9635')
BASE=ROOT/'.local/nov20-ci/44716499924'
APP='7f126f4b8e5269a54388cf78c48c78d2acc0daa1'; TREE='8bc608488760e48919d7fb4e72a42569175b52a4'; QA='61d277d64798d9e765ba04a2205ca576944d70aa'
def sha(data): return hashlib.sha256(data).hexdigest()
def info(p): return dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p.read_bytes()))
def blob(ref,path): return subprocess.check_output(['git','-C',str(ROOT),'show',ref+':'+path])
FIXTURE=ROOT/'docs/tests/epub356/leesvolgorde.epub'
assert FIXTURE.read_bytes()==blob(APP,'docs/tests/epub356/leesvolgorde.epub')
run=json.loads((OUT/'run-api.json').read_bytes())
assert run['headSha']==QA and run['status']=='completed' and run['conclusion']=='success'
assert len(run['jobs'])==3 and all(j['conclusion']=='success' for j in run['jobs'])
viewed={}
for platform in ['Linux','macOS']:
    for kind,name in [('normal','imported.png'),('normal','reopened.png'),('normal','reopened-invalid-preserved.png'),('hosted','reopened.png'),('hosted','reopened-invalid-preserved.png')]:
        p=BASE/('writer-I3-browser-QA-'+platform)/'app/.local'/('writer-I3-QA-'+kind+'-356')/name
        viewed[sha(p.read_bytes())]=str(p)
p=BASE/'writer-I3-browser-QA-Windows/app/.local/writer-I3-QA-normal-356/reopened-invalid-preserved.png'
viewed[sha(p.read_bytes())]=str(p)
parent_views={}
for name,expected in [('imported.png','a96891acf437bf8d1efbc1085d01907b6d84e6f0984b1064e056682ee21dfebb'),('reopened.png','5b8dc90cc7902ed4a2d4bd0ab100677696428b91dbba93596d6fad3dcd69d822')]:
    p=ROOT/'.local/nov20-I3-356-normal'/name
    assert sha(p.read_bytes())==expected, ('local review bytes',p)
    parent_views[expected]=str(p)
archives={'Linux':(14620835246,'f5ea0a77ee18ae920d0b0bde3770a8cfb11932fdce8fe5648775cb89f6c4805e'),'macOS':(14619952771,'656a8d960e36342d9760e767582ff45685090ee221442b58f835246e9939f490'),'Windows':(14619853892,'2434aa14edf85c4bd21866e8e405d9e9a3b30e2ac6e50208936ea0a0d189a43c')}
results=[]; artifact_records=[]
for platform,(artifact_id,digest) in archives.items():
    folder=BASE/('writer-I3-browser-QA-'+platform); archive=folder/'artifact.zip'
    assert sha(archive.read_bytes())==digest, ('archive',platform)
    artifact_records.append(dict(platform=platform,artifactId=artifact_id,**info(archive)))
    with zipfile.ZipFile(archive) as artifact:
        def bound(p):
            rel=p.relative_to(folder).as_posix()
            assert artifact.read(rel)==p.read_bytes(), ('ZIP/extracted mismatch',p)
            return info(p)
        request=folder/'harness/.github/office-writer-I3-qa.json'; request_data=json.loads(request.read_bytes())
        assert request_data['applicationCommit']==APP and request_data['applicationTree']==TREE
        request_record=bound(request)
        for kind,route in [('normal','/'),('hosted','/office/')]:
            print('Audit',platform,kind,flush=True)
            local=folder/'app/.local'; proof=local/('writer-I3-QA-'+kind+'-356')
            report_path=proof/'report.json'; d=json.loads(report_path.read_bytes())
            receipt_path=local/('dist-I3-QA-'+kind+'.build.json'); receipt=json.loads(receipt_path.read_bytes())
            summary_path=local/('writer-I3-QA-'+kind)/'summary.json'; summary=json.loads(summary_path.read_bytes())
            issue=next(r for r in summary['issues'] if r['issue']==356)
            assert d['applicationCommit']==APP and d['applicationTree']==TREE and d['route']==route and d['status']=='passed'
            assert d['errors']==[] and d['externalRequests']==[] and d['nativeBridge'] is False and d['cleanupPassed'] is True
            for key in ['importedEpub','offlineEditAndSave','readingOrder','tableContent','reopenedDocx','invalidInputPreservesTabs','originalUnchanged']: assert d[key] is True, key
            assert receipt['source']==APP and receipt['tree']==TREE and receipt['route']==route
            assert receipt['base']==('/' if route=='/' else './'), 'Exact I3 writer-proefbuild.mjs asset-base contract'
            assert summary['harnessCommit']==QA and summary['source']==APP and summary['tree']==TREE and summary['passed'] is True and issue['passed'] is True
            assert issue['reportSha256']==sha(report_path.read_bytes())
            assert issue['exitCode']==0 and issue['signal'] is None
            assert summary['buildReceiptSha256']==sha(receipt_path.read_bytes())
            saved=proof/'saved.docx'; oracle_path=OUT/(platform+'-'+kind+'-oracle.json')
            if not oracle_path.exists():
                result=subprocess.run([sys.executable,str(OWN/'scripts/epub356-final-oracle.py'),'--source',str(FIXTURE),'--saved',str(saved),'--report',str(oracle_path)],capture_output=True)
                assert result.returncode==0, result.stderr.decode(errors='replace')
            oracle=json.loads(oracle_path.read_bytes()); assert oracle['status']=='passed' and oracle['savedSha256']==sha(saved.read_bytes())
            with zipfile.ZipFile(saved) as docx:
                xml=ET.fromstring(docx.read('word/document.xml')); ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                paragraphs=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in xml.findall('.//w:p',ns)]
                markers=[t for t in paragraphs if 'EPUB356 EDIT' in t]
                assert markers, ('complete marker',platform,kind)
            images=[]
            for name in ['imported.png','reopened.png','reopened-invalid-preserved.png']:
                image=proof/name; record=bound(image); hash_=record['sha256']
                if hash_ in viewed:
                    record.update(review='original viewed serially in this audit' if viewed[hash_]==str(image) else 'exact-byte prior image from this audit reused',reviewOriginal=viewed[hash_])
                else:
                    assert hash_ in parent_views, ('unreviewed image',image,hash_)
                    record.update(review='parent serial I3 local review reused by exact-byte identity',reviewOriginal=parent_views[hash_])
                images.append(record)
            results.append(dict(platform=platform,route=route,status='passed-browser-data-and-readable-content-with-recorded-limits',report=bound(report_path),receipt=bound(receipt_path),receiptSource=receipt['source'],receiptTree=receipt['tree'],receiptRoute=receipt['route'],receiptAssetBase=receipt['base'],receiptFileCount=len(receipt['files']),summary=bound(summary_path),summaryHarnessCommit=summary['harnessCommit'],own356Summary=issue,saved=bound(saved),independentOracle=info(oracle_path),oracleResult=oracle,fullEditMarkerInSavedXml=True,markerParagraphs=markers,images=images,cleanupReportedPassed=True,artifactRequest=request_record))
report=dict(issue=356,auditScope='Read-only existing Chromium browser CI evidence; no app/preview/native/new CI execution',applicationCommit=APP,applicationTree=TREE,qaRun=44716499924,qaHarnessCommit=QA,applicationConsumerGitBlobSha256=sha((OUT/'application-consumer.mjs').read_bytes()),workflowSha256=sha((OUT/'qa-workflow.yml').read_bytes()),aggregatorSha256=sha((OUT/'qa-aggregator.mjs').read_bytes()),binding='QA workflow checks out I3 as app; QA aggregator launches app scripts/proef-epub356-hosted.mjs from app CWD. Receipts/probe reports bind I3 source/tree/exact route. Distinct QA head is verified by run API and each aggregate summary.',artifacts=artifact_records,originalSubsetMatchedZipBytes=True,routes=results,imageReview=dict(originalsViewedSeriallyThisAudit=11,reviewReusedOnlyByExactSha256=True,parentSource='Actual original I3 local import/reopen bytes match parent supplied serial-review hashes.',observations='Both chapter headings, accented body/bold/italic, list, image and Hout/42 table are readable. All newly reviewed reopened originals show the complete edit marker. Invalid-input originals retain document/tabs and show a fading error toast.',limitations=['Early reopened captures may show Stijlen laden..., disabled ribbon/font UI, missing ruler or vertical layout settling. No wait or image edit added.','Font replacement and EPUB-copy warnings visible; error toast may be fading/low contrast.','Complete EPUB356 EDIT independently confirmed from every actual saved DOCX XML.','No #359, native-platform, PDF/reflow-fidelity or full interaction-readiness acceptance inferred.']),cleanup='Only bounded file/oracle/GitHub-read subprocesses started; all returned. CI cleanupPassed reports inspected. No browser/capture/preview/native session started by audit.',sourceOrCiMutation=False,nativeGo=False)
(OUT/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
(OUT/'sha256.json').write_text(json.dumps([info(p) for p in sorted(OUT.iterdir()) if p.is_file() and p.name!='sha256.json'],indent=2)+'\n')
print(json.dumps(dict(audit=info(OUT/'audit.json'),manifest=info(OUT/'sha256.json'),routes=len(results),savedHashes=[(r['platform'],r['route'],r['saved']['sha256']) for r in results])))
