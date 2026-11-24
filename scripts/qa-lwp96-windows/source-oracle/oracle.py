"""LWP96 source qualification and independent bounded DOCX XML checks."""
import argparse,hashlib,json,os,urllib.request,zipfile
from pathlib import Path
from xml.etree import ElementTree as E
from native import native
CONFIG=json.loads((Path(__file__).parent/'fixture.json').read_text())
OUT=Path(os.environ.get('OOS_LWP96_OUTPUT','.local/lwp96-qa'))
def write_json(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def source_bytes(p):
 b=Path(p).read_bytes();assert len(b)==CONFIG['source']['bytes'] and hashlib.sha256(b).hexdigest()==CONFIG['source']['sha256'];return b
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def visible(p):
 return ''.join((x.text or '') if x.tag==W+'t' else '\t' if x.tag==W+'tab' else '\n' if x.tag in (W+'br',W+'cr') and x.get(W+'type')!='page' else '' for run in p.iter(W+'r') for x in run if x.tag in (W+'t',W+'tab',W+'br',W+'cr'))
def docx(p,out,edited,observe):
 oracle=native(source_bytes(out/'source.lwp'),CONFIG['edit']);expected=oracle['expected']['editedTexts' if edited else 'texts'];checks=[];mismatches=[]
 def check(name,actual,wanted):
  item={'case':name,'actual':actual,'expected':wanted,'passed':actual==wanted};checks.append(item)
  if actual!=wanted:mismatches.append(item)
 with zipfile.ZipFile(p) as z:
  root=E.fromstring(z.read('word/document.xml'));paras=root.find(W+'body').findall(W+'p');alltexts=[visible(x) for x in paras];texts=alltexts[:16]
  check('bounded prefix has sixteen paragraphs',len(texts),16)
  for i,wanted in enumerate(expected):check(f'native paragraph {i} exact text',texts[i] if i<len(texts) else None,wanted)
  styles=E.fromstring(z.read('word/styles.xml'));stylemap={s.get(W+'styleId'):s for s in styles.findall(W+'style')}
  pnode=paras[11] if len(paras)>11 else E.Element(W+'p');pp=pnode.find(W+'pPr');jc=pp.find(W+'jc') if pp is not None else None;path=[]
  st=pp.find(W+'pStyle') if pp is not None else None;sid=st.get(W+'val') if st is not None else None
  while jc is None and sid:
   assert sid not in path,'DOCX style cycle';path.append(sid);style=stylemap.get(sid)
   if style is None:break
   jc=style.find('./'+W+'pPr/'+W+'jc');base=style.find(W+'basedOn');sid=base.get(W+'val') if base is not None else None
  if jc is None:jc=styles.find('./'+W+'docDefaults/'+W+'pPrDefault/'+W+'pPr/'+W+'jc')
  check('native local alignment at paragraph11',jc.get(W+'val') if jc is not None else None,oracle['centerAnchor']['expectedDocxAlignment'])
 report={'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'paragraphTexts':texts,'allDirectBodyParagraphTexts':alltexts,'checkedCases':checks,'centerStyleChain':path,'mismatches':mismatches,'boundedSourceAcceptance':not mismatches,'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit']}
 write_json(out/(p.stem+'-xml-report.json'),report);print(json.dumps({'file':p.name,'boundedSourceAcceptance':not mismatches,'mismatches':mismatches}))
 if not observe:assert not mismatches,mismatches
 return report

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['source','docx']);p.add_argument('--out',type=Path,default=OUT);p.add_argument('--docx',type=Path);p.add_argument('--edited',action='store_true');p.add_argument('--observe',action='store_true');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 if a.mode=='docx':docx(a.docx,a.out,a.edited,a.observe);return
 f=a.out/'source.lwp'
 if not f.exists():f.write_bytes(urllib.request.urlopen(CONFIG['source']['url']).read())
 b=source_bytes(f);assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==CONFIG['source']['blob']
 for n in CONFIG['source']['notices']:
  dest=a.out/'source-notices'/n['path'];dest.parent.mkdir(exist_ok=True)
  if not dest.exists():dest.write_bytes(urllib.request.urlopen(n['url']).read())
  assert hashlib.sha256(dest.read_bytes()).hexdigest()==n['sha256']
 oracle=native(b,CONFIG['edit']);write_json(a.out/'source-oracle.json',oracle)
 print(json.dumps({'sourceSha256':CONFIG['source']['sha256'],'objects':oracle['objectCount'],'indexEntries':oracle['index']['verifiedEntries'],'paragraphs':len(oracle['paragraphs']),'mainStoryParagraphs':len(oracle['mainStoryChain']),'acceptedPrefix':len(oracle['acceptedPrefix']),'centerAnchor':oracle['centerAnchor']}))
if __name__=='__main__':main()
