"""Native leading paragraphs and C3 attribute check, independently in OOXML."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.request
import zipfile
from xml.etree import ElementTree as E
from native import native

CONFIG=json.loads(Path('scripts/qa-wpd213/fixture.json').read_text(encoding='utf8'))
OUT=Path(os.environ.get('OOS_WPD213_OUTPUT','.local/wpd213-qa'))
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CT='{http://schemas.openxmlformats.org/package/2006/content-types}'

def write_json(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

def source_bytes(p):
 b=Path(p).read_bytes();assert len(b)==CONFIG['source']['bytes'] and hashlib.sha256(b).hexdigest()==CONFIG['source']['sha256'];return b

def visible(p):
 return ''.join((x.text or '') if x.tag==W+'t' else '\t' if x.tag==W+'tab' else '\n' if x.tag in (W+'br',W+'cr') and x.get(W+'type')!='page' else '' for run in p.iter(W+'r') for x in run if x.tag in (W+'t',W+'tab',W+'br',W+'cr'))

def docx(p,out,edited,observe):
 oracle=native(source_bytes(out/'source.wpd'),CONFIG['edit']);expected=oracle['expected'];wanted=expected['editedTexts' if edited else 'texts'];checks=[];mismatches=[]
 def check(name,actual,expected):
  item={'case':name,'actual':actual,'expected':expected,'passed':actual==expected};checks.append(item)
  if actual!=expected:mismatches.append(item)
 with zipfile.ZipFile(p) as z:
  body=E.fromstring(z.read('word/document.xml')).find(W+'body');paras=body.findall(W+'p');texts=[visible(x) for x in paras]
  styles=E.fromstring(z.read('word/styles.xml'));by_id={s.get(W+'styleId'):s for s in styles.findall(W+'style')}
  default=next((s.get(W+'styleId') for s in by_id.values() if s.get(W+'type')=='paragraph' and s.get(W+'default')=='1'),None)
  def chain(name):
   seq=[];seen=set()
   while name in by_id:
    assert name not in seen;seen.add(name);s=by_id[name];seq.insert(0,s.find(W+'rPr'));parent=s.find(W+'basedOn');name=parent.get(W+'val') if parent is not None else None
   return seq
  def val(node):return node.get(W+'val','true') not in ('false','0','off')
  def attr(par,run,tag):
   defaults=styles.find(W+'docDefaults/'+W+'rPrDefault/'+W+'rPr/'+W+tag);v=val(defaults) if defaults is not None else False
   ps=par.find(W+'pPr/'+W+'pStyle');cs=run.find(W+'rPr/'+W+'rStyle')
   for rp in chain(ps.get(W+'val') if ps is not None else default)+chain(cs.get(W+'val') if cs is not None else None):
    e=rp.find(W+tag) if rp is not None else None
    if e is not None and val(e):v=not v  # OOXML style toggle semantics.
   direct=run.find(W+'rPr/'+W+tag)
   return val(direct) if direct is not None else v
  attributes=[]
  for par in paras:
   vector=[]
   for run in par.iter(W+'r'):
    vector.extend([{'bold':attr(par,run,'b'),'italic':attr(par,run,'i')}]*len(visible_run(run)))
   attributes.append(vector)
  types=E.fromstring(z.read('[Content_Types].xml'));content=next((x.get('ContentType') for x in types.findall(CT+'Override') if x.get('PartName')=='/word/document.xml'),None)
  check('recommended ordinary DOCX main type',content,expected['documentMainContentType'])
  for i,t in enumerate(wanted):check('native leading paragraph '+str(i),texts[i] if i<len(texts) else None,t)
  check('explicit C3 bold span Bold',len(attributes)>1 and len(attributes[1])==4 and all(x['bold'] for x in attributes[1]),True)
  check('explicit C3 italic span Italic',len(attributes)>2 and len(attributes[2])==6 and all(x['italic'] for x in attributes[2]),True)
 report={'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'paragraphTexts':texts,'attributes':attributes,'mainContentType':content,'checkedCases':checks,'mismatches':mismatches,'boundedSourceAcceptance':not mismatches,'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit']}
 write_json(out/(p.stem+'-xml-report.json'),report);print(json.dumps({'file':p.name,'boundedSourceAcceptance':not mismatches,'mismatches':mismatches}))
 if not observe:assert not mismatches,mismatches
 return report

def visible_run(run):
 return ''.join((x.text or '') if x.tag==W+'t' else '\t' if x.tag==W+'tab' else '\n' if x.tag in (W+'br',W+'cr') and x.get(W+'type')!='page' else '' for x in run)

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['source','docx']);p.add_argument('--out',type=Path,default=OUT);p.add_argument('--docx',type=Path);p.add_argument('--edited',action='store_true');p.add_argument('--observe',action='store_true');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 if a.mode=='docx':docx(a.docx,a.out,a.edited,a.observe);return
 f=a.out/'source.wpd'
 if not f.exists():f.write_bytes(urllib.request.urlopen(CONFIG['source']['url']).read())
 b=source_bytes(f);assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==CONFIG['source']['blob']
 for n in CONFIG['source']['notices']:
  dest=a.out/'source-notices'/n['path'];dest.parent.mkdir(exist_ok=True)
  if not dest.exists():dest.write_bytes(urllib.request.urlopen(n['url']).read())
  assert hashlib.sha256(dest.read_bytes()).hexdigest()==n['sha256']
 oracle=native(b,CONFIG['edit']);write_json(a.out/'source-oracle.json',oracle);print(json.dumps({'sourceSha256':CONFIG['source']['sha256'],'expected':oracle['expected']}))
if __name__=='__main__':main()
