"""Minimal FB2 body-route oracle; source schema failure remains separate."""
import argparse,hashlib,json,os,urllib.request,zipfile
from pathlib import Path
from xml.etree import ElementTree as E
from native import native
CONFIG=json.loads(Path('scripts/qa-fb2/fixture.json').read_text(encoding='utf-8'))
OUT=Path(os.environ.get('OOS_FB2_OUTPUT','.local/fb2-qa'))
def write_json(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def source_bytes(p):
 b=Path(p).read_bytes();assert len(b)==CONFIG['source']['bytes'] and hashlib.sha256(b).hexdigest()==CONFIG['source']['sha256'];return b
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CT='{http://schemas.openxmlformats.org/package/2006/content-types}'
def visible(p):
 return ''.join((x.text or '') if x.tag==W+'t' else '\t' if x.tag==W+'tab' else '\n' if x.tag in (W+'br',W+'cr') and x.get(W+'type')!='page' else '' for run in p.iter(W+'r') for x in run if x.tag in (W+'t',W+'tab',W+'br',W+'cr'))
def docx(p,out,edited,observe):
 oracle=native(source_bytes(out/'source.fb2'),CONFIG['edit']);expected=oracle['expected'];texts_expected=expected['editedTexts' if edited else 'texts'];checks=[];mismatches=[]
 def check(name,actual,wanted):
  item={'case':name,'actual':actual,'expected':wanted,'passed':actual==wanted};checks.append(item)
  if actual!=wanted:mismatches.append(item)
 with zipfile.ZipFile(p) as z:
  root=E.fromstring(z.read('word/document.xml'));body=root.find(W+'body');paras=body.findall(W+'p');texts=[visible(x) for x in paras]
  types=E.fromstring(z.read('[Content_Types].xml'));content=next((x.get('ContentType') for x in types.findall(CT+'Override') if x.get('PartName')=='/word/document.xml'),None)
  objects={name:len(list(body.iter(W+name))) for name in ['tbl','drawing','pict','object','altChunk']}
  check('recommended ordinary DOCX main type',content,expected['documentMainContentType'])
  check('source plain body paragraph count',len(paras),expected['paragraphCount'])
  check('exact body text including case and punctuation, metadata not flattened into body',texts,texts_expected)
  check('no invented body tables images or opaque objects',sum(objects.values()),expected['unexpectedBodyObjects'])
 report={'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'paragraphTexts':texts,'objectInventory':objects,'mainContentType':content,'checkedCases':checks,'mismatches':mismatches,'boundedSourceAcceptance':not mismatches,'bodyRouteOnly':True,'sourceSchemaConformance':False,'sourceSchemaGap':oracle['schemaAssessment']['missingRequiredFields'],'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit']}
 write_json(out/(p.stem+'-xml-report.json'),report);print(json.dumps({'file':p.name,'boundedBodySourceAcceptance':not mismatches,'sourceSchemaConformance':False,'mismatches':mismatches}))
 if not observe:assert not mismatches,mismatches
 return report

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['source','docx']);p.add_argument('--out',type=Path,default=OUT);p.add_argument('--docx',type=Path);p.add_argument('--edited',action='store_true');p.add_argument('--observe',action='store_true');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 if a.mode=='docx':docx(a.docx,a.out,a.edited,a.observe);return
 f=a.out/'source.fb2'
 if not f.exists():f.write_bytes(urllib.request.urlopen(CONFIG['source']['url']).read())
 b=source_bytes(f);assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==CONFIG['source']['blob']
 for n in CONFIG['source']['notices']:
  dest=a.out/'source-notices'/n['path'];dest.parent.mkdir(exist_ok=True)
  if not dest.exists():dest.write_bytes(urllib.request.urlopen(n['url']).read())
  assert hashlib.sha256(dest.read_bytes()).hexdigest()==n['sha256']
 assert hashlib.sha256(Path('scripts/qa-fb2/reference/LICENSE.md').read_bytes()).hexdigest()==CONFIG['schemaReference']['licenseSha256']
 oracle=native(b,CONFIG['edit']);write_json(a.out/'source-oracle.json',oracle)
 print(json.dumps({'sourceSha256':CONFIG['source']['sha256'],'expected':oracle['expected'],'schemaAssessment':oracle['schemaAssessment']}))
if __name__=='__main__':main()
