"""AbiWord source qualification and independently checked OOXML properties."""
import argparse,hashlib,json,os,urllib.request,zipfile,zlib
from pathlib import Path
from xml.etree import ElementTree as E
from native import native,inflate_container,MAX_XML_BYTES
CONFIG=json.loads((Path(__file__).parent/'fixture.json').read_text(encoding='utf-8'))
OUT=Path(os.environ.get('OOS_ZABW_OUTPUT','.local/zabw-qa'))
def write_json(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def source_bytes(p):
 b=Path(p).read_bytes();assert len(b)==CONFIG['source']['bytes'] and hashlib.sha256(b).hexdigest()==CONFIG['source']['sha256'];return b
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A='{http://schemas.openxmlformats.org/drawingml/2006/main}'
CT='{http://schemas.openxmlformats.org/package/2006/content-types}'
def visible(run):
 return ''.join((x.text or '') if x.tag==W+'t' else '\t' if x.tag==W+'tab' else '\n' if x.tag in (W+'br',W+'cr') and x.get(W+'type')!='page' else '' for x in run if x.tag in (W+'t',W+'tab',W+'br',W+'cr'))
def docx(p,out,edited,observe):
 source=native(source_bytes(out/'source.zabw'),CONFIG['edit']);expected=source['expected'];wanted=expected['editedTexts' if edited else 'texts'];checks=[];mismatches=[]
 def check(name,actual,expected):
  item={'case':name,'actual':actual,'expected':expected,'passed':actual==expected};checks.append(item)
  if actual!=expected:mismatches.append(item)
 with zipfile.ZipFile(p) as z:
  root=E.fromstring(z.read('word/document.xml'));body=root.find(W+'body');paras=body.findall(W+'p');styles=E.fromstring(z.read('word/styles.xml'));types=E.fromstring(z.read('[Content_Types].xml'))
  stylemap={s.get(W+'styleId'):s for s in styles.findall(W+'style')};default=next((s.get(W+'styleId') for s in styles.findall(W+'style') if s.get(W+'default') in ('1','true') and s.get(W+'type')=='paragraph'),None)
  theme=E.fromstring(z.read('word/theme/theme1.xml')) if 'word/theme/theme1.xml' in z.namelist() else None
  def chain(sid,kind):
   seen=set();result=[]
   while sid and sid in stylemap:
    assert sid not in seen,'OOXML style cycle';seen.add(sid);s=stylemap[sid];result.append(s.find(W+kind));base=s.find(W+'basedOn');sid=base.get(W+'val') if base is not None else None
   return result
  def layers(pnode,run=None,paragraph=False):
   pp=pnode.find(W+'pPr');ps=pp.find(W+'pStyle') if pp is not None else None;sid=ps.get(W+'val') if ps is not None else default
   if paragraph:return [pp]+chain(sid,'pPr')+[styles.find('./'+W+'docDefaults/'+W+'pPrDefault/'+W+'pPr')]
   rp=run.find(W+'rPr');rs=rp.find(W+'rStyle') if rp is not None else None
   return [rp]+chain(rs.get(W+'val') if rs is not None else None,'rPr')+chain(sid,'rPr')+[styles.find('./'+W+'docDefaults/'+W+'rPrDefault/'+W+'rPr')]
  def first(parts,tag):return next((x.find(W+tag) for x in parts if x is not None and x.find(W+tag) is not None),None)
  def font(parts):
   for layer in parts:
    f=layer.find(W+'rFonts') if layer is not None else None
    if f is None:continue
    if f.get(W+'ascii') is not None:return f.get(W+'ascii')
    themed=f.get(W+'asciiTheme')
    if themed is not None:
     kind='majorFont' if themed.startswith('major') else 'minorFont' if themed.startswith('minor') else None
     latin=theme.find('./'+A+'themeElements/'+A+'fontScheme/'+A+kind+'/'+A+'latin') if theme is not None and kind else None
     return latin.get('typeface') if latin is not None else None
   return None
  texts=[];families=[];sizes=[];alignments=[]
  for pnode in paras:
   text='';faces=[];half=[]
   for run in pnode.iter(W+'r'):
    t=visible(run);parts=layers(pnode,run);size=first(parts,'sz');h=int(size.get(W+'val')) if size is not None else None
    text+=t;faces.extend([font(parts)]*len(t));half.extend([h]*len(t))
   texts.append(text);families.append(faces);sizes.append(half)
   parts=layers(pnode,paragraph=True);jc=first(parts,'jc');bidi=first(parts,'bidi');rtl=bidi is not None and bidi.get(W+'val','true') not in ('0','false','off')
   alignments.append(jc.get(W+'val') if jc is not None else 'right' if rtl else 'left')
  content=next((x.get('ContentType') for x in types.findall(CT+'Override') if x.get('PartName')=='/word/document.xml'),None)
  sections=list(root.iter(W+'sectPr'));pages=[]
  for sec in sections:
   sz=sec.find(W+'pgSz');pages.append([int(sz.get(W+'w')),int(sz.get(W+'h'))] if sz is not None else None)
  check('ordinary DOCX document main type',content,expected['documentMainContentType'])
  check('native section count',len(sections),expected['sectionCount'])
  check('native paragraph count',len(paras),len(wanted))
  check('exact source XML paragraph text',texts,wanted)
  nativefaces=list(expected['fontFamilies']);nativesizes=list(expected['fontHalfPoints'])
  if edited:nativefaces=[nativefaces[0]]*len(CONFIG['edit']['text'])+nativefaces;nativesizes=[nativesizes[0]]*len(CONFIG['edit']['text'])+nativesizes
  check('effective encoded ASCII font family per character',families,[nativefaces])
  check('effective encoded font half-point size per character',sizes,[nativesizes])
  check('effective left paragraph alignment',alignments,[expected['alignment']])
  check('encoded Letter portrait page dimensions',pages,[expected['pageTwips']])
 report={'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'paragraphTexts':texts,'encodedFontFamilies':families,'encodedFontHalfPoints':sizes,'alignments':alignments,'pageTwips':pages,'mainContentType':content,'checkedCases':checks,'mismatches':mismatches,'boundedSourceAcceptance':not mismatches,'fullFormatAcceptance':False,'limits':CONFIG['source']['coverageLimit']}
 write_json(out/(p.stem+'-xml-report.json'),report);print(json.dumps({'file':p.name,'boundedSourceAcceptance':not mismatches,'mismatches':mismatches}))
 if not observe:assert not mismatches,mismatches
 return report

def validate_container_controls(out,original):
 import gzip,io
 crc=bytearray(original);crc[-8]^=1
 buffer=io.BytesIO()
 with gzip.GzipFile(filename='hello.abw',mode='wb',fileobj=buffer,mtime=0) as stream:stream.write(b'X'*(MAX_XML_BYTES+1))
 variants={'corrupt-crc':bytes(crc),'truncated-trailer':original[:-4],'concatenated-members':original+original,'over-expansion-bound':buffer.getvalue()}
 reports=[]
 for name,data in variants.items():
  try:inflate_container(data)
  except (AssertionError,ValueError,zlib.error) as error:
   if name=='over-expansion-bound':assert 'Oversized' in str(error),'Expected expansion bound, not another early rejection'
   reports.append({'control':name,'rejected':True,'errorType':type(error).__name__,'reason':str(error)})
  else:raise AssertionError('Container defect accepted: '+name)
 write_json(out/'container-controls.json',{'role':'Synthetic negative controls only, never positive ZABW fixture/import evidence','controls':reports,'passed':True})

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['source','docx']);p.add_argument('--out',type=Path,default=OUT);p.add_argument('--docx',type=Path);p.add_argument('--edited',action='store_true');p.add_argument('--observe',action='store_true');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 if a.mode=='docx':docx(a.docx,a.out,a.edited,a.observe);return
 f=a.out/'source.zabw'
 if not f.exists():f.write_bytes(urllib.request.urlopen(CONFIG['source']['url']).read())
 b=source_bytes(f);assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==CONFIG['source']['blob']
 for n in CONFIG['source']['notices']:
  dest=a.out/'source-notices'/n['path'];dest.parent.mkdir(exist_ok=True)
  if not dest.exists():dest.write_bytes(urllib.request.urlopen(n['url']).read())
  assert hashlib.sha256(dest.read_bytes()).hexdigest()==n['sha256']
 oracle=native(b,CONFIG['edit']);write_json(a.out/'source-oracle.json',oracle)
 validate_container_controls(a.out,b)
 print(json.dumps({'sourceSha256':CONFIG['source']['sha256'],'expected':oracle['expected'],'externalDTDLoaded':False}))
if __name__=='__main__':main()
