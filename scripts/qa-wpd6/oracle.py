"""Bounded native WordPerfect byte oracle; no Office/parser output baseline."""
import argparse,hashlib,json,os,struct,urllib.request,zipfile
from pathlib import Path,PurePosixPath
from xml.etree import ElementTree as E
CONFIG=json.loads(Path('scripts/qa-wpd6/fixture.json').read_text())
OUT=Path(os.environ.get('OOS_WPD6_OUTPUT','.local/wpd6-qa'))
def write_json(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def source_bytes(p):
 b=Path(p).read_bytes();assert len(b)==CONFIG['source']['bytes'] and hashlib.sha256(b).hexdigest()==CONFIG['source']['sha256'];return b

def native(b):
 u16=lambda p:struct.unpack_from('<H',b,p)[0]
 u32=lambda p:struct.unpack_from('<I',b,p)[0]
 assert b[:4]==bytes.fromhex('ff575043') and b[8:12]==bytes([1,10,2,1]) and u16(12)==0
 start=u32(4);idx=u16(14);assert idx==512 and u32(20)==len(b) and b[idx:idx+2]==b'\x02\x00'
 count=u16(idx+2);packets=[]
 for i in range(1,count):
  p=idx+i*14;flags,typ,uses,hidden,n,off=struct.unpack_from('<BBHHII',b,p)
  assert idx+count*14<=off<=off+n<=start
  packets.append(dict(id=i,flags=flags,type=typ,uses=uses,hidden=hidden,bytes=n,offset=off,sha256=hashlib.sha256(b[off:off+n]).hexdigest()))
 def stream(begin,end):
  pos=begin;events=[]
  while pos<end:
   code=b[pos]
   if 0xD0<=code<=0xEF:
    n=u16(pos+2);assert n>=10 and pos+n<=end and b[pos+n-1]==code and u16(pos+n-3)==n
    flag=b[pos+4];p=pos+5;pids=[]
    if flag&128:
     cnt=b[p];p+=1;pids=[u16(p+2*k) for k in range(cnt)];p+=2*cnt
    nondel=u16(p);p+=2;assert p+nondel<=pos+n-3
    events.append(dict(offset=pos,gate=f'{code:02x}{b[pos+1]:02x}',bytes=n,prefixIds=pids,nondeletable=b[p:p+nondel].hex()))
    pos+=n
   else:
    if code==128:text=' '
    else:assert 33<=code<=126,(pos,code);text=chr(code)
    if events and 'text' in events[-1]:events[-1]['text']+=text
    else:events.append(dict(offset=pos,text=text))
    pos+=1
  return events
 body=stream(start,len(b));texts=[e['text'] for e in body if 'text' in e];assert texts==['Foo','foo']
 assert [e['gate'] for e in body if e.get('gate','').startswith('d0')]==['d004','d009']
 headers=[]
 for e in body:
  if e.get('gate')=='d600':
   assert len(e['prefixIds'])==1;pid=e['prefixIds'][0];pkt=packets[pid-1];assert pkt['type']==8 and pkt['flags']==2
   off=pkt['offset'];assert u16(off)==1;rel=u32(off+2);n=u32(off+6);assert rel+n==pkt['bytes']
   se=stream(off+rel,off+rel+n);text=''.join(x.get('text','') for x in se);headers.append(dict(prefixId=pid,text=text,events=se,bodyReference=e,occursOddAndEven=(int.from_bytes(bytes.fromhex(e['nondeletable']),'little')&3)==3))
 assert [h['text'] for h in headers]==['Header Type A','Header Type A but changed']
 assert all(h['occursOddAndEven'] for h in headers)
 return {'sourceSha256':CONFIG['source']['sha256'],'method':'Own static byte reader against pinned Corel SDK document/index/gate/header semantics; no libwpd or converter executed','header':{'documentOffset':start,'indexOffset':idx,'major':2,'minor':1,'encryption':0,'declaredBytes':u32(20)},'prefixPackets':packets,'bodyEvents':body,'headers':headers,'expected':{'texts':texts,'editedTexts':[CONFIG['edit']['text']+texts[0],texts[1]],'edit':CONFIG['edit'],'headerTexts':[h['text'] for h in headers],'hardReturnBeforeHardPage':True},'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit']}
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
def visible(p):
 return ''.join((x.text or '') if x.tag==W+'t' else '\t' if x.tag==W+'tab' else '\n' if x.tag in (W+'br',W+'cr') and x.get(W+'type')!='page' else '' for run in p.iter(W+'r') for x in run if x.tag in (W+'t',W+'tab',W+'br',W+'cr'))
def docx(p,out,edited,observe):
 oracle=native(source_bytes(out/'source.wpd'));expected=oracle['expected']['editedTexts' if edited else 'texts'];checks=[];mismatches=[]
 def check(name,actual,wanted):
  checks.append({'case':name,'actual':actual,'expected':wanted,'passed':actual==wanted})
  if actual!=wanted:mismatches.append(checks[-1])
 with zipfile.ZipFile(p) as z:
  root=E.fromstring(z.read('word/document.xml'));body=root.find(W+'body');paras=body.findall(W+'p');alltexts=[visible(x) for x in paras];texts=[x for x in alltexts if x]
  check('case-sensitive nonempty body paragraphs',texts,expected)
  # Distinct p elements establish the explicit native hard return; exact empty section carriers are inventoried, not accepted as page layout.
  nonempty=[i for i,t in enumerate(alltexts) if t];check('hard return separates body text paragraphs',len(nonempty)==2 and nonempty[1]>nonempty[0],True)
  rels={x.get('Id'):x.get('Target') for x in E.fromstring(z.read('word/_rels/document.xml.rels'))}
  headertexts=[];headers=[];sectionHeaders=[]
  settings=E.fromstring(z.read('word/settings.xml'))
  def enabled(x):return x is not None and x.get(W+'val','true') not in ('false','0','off')
  evenOdd=enabled(settings.find(W+'evenAndOddHeaders'))
  for si,sec in enumerate(root.iter(W+'sectPr')):
   title=enabled(sec.find(W+'titlePg'));activeTexts={}
   for ref in sec.findall(W+'headerReference'):
    target=rels[ref.get(R+'id')];part=str(PurePosixPath('word')/target) if not target.startswith('/') else target[1:]
    hr=E.fromstring(z.read(part));ts=[visible(x) for x in hr.iter(W+'p')];text='\n'.join(x for x in ts if x)
    typ=ref.get(W+'type');active=typ=='default' or (typ=='first' and title) or (typ=='even' and evenOdd)
    headers.append({'section':si,'type':typ,'part':part,'text':text,'active':active,'titlePg':title,'evenAndOddHeaders':evenOdd})
    if active:
     activeTexts[typ]=text
     if not headertexts or headertexts[-1]!=text:headertexts.append(text)
   sectionHeaders.append(activeTexts)
  check('successive active Header A exact text',headertexts,oracle['expected']['headerTexts'])
  check('default headers cover both odd and even pages',not evenOdd and all(not enabled(s.find(W+'titlePg')) for s in root.iter(W+'sectPr')),True)
  # Each sectPr closes its own section. Map the two source body segments to that section's default header.
  section=0;bodyHeaderTexts=[]
  for i,pnode in enumerate(paras):
   if alltexts[i]:bodyHeaderTexts.append(sectionHeaders[section].get('default'))
   if pnode.find('./'+W+'pPr/'+W+'sectPr') is not None:section+=1
  check('body segments retain corresponding Header A definitions',bodyHeaderTexts,oracle['expected']['headerTexts'])
  boundaries=[]
  for i,pnode in enumerate(paras):
   pagebr=any(x.get(W+'type')=='page' for x in pnode.iter(W+'br'))
   pb=pnode.find('./'+W+'pPr/'+W+'pageBreakBefore')
   sec=pnode.find('./'+W+'pPr/'+W+'sectPr');stype=sec.find(W+'type') if sec is not None else None
   nextpage=sec is not None and (stype is None or stype.get(W+'val') in ('nextPage','oddPage','evenPage'))
   if pagebr or pb is not None or nextpage:boundaries.append({'paragraph':i,'pageBreak':pagebr,'pageBreakBefore':pb is not None,'sectionNextPage':nextpage})
  between=any(nonempty[0]<=x['paragraph']<=nonempty[1] and (x['paragraph']<nonempty[1] or x['pageBreakBefore']) for x in boundaries) if len(nonempty)==2 else False
  check('explicit page boundary between body text segments',between,True)
 report={'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'paragraphTexts':texts,'allParagraphTexts':alltexts,'headers':headers,'pageBoundaries':boundaries,'checkedCases':checks,'mismatches':mismatches,'boundedSourceAcceptance':not mismatches,'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit']}
 write_json(out/(p.stem+'-xml-report.json'),report);print(json.dumps({'file':p.name,'boundedSourceAcceptance':not mismatches,'mismatches':mismatches}))
 if not observe:assert not mismatches,mismatches
 return report

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['source','docx']);p.add_argument('--out',type=Path,default=OUT);p.add_argument('--docx',type=Path);p.add_argument('--edited',action='store_true');p.add_argument('--observe',action='store_true');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 if a.mode=='docx':docx(a.docx,a.out,a.edited,a.observe);return
 source=a.out/'source.wpd'
 if not source.exists():source.write_bytes(urllib.request.urlopen(CONFIG['source']['url']).read())
 b=source_bytes(source);assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==CONFIG['source']['blob']
 for n in CONFIG['source']['notices']:
  dest=a.out/'source-notices'/n['path'];dest.parent.mkdir(exist_ok=True)
  if not dest.exists():dest.write_bytes(urllib.request.urlopen(n['url']).read())
  assert hashlib.sha256(dest.read_bytes()).hexdigest()==n['sha256']
 oracle=native(b);write_json(a.out/'source-oracle.json',oracle);print(json.dumps({'sourceSha256':oracle['sourceSha256'],'expected':oracle['expected'],'packets':len(oracle['prefixPackets'])}))
if __name__=='__main__':main()
