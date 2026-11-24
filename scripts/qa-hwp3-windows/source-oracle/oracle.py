"""HWP3 source qualification and independently decoded DOCX text oracle."""
import argparse,hashlib,json,os,unicodedata,urllib.request,zipfile
from pathlib import Path
from xml.etree import ElementTree as E
from native import native,modern_hangul
CONFIG=json.loads((Path(__file__).parent/'fixture.json').read_text(encoding='utf-8'))
OUT=Path(os.environ.get('OOS_HWP3_OUTPUT','.local/hwp3-qa'))
def write_json(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def source_bytes(p):
 b=Path(p).read_bytes();assert len(b)==CONFIG['source']['bytes'] and hashlib.sha256(b).hexdigest()==CONFIG['source']['sha256'];return b
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def visible(p):
 return ''.join((x.text or '') if x.tag==W+'t' else '\t' if x.tag==W+'tab' else '\n' if x.tag in (W+'br',W+'cr') and x.get(W+'type')!='page' else '' for run in p.iter(W+'r') for x in run if x.tag in (W+'t',W+'tab',W+'br',W+'cr'))
def docx(p,out,edited,observe):
 oracle=native(source_bytes(out/'source.hwp'),CONFIG['edit']);expected=oracle['expected']['editedTexts' if edited else 'texts'];checks=[];mismatches=[]
 def check(name,actual,wanted):
  item={'case':name,'actual':actual,'expected':wanted,'passed':actual==wanted};checks.append(item)
  if actual!=wanted:mismatches.append(item)
 with zipfile.ZipFile(p) as z:
  root=E.fromstring(z.read('word/document.xml'));paras=root.find(W+'body').findall(W+'p');texts=[visible(x) for x in paras]
  check('native CR-delimited paragraph count',len(texts),2)
  for i,wanted in enumerate(expected):check(f'native paragraph {i} exact Unicode text',texts[i] if i<len(texts) else None,wanted)
  check('exact Korean precomposed codepoint vector',[ord(c) for c in texts[1]] if len(texts)>1 else None,[ord(c) for c in expected[1]])
  check('output is already NFC without normalization',all(unicodedata.normalize('NFC',t)==t for t in texts),True)
  check('no replacement or unexpected square glyphs',not any(c in '\ufffd\u25a1' for t in texts for c in t),True)
 report={'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'paragraphTexts':texts,'unicodeCodePoints':[[f'U+{ord(c):04X}' for c in t] for t in texts],'checkedCases':checks,'mismatches':mismatches,'boundedSourceAcceptance':not mismatches,'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit']}
 write_json(out/(p.stem+'-xml-report.json'),report);print(json.dumps({'file':p.name,'boundedSourceAcceptance':not mismatches,'mismatches':mismatches},ensure_ascii=False))
 if not observe:assert not mismatches,mismatches
 return report

def verify_charset(out):
 pin=CONFIG['charsetReference'];f=Path('.local/hwp3-reference-data/tn60-2.txt');f.parent.mkdir(parents=True,exist_ok=True)
 if not f.exists():f.write_bytes(urllib.request.urlopen(pin['url'],timeout=30).read())
 b=f.read_bytes();assert len(b)==pin['bytes'] and hashlib.sha256(b).hexdigest()==pin['sha256']
 mapping={}
 for line in b.decode('utf-8-sig').splitlines():
  if not line.startswith('U+'):continue
  row=line.split('\t');code=int(row[2],16);wanted=chr(int(row[0][2:],16))
  assert modern_hangul(code)==wanted==row[1]==code.to_bytes(2,'big').decode('johab');mapping[f'{code:04x}']=row[0]
 assert len(mapping)==pin['rows']
 oracle=native(source_bytes(out/'source.hwp'),CONFIG['edit']);observed=oracle['observedModernSyllables'];assert all(mapping[k]==v for k,v in observed.items())
 write_json(out/'charset-report.json',{'reference':pin,'allModernRowsMatched':len(mapping),'actualUniqueSourceSyllables':len(observed),'observed':observed,'method':'Own composition formula and independent Python Johab codec checked against pinned Unicode UTN60 table for all modern syllables; actual fixture codes then matched separately','notAccepted':'No Hanja/archaic/incomplete Jamo or general HNC charset acceptance','fullFormatAcceptance':False})

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['source','docx']);p.add_argument('--out',type=Path,default=OUT);p.add_argument('--docx',type=Path);p.add_argument('--edited',action='store_true');p.add_argument('--observe',action='store_true');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 if a.mode=='docx':docx(a.docx,a.out,a.edited,a.observe);return
 f=a.out/'source.hwp'
 if not f.exists():f.write_bytes(urllib.request.urlopen(CONFIG['source']['url']).read())
 b=source_bytes(f);assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==CONFIG['source']['blob']
 for n in CONFIG['source']['notices']:
  dest=a.out/'source-notices'/n['path'];dest.parent.mkdir(exist_ok=True)
  if not dest.exists():dest.write_bytes(urllib.request.urlopen(n['url']).read())
  assert hashlib.sha256(dest.read_bytes()).hexdigest()==n['sha256']
 oracle=native(b,CONFIG['edit']);write_json(a.out/'source-oracle.json',oracle);verify_charset(a.out)
 print(json.dumps({'sourceSha256':CONFIG['source']['sha256'],'paragraphs':oracle['expected']['texts'],'nativeCRs':len(oracle['paragraphs']),'charsetRows':11172,'actualUniqueKoreanSyllables':len(oracle['observedModernSyllables'])},ensure_ascii=False))
if __name__=='__main__':main()
