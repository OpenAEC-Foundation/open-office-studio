#!/usr/bin/env python3
"""Voer bronrondgangen uit in aparte processen en bewaar voortgang controleerbaar."""
import argparse
import concurrent.futures
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--programma',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--bronmap',type=Path,default=Path.cwd())
    p.add_argument('--uitvoer',type=Path,required=True)
    p.add_argument('--seconden',type=int,default=30)
    p.add_argument('--processen',type=int,default=2)
    p.add_argument('--hervat',action='store_true')
    args=p.parse_args()
    if args.seconden<1 or not 1<=args.processen<=4: p.error('Ongeldige tijdslimiet of maximaal vier processen')
    exe=args.programma.resolve(strict=True)
    programmahash=hashlib.file_digest(exe.open('rb'),'sha256').hexdigest()
    programmastaat=(exe.stat().st_size,exe.stat().st_mtime_ns)
    versie=subprocess.check_output([str(exe),'--version'],text=True,encoding='utf-8',timeout=10).strip()
    if not versie.startswith('Open Office native bestandscontrole '):
        p.error('Gebruik controleer-bestand, niet de gewone desktopapp')
    manifesthash=hashlib.file_digest(args.manifest.open('rb'),'sha256').hexdigest()
    manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
    bestanden=manifest['bestanden'] if isinstance(manifest,dict) else manifest
    selectie=[(n,b) for n,b in enumerate(bestanden) if b['extensie'].lower().lstrip('.') in ('docx','xlsx','pptx','eml')]
    if not selectie: p.error('Het manifest bevat geen bron voor deze native controle')
    resultaten=[]
    eerder=0
    if args.uitvoer.exists():
        if not args.hervat: p.error('Uitvoer bestaat al; gebruik een nieuw pad of --hervat')
        vorig=json.loads(args.uitvoer.read_text(encoding='utf-8'))
        if (vorig['programma_sha256'],vorig['manifest_sha256'],vorig['seconden_per_bron'])!=(programmahash,manifesthash,args.seconden):
            p.error('Hervatten vereist hetzelfde programma, manifest en dezelfde tijdslimiet')
        resultaten=vorig['resultaten'];eerder=vorig['looptijd_seconden']
    afgerond={r['volgnummer'] for r in resultaten}
    werk=[item for item in selectie if item[0] not in afgerond]
    prlimit=shutil.which('prlimit') if sys.platform.startswith('linux') else None
    start=time.monotonic()
    args.uitvoer.parent.mkdir(parents=True,exist_ok=True)

    def controleer(item):
        n,b=item
        basis={k:b[k] for k in ('id','bron','revisie','pad','extensie','sha256') if k in b}
        basis['volgnummer']=n
        pad=args.bronmap/b['bestand']
        if not pad.is_file(): return dict(basis,status='bron_ontbreekt')
        if not b.get('sha256') or hashlib.file_digest(pad.open('rb'),'sha256').hexdigest()!=b['sha256']:
            return dict(basis,status='bronhash_wijkt_af')
        if (exe.stat().st_size,exe.stat().st_mtime_ns)!=programmastaat:
            return dict(basis,status='programma_veranderd')
        cmd=[str(exe),str(pad.resolve())]
        if prlimit: cmd=[prlimit,'--as=3221225472','--']+cmd
        try: r=subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=args.seconden)
        except subprocess.TimeoutExpired: return dict(basis,status='time-out')
        if r.returncode: return dict(basis,status='proces_afgebroken',afsluitcode=r.returncode,stderr=r.stderr[-2000:])
        try: meting=json.loads(r.stdout.strip().splitlines()[-1])
        except (ValueError,IndexError): return dict(basis,status='ongeldige_uitvoer',stderr=r.stderr[-2000:])
        if not isinstance(meting,dict) or not isinstance(meting.get('status'),str):
            return dict(basis,status='ongeldige_uitvoer')
        return dict(basis,**meting)

    def bewaar():
        rapport={'programma':versie,'programma_sha256':programmahash,'manifest_sha256':manifesthash,
            'omvang':'Eerste werkweergave en zichtbare tekstvelden na bewaren; geen volledige functie- of pixelpariteit',
            'seconden_per_bron':args.seconden,'processen':args.processen,'adresruimte_bytes':3*1024**3 if prlimit else None,
            'manifest_totaal':len(bestanden),'geselecteerd':len(selectie),'afgerond':len(resultaten),
            'overige_formaten':dict(Counter(b['extensie'] for b in bestanden if b['extensie'].lower().lstrip('.') not in ('docx','xlsx','pptx','eml'))),
            'statussen':dict(Counter(r['status'] for r in resultaten)),
            'alle_geselecteerde_rondgangen_geslaagd':len(resultaten)==len(selectie) and all(r['status']=='geslaagd' for r in resultaten),
            'looptijd_seconden':round(eerder+time.monotonic()-start,2),'resultaten':sorted(resultaten,key=lambda r:r['volgnummer'])}
        tmp=args.uitvoer.with_suffix(args.uitvoer.suffix+'.tmp')
        tmp.write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        os.replace(tmp,args.uitvoer)

    bewaar()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.processen) as pool:
        for f in concurrent.futures.as_completed([pool.submit(controleer,b) for b in werk]):
            resultaten.append(f.result());bewaar()
            if len(resultaten)%20==0 or len(resultaten)==len(selectie):
                print(len(resultaten),'/',len(selectie),dict(Counter(r['status'] for r in resultaten)),flush=True)
    raise SystemExit(0 if len(resultaten)==len(selectie) and all(r['status']=='geslaagd' for r in resultaten) else 1)

if __name__=='__main__': main()
