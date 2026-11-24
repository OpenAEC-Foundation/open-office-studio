"""Independent bounded AbiWord source XML oracle; no converter baseline."""
from decimal import Decimal
from xml.etree import ElementTree as E
A='{http://www.abisource.com/awml.dtd}'
def props(value):
 result={}
 for entry in (value or '').split(';'):
  if not entry.strip():continue
  key,value=entry.split(':',1);key=key.strip();assert key not in result;result[key]=value.strip()
 return result

def native(data,edit):
 assert data.startswith(b'<?xml') and b'<!ENTITY' not in data and b'<!DOCTYPE abiword PUBLIC' in data
 root=E.fromstring(data);assert root.tag==A+'abiword' and root.get('template')=='false' and root.get('fileformat')=='1.0'
 styles={s.get('name'):s for s in root.findall('./'+A+'styles/'+A+'s')};sections=root.findall(A+'section');assert len(sections)==1
 paragraphs=[]
 for section in sections:
  assert [x.tag for x in section]==[A+'p']
  for p in section:
   assert p.text in (None,'') and [c.tag for c in p]==[A+'c']
   base=props(root.get('props'));base.update(props(section.get('props')));chain=[];style=p.get('style');layers=[]
   while style:
    assert style not in chain and style in styles;chain.append(style);s=styles[style];assert s.get('type')=='P';layers.insert(0,props(s.get('props')));style=s.get('basedon')
   for layer in layers:base.update(layer)
   base.update(props(p.get('props')));runs=[]
   for c in p:
    assert len(c)==0 and c.tail in (None,'');effective=dict(base);effective.update(props(c.get('props')))
    text=c.text or '';assert text.isascii()
    runs.append({'text':text,'effectiveProperties':effective,'rawAttributes':dict(c.attrib)})
   paragraphs.append({'sectionXid':section.get('xid'),'xid':p.get('xid'),'styleChain':chain,'text':''.join(x['text'] for x in runs),'effectiveProperties':base,'runs':runs})
 assert len(paragraphs)==1
 page=root.find(A+'pagesize');assert page is not None and page.get('units')=='in' and page.get('orientation')=='portrait'
 width=Decimal(page.get('width'))*1440;height=Decimal(page.get('height'))*1440;assert width==width.to_integral_value() and height==height.to_integral_value()
 runs=paragraphs[0]['runs'];families=[];sizes=[]
 for run in runs:
  pr=run['effectiveProperties'];size=pr['font-size'];assert size.endswith('pt');half=Decimal(size[:-2])*2;assert half==half.to_integral_value()
  families.extend([pr['font-family']]*len(run['text']));sizes.extend([int(half)]*len(run['text']))
 texts=[p['text'] for p in paragraphs];edited=list(texts);edited[edit['paragraph']]=edit['text']+edited[edit['paragraph']]
 assert texts==['hello world'] and set(families)=={'Times New Roman'} and set(sizes)=={24}
 return {'method':'Own direct namespace-aware AbiWord XML text/section/style/property reader before conversion; no external DTD or parser/converter execution','rootAttributes':dict(root.attrib),'metadata':{m.get('key'):m.text for m in root.findall('./'+A+'metadata/'+A+'m')},'sectionAttributes':[dict(s.attrib) for s in sections],'styles':{name:dict(s.attrib) for name,s in styles.items()},'paragraphs':paragraphs,'pagesize':dict(page.attrib),'expected':{'texts':texts,'editedTexts':edited,'edit':edit,'documentMainContentType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml','sectionCount':1,'fontFamilies':families,'fontHalfPoints':sizes,'alignment':paragraphs[0]['effectiveProperties']['text-align'],'pageTwips':[int(width),int(height)]},'fullFormatAcceptance':False}
