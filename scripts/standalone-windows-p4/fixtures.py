"""Only committed empty office templates and a synthetic local SQLite database."""
from pathlib import Path
import hashlib
import json
import shutil
import sqlite3
import sys
import posixpath
import xml.etree.ElementTree as ET
import zipfile

root=Path(sys.argv[1]); root.mkdir(exist_ok=False)
files={}
for ext in ('docx','xlsx','pptx'):
    target=root/('Standalone23.'+ext); shutil.copyfile(Path('public/templates/nieuw.'+ext),target)
    files[ext]={'file':str(target.resolve()),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}

# Read the actual unchanged PPTX title-placeholder frame, including layout
# inheritance, before choosing the native text-edit point. No engine mutation.
with zipfile.ZipFile(files['pptx']['file']) as z:
    ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
    size=ET.fromstring(z.read('ppt/presentation.xml')).find('p:sldSz',ns)
    slide=ET.fromstring(z.read('ppt/slides/slide1.xml'))
    shape=next(s for s in slide.findall('.//p:sp',ns) if s.find('p:nvSpPr/p:nvPr/p:ph',ns) is not None and s.find('p:nvSpPr/p:nvPr/p:ph',ns).get('type') in ('title','ctrTitle'))
    files['pptx']['nativeEditableText']=''.join(n.text or '' for n in shape.findall('.//a:t',ns))
    assert files['pptx']['nativeEditableText']
    xfrm=shape.find('p:spPr/a:xfrm',ns)
    if xfrm is None:
        rel=next(r for r in ET.fromstring(z.read('ppt/slides/_rels/slide1.xml.rels')) if r.get('Type','').endswith('/slideLayout'))
        layout=ET.fromstring(z.read(posixpath.normpath(posixpath.join('ppt/slides',rel.get('Target')))))
        ph=shape.find('p:nvSpPr/p:nvPr/p:ph',ns)
        matching=[s for s in layout.findall('.//p:sp',ns) if s.find('p:nvSpPr/p:nvPr/p:ph',ns) is not None and s.find('p:nvSpPr/p:nvPr/p:ph',ns).get('type')==ph.get('type')]
        assert len(matching)==1
        xfrm=matching[0].find('p:spPr/a:xfrm',ns)
    off=xfrm.find('a:off',ns);ext=xfrm.find('a:ext',ns)
    point=dict(x=(int(off.get('x'))+int(ext.get('cx'))/2)/int(size.get('cx')),y=(int(off.get('y'))+int(ext.get('cy'))/2)/int(size.get('cy')))
    assert 0<point['x']<1 and 0<point['y']<1
    files['pptx']['nativeEditablePoint']=point
    files['pptx']['pointSource']='Actual original title placeholder/layout XML centre'
database=root/'Standalone23.sqlite'
connection=sqlite3.connect(database)
connection.execute('create table standalone_qa(label text not null, amount integer not null)')
connection.execute('insert into standalone_qa values (?,?)',('STANDALONE23 DATABASE',42)); connection.commit(); connection.close()
files['database']={'file':str(database.resolve()),'sha256':hashlib.sha256(database.read_bytes()).hexdigest()}
(root/'manifest.json').write_text(json.dumps(files,indent=2)+'\n',encoding='utf-8')
