from pathlib import Path
import copy,datetime,hashlib,json,uuid
w=Path('.local/controle-2026-10-31');d=w/'gui-alpha40-notition-debug-lokaal';r=json.loads((d/'rapport.json').read_text());assert r['expliciet_gestopt'];st={s['beeldnaam']:s for s in r['stappen'] if 'beeldnaam' in s};orig_hash=r['begindata_sha256'];assert orig_hash=='60a6ee7e1d73b1029a1359192753452c255baa283ce27e70f879a11928050d6c'
def bytes_sha(h):
 p=d/f'bron-{h}.openaec-notities';b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==h;return b
def bron(naam):return json.loads(bytes_sha(st[naam]['bron_sha256']))
def pagina(a):return a['boeken'][0]['secties'][0]['paginas'][0]
def tijd(a):return datetime.datetime.fromisoformat(pagina(a)['bijgewerkt'].replace('Z','+00:00'))
def verwacht_tijd(exp,act,voor):
 assert tijd(act)>=tijd(voor);pagina(exp)['bijgewerkt']=pagina(act)['bijgewerkt'];assert exp==act
orig=json.loads(bytes_sha(orig_hash));resultaten=[]
for naam,undo in [('snelle-greep-bewaard','snelle-greep-undo-bewaard'),('herhaling-twee-bewaard','herhaling-twee-undo-bewaard')]:
 act=bron(naam);exp=copy.deepcopy(orig);v=pagina(exp)['vakken'][0];v['breedte']=620.;v['hoogte']=218.;verwacht_tijd(exp,act,orig);assert st[undo]['bron_sha256']==orig_hash;resultaten.append({'proef':naam,'breedte':620,'hoogte':218,'overige_bronvelden_exact':True,'undo_bron_bytegelijk':True})
leeg=bron('vrij-blok-bewaard');v=pagina(leeg)['vakken'];assert len(v)==3;nieuw=v[2];assert uuid.UUID(nieuw['id']).version==4;assert uuid.UUID(nieuw['blokken'][0]['id']).version==4
assert nieuw['id'] not in {x['id'] for x in pagina(orig)['vakken']};expvak={'id':nieuw['id'],'x':322.,'y':370.,'breedte':560,'hoogte':160,'blokken':[{'id':nieuw['blokken'][0]['id'],'soort':'tekst','tekst':'','vet':False,'cursief':False,'klaar':False}]};assert nieuw==expvak
exp=copy.deepcopy(orig);pagina(exp)['vakken'].append(nieuw);verwacht_tijd(exp,leeg,orig)
tekst=bron('vrij-blok-tekst-bewaard');exp=copy.deepcopy(leeg);pagina(exp)['vakken'][2]['blokken'][0]['tekst']='Nieuw vrij blok';verwacht_tijd(exp,tekst,leeg)
assert st['vrij-blok-tekst-undo-bewaard']['bron_sha256']==st['vrij-blok-bewaard']['bron_sha256'];assert st['vrij-blok-toevoeging-undo-bewaard']['bron_sha256']==orig_hash;assert r['einddata_sha256']==orig_hash
resultaten.append({'proef':'Dubbelklik op 800/700, tekst en twee afzonderlijke bronexacte undos','positie':[322,370],'tekst':'Nieuw vrij blok','overige_bronvelden_exact':True,'undo_bron_bytegelijk':True})
for s in r['stappen']:
 b=d/s['beeld']['bestand'];assert hashlib.sha256(b.read_bytes()).hexdigest()==s['beeld']['sha256']
rapport={'omvang':'Twee snelle zichtbare-greepbewegingen met focus in het andere vak, vrije dubbelklik, tekstinvoer en bronexacte undos in het echte alpha40-debugvenster. Iedere overige bronwaarde wordt exact vergeleken; alleen de bewerkt-tijd van de werkelijk gewijzigde pagina mag monotone wijzigen. Geen volledige GUI-, menu- of pixelgoedkeuring.','afgebakende_bronproeven_geslaagd':True,'resultaten':resultaten,'geregistreerde_stappen':len(r['stappen']),'eindbron_sha256':orig_hash,'openstaand':'Eerste bestandsmenu-/Escape-beelden liepen achter; afzonderlijke Expose toont actuele toestand. Herteken-/verzendfout blijft open en wordt apart onderzocht.'};(d/'broncontrole.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n');print(json.dumps(rapport,ensure_ascii=False))
