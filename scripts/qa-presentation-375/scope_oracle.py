"""Independent real-source RGB and unchanged-content oracle; no complete fidelity pass."""
import argparse
import colorsys
import copy
import hashlib
import io
import json
from pathlib import Path
import posixpath
import subprocess
import sys
import xml.etree.ElementTree as E
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parent/'engine'))
from oracle import parse_source,read_pptx

A='{http://schemas.openxmlformats.org/drawingml/2006/main}'
P='{http://schemas.openxmlformats.org/presentationml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def fills(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        def link(origin,kind):
            rel=posixpath.join(posixpath.dirname(origin),'_rels',posixpath.basename(origin)+'.rels')
            found=[r for r in E.fromstring(z.read(rel)) if r.get('Type','').endswith('/'+kind)]
            assert len(found)==1 and found[0].get('TargetMode')!='External'
            target=posixpath.normpath(posixpath.join(posixpath.dirname(origin),found[0].get('Target')))
            assert target.startswith('ppt/') and target in z.namelist();return target
        pres='ppt/presentation.xml';r=E.fromstring(z.read(pres))
        ids=r.find(P+'sldIdLst');assert len(ids)==3
        rels=E.fromstring(z.read('ppt/_rels/presentation.xml.rels'))
        sid=ids[2].get(R+'id');rel=next(n for n in rels if n.get('Id')==sid);assert rel.get('TargetMode')!='External'
        slide=posixpath.normpath(posixpath.join('ppt',rel.get('Target')));s=E.fromstring(z.read(slide))
        layout=link(slide,'slideLayout');l=E.fromstring(z.read(layout));master=link(layout,'slideMaster');m=E.fromstring(z.read(master))
        theme=E.fromstring(z.read(link(master,'theme')))
        palette={n.tag.split('}')[-1]:list(n)[0] for n in theme.find(A+'themeElements/'+A+'clrScheme')}
        mapping=dict(m.find(P+'clrMap').attrib)
        for owner in (l,s):
            override=owner.find(P+'clrMapOvr/'+A+'overrideClrMapping')
            if override is not None:mapping=dict(override.attrib)
        shapes=[n for n in s.find(P+'cSld/'+P+'spTree') if n.tag in (P+'sp',P+'cxnSp')];assert len(shapes)==4
        result=[]
        for index in (1,2):
            solid=shapes[index].find(P+'spPr/'+A+'solidFill');assert solid is not None and len(solid)==1
            color=solid[0];kind=color.tag.split('}')[-1]
            if kind=='schemeClr':
                base=palette[mapping.get(color.get('val'),color.get('val'))]
                rgb=base.get('lastClr') if base.tag==A+'sysClr' else base.get('val')
            else:
                assert kind in ('srgbClr','sysClr');rgb=color.get('lastClr') if kind=='sysClr' else color.get('val')
            assert rgb and len(rgb)==6
            channels=[int(rgb[i:i+2],16)/255 for i in (0,2,4)];h,lum,sat=colorsys.rgb_to_hls(*channels)
            for transform in color:
                tag=transform.tag.split('}')[-1];assert tag in ('lumMod','lumOff')
                v=int(transform.get('val'))/100000;lum=lum*v if tag=='lumMod' else lum+v;lum=max(0,min(1,lum))
            result.append('#'+''.join(f'{int(c*255+0.5):02x}' for c in colorsys.hls_to_rgb(h,lum,sat)))
        return result


def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    source=parse_source(a.out/'source.uop');expected=[source['slides'][2]['shapes'][i]['fill'] for i in (1,2)]
    blob=subprocess.check_output(['git','show','e280e9521cfad3b2c61c26d19fbb5df8b5b74a42:docs/tests/uop-2026-11-23/retained/uop-runtime-result.zip'])
    assert hashlib.sha256(blob).hexdigest()=='e5e3ae456b1c30eb01215797dcc465ba0f3913fb9c2b7794fe965ee814e38839'
    checks=[]
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for name in ('converted.pptx','saved.pptx','reopened-saved.pptx'):
            current=a.out/name;actual=fills(current.read_bytes());assert actual==expected,(name,actual,expected)
            baseline=a.out/('p2-baseline-'+name);baseline.write_bytes(z.read(name))
            before=read_pptx(baseline);after=read_pptx(current)
            for i in (1,2):before['slides'][2]['shapes'][i]['fill']=None;after['slides'][2]['shapes'][i]['fill']=None
            assert before==after,'Unrelated observed content changed: '+name
            checks.append({'file':name,'sourceRGB':expected,'actualRGB':actual,'unchangedOtherObservedContent':True,'sha256':hashlib.sha256(current.read_bytes()).hexdigest()})
    report={'issue':375,'passed':True,'checks':checks,'completeFormatAcceptanceClaim':False,
            'limits':['Only resolved two rectangle fills and unchanged independently observed structure/text/geometry/notes/media/formulas versus exact P2 control','Known complete-source canvas/stroke failures remain separate','No native/visual/portable/runtimeactivation acceptance']}
    (a.out/'scope375-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))


if __name__=='__main__':main()
