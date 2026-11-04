"""Begrensde inspectie van uitsluitend de afzonderlijke lokale WebKit-testapp."""
import asyncio
import json
from pathlib import Path
import re
import time
from urllib.request import urlopen


class Inspector:
    def __init__(self, port, pagina=0):
        self.port = port
        self.pagina = pagina
        self.i = 0
        self.taak = 0
        self.consoleberichten = []
        self.opruimfouten = []

    async def __aenter__(self):
        from websockets import connect
        with urlopen(f'http://127.0.0.1:{self.port}/', timeout=5) as antwoord:
            html = antwoord.read().decode()
        paden = re.findall(r"(/socket/[^']+)", html)
        if not 0 <= self.pagina < len(paden):
            raise RuntimeError('Geen inspectieverbinding van de eigen testapp')
        self.ws = await connect(f'ws://127.0.0.1:{self.port}'+paden[self.pagina], max_size=16*1024*1024, origin=f'http://127.0.0.1:{self.port}')
        try:
            while True:
                bericht = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=30))
                if bericht.get('method') == 'Target.targetCreated' and bericht['params']['targetInfo']['type'] == 'page':
                    self.target = bericht['params']['targetInfo']['targetId']
                    return self
        except BaseException:
            await self.ws.close()
            raise

    async def __aexit__(self, *args):
        try:
            if hasattr(self, 'framebasis_uitvoer'):
                try:
                    await asyncio.wait_for(self.bewaar_framebasis(), timeout=5)
                except Exception as fout:
                    self.meld_framebasis_exportfout(fout)
                    if not args or args[0] is None:
                        raise
            if hasattr(self, 'workerbron_uitvoer'):
                try:
                    gegevens = await asyncio.wait_for(self.ev('window._officeWorkerBron.exporteer()'), timeout=5)
                    if not isinstance(gegevens, dict) or gegevens.get('schema') != 1:
                        raise RuntimeError('Workerbronbewaking ontbreekt bij afsluiten')
                    self.workerbron_uitvoer.write_text(json.dumps(gegevens, ensure_ascii=False)+'\n')
                except Exception as fout:
                    self.workerbron_exportfout = repr(fout)
                    try:
                        self.workerbron_uitvoer.with_suffix('.inspectiefout.json').write_text(json.dumps({'fout': self.workerbron_exportfout})+'\n')
                    except OSError as schrijffout:
                        self.workerbron_exportfout += '; diagnosebestand niet geschreven: '+repr(schrijffout)
                    if not args or args[0] is None:
                        raise
        finally:
            await self.ws.close()

    async def command(self, method, params=None):
        self.i += 1
        nummer = self.i
        await self.ws.send(json.dumps({'id': nummer, 'method': 'Target.sendMessageToTarget', 'params': {'targetId': self.target, 'message': json.dumps({'id': nummer, 'method': method, 'params': params or {}})}}))
        while True:
            bericht = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=90))
            if bericht.get('method') != 'Target.dispatchMessageFromTarget':
                if bericht.get('id') == nummer and bericht.get('error'):
                    raise RuntimeError(bericht['error'])
                continue
            bericht = json.loads(bericht['params']['message'])
            if bericht.get('method') == 'Console.messageAdded':
                self.consoleberichten.append(bericht['params']['message'])
            if bericht.get('id') == nummer:
                return bericht

    async def ev(self, code):
        bericht = await self.command('Runtime.evaluate', {'expression': code, 'returnByValue': True})
        if bericht.get('error') or bericht['result'].get('wasThrown'):
            raise RuntimeError(bericht)
        return bericht['result']['result'].get('value')

    async def begin_foutbewaking(self):
        await self.command('Console.enable')
        await self.ev('''(() => {
          if (window._officeGuiFouten) return true;
          const fouten = window._officeGuiFouten = [];
          const meld = tekst => {
            if (!fouten.some(f => f.tekst === tekst)) fouten.push({tekst, ronde: window._plakRonde ?? 0});
          };
          window.addEventListener('error', e => meld(String(e.error ?? e.message)));
          window.addEventListener('unhandledrejection', e => meld(String(e.reason)));
          const scan = () => {
            for (const e of document.querySelectorAll('.office-melding[data-toon="fout"]')) meld(e.textContent);
          };
          const meldingen = document.querySelector('.office-meldingen');
          if (!meldingen) throw Error('Meldingencontainer ontbreekt; foutbewaking kan niet starten');
          scan();
          new MutationObserver(scan).observe(meldingen, {childList:true, subtree:true, characterData:true});
          return true;
        })()''')

    async def fouten(self):
        gui = await self.ev('window._officeGuiFouten')
        if not isinstance(gui, list):
            raise RuntimeError('GUI-foutbewaking was niet gestart')
        engine = await self.ev('window._openaecWriterFouten ?? []')
        if not isinstance(engine, list):
            raise RuntimeError('Enginefoutopname heeft een ongeldige vorm')
        fouten = {'gui': gui, 'engine': engine, 'console': [m for m in self.consoleberichten if m.get('level') == 'error']}
        if any(fouten.values()) and hasattr(self, 'framebasis_uitvoer'):
            try:
                await self.bewaar_framebasis()
            except Exception as fout:
                self.meld_framebasis_exportfout(fout)
        return fouten

    def meld_framebasis_exportfout(self, fout):
        self.framebasis_exportfout = repr(fout)
        try:
            self.framebasis_uitvoer.with_suffix('.inspectiefout.json').write_text(json.dumps({'fout': self.framebasis_exportfout})+'\n')
        except OSError as schrijffout:
            # Ook een volle schijf mag de oorspronkelijke GUI-afkeuring niet vervangen.
            self.framebasis_exportfout += '; diagnosebestand niet geschreven: '+repr(schrijffout)

    async def begin_framebewaking(self, uitvoer):
        """Alleen bij de eigen proefbron, buiten de invoermeting; nooit de decoder aanpassen."""
        if hasattr(self, 'framebasis_uitvoer'):
            raise RuntimeError('Framebewaking is al gestart')
        if not await self.ev(Path(__file__).with_name('framebasis.js').read_text()):
            raise RuntimeError('Framebewaking is niet geïnstalleerd')
        self.framebasis_uitvoer = Path(uitvoer)

    async def bewaar_framebasis(self):
        gegevens = await self.ev('window._officeFramebasis')
        if not isinstance(gegevens, dict) or gegevens.get('schema') != 1:
            raise RuntimeError('Framebewaking ontbreekt in de eigen proefpagina')
        self.framebasis_uitvoer.write_text(json.dumps(gegevens, ensure_ascii=False)+'\n')
        return gegevens

    async def run(self, code, t=90):
        # Deze WebKit-route wacht niet betrouwbaar op een teruggegeven Promise.
        # Ieder verzoek heeft daarom een eigen begrensd, nagevraagd resultaat.
        self.taak += 1
        plek = f'window._officeProeven[{self.taak}]'
        await self.ev('window._officeProeven??={};'+plek+'={};void(async()=>{try{'+plek+'.uit=await(async()=>{'+code+'})();}catch(e){'+plek+'.fout=String(e)}})()')
        einde = time.monotonic()+t
        geslaagd = False
        try:
            while time.monotonic() < einde:
                await asyncio.sleep(.15)
                antwoord = json.loads(await self.ev('JSON.stringify('+plek.replace('window._officeProeven[', 'window._officeProeven?.[')+')') or 'null')
                if antwoord is None:
                    raise RuntimeError('De testpagina is tijdens inspectie vervangen')
                if 'fout' in antwoord:
                    raise RuntimeError(antwoord['fout'])
                if 'uit' in antwoord:
                    geslaagd = True
                    return antwoord['uit']
            raise TimeoutError('Asynchrone testopdracht niet gereed')
        finally:
            opruimen = 'delete '+plek.replace('window._officeProeven[', 'window._officeProeven?.[')
            if geslaagd:
                # Een onvolledig afgeronde gezonde proef blijft een afkeuring.
                await self.ev(opruimen)
            else:
                try:
                    # Een al onbereikbare pagina niet nogmaals 90 seconden
                    # afwachten of de oorspronkelijke foutstack vervangen.
                    await asyncio.wait_for(self.ev(opruimen), timeout=1)
                except Exception as fout:
                    self.opruimfouten.append({'taak': self.taak, 'fout': repr(fout)})
