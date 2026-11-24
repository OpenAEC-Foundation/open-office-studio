"""Bounded native FictionBook body oracle, with explicit source schema gap."""
from pathlib import Path
import hashlib
from xml.etree import ElementTree as E
F='{http://www.gribuser.ru/xml/fictionbook/2.0}'
X='{http://www.w3.org/2001/XMLSchema}'
SCHEMA_SHA='db2c0a239f4654db808d580b4d835fda9b41df09c169556116c4092ca47865b3'
def native(data,edit):
 assert b'<!DOCTYPE' not in data and b'<!ENTITY' not in data
 root=E.fromstring(data);assert root.tag==F+'FictionBook'
 description=root.find(F+'description');assert description is not None
 title_info=description.find(F+'title-info');document_info=description.find(F+'document-info');assert title_info is not None and document_info is not None
 metadata={p:description.find(p).text for p in [F+'title-info/'+F+'book-title',F+'title-info/'+F+'lang',F+'document-info/'+F+'date',F+'document-info/'+F+'version']}
 bodies=root.findall(F+'body');assert len(bodies)==1 and [x.tag for x in bodies[0]]==[F+'section']
 section=bodies[0][0];assert [x.tag for x in section]==[F+'p'];p=section[0];assert len(p)==0
 texts=[p.text or ''];assert texts==['Hello world.']
 schema_bytes=Path('scripts/qa-fb2/reference/FictionBook.xsd').read_bytes();assert hashlib.sha256(schema_bytes).hexdigest()==SCHEMA_SHA
 schema=E.fromstring(schema_bytes)
 genre=schema.find(X+"complexType[@name='title-infoType']/"+X+'sequence/'+X+"element[@name='genre']")
 doc=schema.find('.//'+X+"element[@name='document-info']");doc_id=doc.find('./'+X+'complexType/'+X+'sequence/'+X+"element[@name='id']")
 assert genre is not None and doc_id is not None and genre.get('minOccurs','1')=='1' and doc_id.get('minOccurs','1')=='1'
 missing=[]
 if title_info.find(F+'genre') is None:missing.append('description/title-info/genre')
 if document_info.find(F+'id') is None:missing.append('description/document-info/id')
 assert len(missing)==2
 edited=list(texts);edited[edit['paragraph']]=edit['text']+edited[edit['paragraph']]
 return {'method':'Own namespace-aware original XML body/section/paragraph reader, metadata kept separate; no converter-output baseline','namespace':F[1:-1],'bodyCount':1,'sourceLogicalSections':[{'path':'FictionBook/body[0]/section[0]','paragraphs':texts,'hasTitle':False}],'metadataInventory':metadata,'authorInventory':{'titleInfo':[' '.join(x.itertext()) for x in title_info.findall(F+'author')],'documentInfo':[' '.join(x.itertext()) for x in document_info.findall(F+'author')]},'schemaAssessment':{'schemaSha256':SCHEMA_SHA,'method':'Direct inspection of required declarations and source absence, not a complete validating XSD processor','missingRequiredFields':missing,'formalSchemaConformance':False,'qualification':'Authentic upstream minimal regression fixture with missing required reference-schema metadata; not a complete schema-valid FB2 witness'},'expected':{'texts':texts,'editedTexts':edited,'edit':edit,'documentMainContentType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml','paragraphCount':1,'unexpectedBodyObjects':0},'fullFormatAcceptance':False}
