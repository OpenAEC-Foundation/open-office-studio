"""Begrensde inspectie van uitsluitend de afzonderlijke lokale WebKit-testapp."""
import asyncio
import json
import re
import time
from urllib.request import urlopen
from websockets import connect


class Inspector:
    def __init__(self, port):
        self.port = port
        self.i = 0
        self.taak = 0

    async def __aenter__(self):
        with urlopen(f'http://127.0.0.1:{self.port}/', timeout=5) as antwoord:
            html = antwoord.read().decode()
        pad = re.search(r"(/socket/[^']+)", html)
        if not pad:
            raise RuntimeError('Geen inspectieverbinding van de eigen testapp')
        self.ws = await connect(f'ws://127.0.0.1:{self.port}'+pad.group(1), max_size=16*1024*1024, origin=f'http://127.0.0.1:{self.port}')
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
            if bericht.get('id') == nummer:
                return bericht

    async def ev(self, code):
        bericht = await self.command('Runtime.evaluate', {'expression': code, 'returnByValue': True})
        if bericht.get('error') or bericht['result'].get('wasThrown'):
            raise RuntimeError(bericht)
        return bericht['result']['result'].get('value')

    async def run(self, code, t=90):
        # Deze WebKit-route wacht niet betrouwbaar op een teruggegeven Promise.
        # Ieder verzoek heeft daarom een eigen begrensd, nagevraagd resultaat.
        self.taak += 1
        plek = f'window._officeProeven[{self.taak}]'
        await self.ev('window._officeProeven??={};'+plek+'={};void(async()=>{try{'+plek+'.uit=await(async()=>{'+code+'})();}catch(e){'+plek+'.fout=String(e)}})()')
        einde = time.monotonic()+t
        try:
            while time.monotonic() < einde:
                await asyncio.sleep(.15)
                antwoord = json.loads(await self.ev('JSON.stringify('+plek.replace('window._officeProeven[', 'window._officeProeven?.[')+')') or 'null')
                if antwoord is None:
                    raise RuntimeError('De testpagina is tijdens inspectie vervangen')
                if 'fout' in antwoord:
                    raise RuntimeError(antwoord['fout'])
                if 'uit' in antwoord:
                    return antwoord['uit']
            raise TimeoutError('Asynchrone testopdracht niet gereed')
        finally:
            await self.ev('delete '+plek.replace('window._officeProeven[', 'window._officeProeven?.['))
