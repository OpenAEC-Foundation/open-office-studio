"""Consolefouten mogen tijdens een geslaagd inspectieantwoord niet verdwijnen."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch

spec = importlib.util.spec_from_file_location('webkit_inspector', Path(__file__).parents[1] / 'scripts/gui/webkit_inspector.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Verbinding:
    def __init__(self, berichten):
        self.berichten = iter(berichten)
        self.verzonden = []

    async def send(self, tekst):
        self.verzonden.append(json.loads(tekst))

    async def recv(self):
        return json.dumps(next(self.berichten))


def bericht(inhoud):
    return {'method': 'Target.dispatchMessageFromTarget', 'params': {'message': json.dumps(inhoud)}}


class InspectieConsole(unittest.IsolatedAsyncioTestCase):
    async def test_consolefout_naast_geslaagd_antwoord_blijft_bewaard(self):
        fout = {'level': 'error', 'text': 'Document worker is not initialized'}
        antwoord = {'id': 1, 'result': {'result': {'type': 'boolean', 'value': True}}}
        inspectie = module.Inspector(0)
        inspectie.target = 'eigen-testpagina'
        inspectie.ws = Verbinding([
            {'id': 1, 'result': {}},
            bericht({'method': 'Console.messageAdded', 'params': {'message': fout}}),
            bericht(antwoord),
        ])
        self.assertEqual(await inspectie.command('Runtime.evaluate'), antwoord)
        self.assertEqual(inspectie.consoleberichten, [fout])

    async def test_protocolfout_blijft_een_fout(self):
        inspectie = module.Inspector(0)
        inspectie.target = 'eigen-testpagina'
        inspectie.ws = Verbinding([{'id': 1, 'error': {'message': 'Testpagina gesloten'}}])
        with self.assertRaisesRegex(RuntimeError, 'Testpagina gesloten'):
            await inspectie.command('Runtime.evaluate')


class InspectieOpdracht(unittest.IsolatedAsyncioTestCase):
    async def test_eerste_inspectiefout_blijft_behouden_bij_tweede_opruimfout(self):
        eerste = RuntimeError('Oorspronkelijke inspectiefout')
        inspectie = module.Inspector(0)
        inspectie.ev = AsyncMock(side_effect=[None, eerste, TimeoutError('Opruimen reageert niet')])
        with patch.object(module.asyncio, 'sleep', new=AsyncMock()):
            with self.assertRaises(RuntimeError) as fout:
                await inspectie.run('return true;')
        self.assertIs(fout.exception, eerste)
        self.assertEqual(inspectie.opruimfouten, [{'taak': 1, 'fout': "TimeoutError('Opruimen reageert niet')"}])

    async def test_annuleren_blijft_annuleren_bij_een_opruimfout(self):
        eerste = module.asyncio.CancelledError()
        inspectie = module.Inspector(0)
        inspectie.ev = AsyncMock(side_effect=[None, eerste, TimeoutError('Opruimen reageert niet')])
        with patch.object(module.asyncio, 'sleep', new=AsyncMock()):
            with self.assertRaises(module.asyncio.CancelledError) as fout:
                await inspectie.run('return true;')
        self.assertIs(fout.exception, eerste)

    async def test_javascriptfout_wordt_niet_vervangen_door_opruimfout(self):
        inspectie = module.Inspector(0)
        inspectie.ev = AsyncMock(side_effect=[None, json.dumps({'fout': 'Oorspronkelijke documentfout'}), TimeoutError('Opruimen reageert niet')])
        with patch.object(module.asyncio, 'sleep', new=AsyncMock()):
            with self.assertRaisesRegex(RuntimeError, 'Oorspronkelijke documentfout'):
                await inspectie.run('throw Error("Oorspronkelijke documentfout");')

    async def test_opdrachttijdgrens_wordt_niet_vervangen_door_opruimfout(self):
        inspectie = module.Inspector(0)
        inspectie.ev = AsyncMock(side_effect=[None, RuntimeError('Opruimen mislukt')])
        with self.assertRaisesRegex(TimeoutError, 'Asynchrone testopdracht niet gereed'):
            await inspectie.run('return new Promise(()=>{});', t=0)

    async def test_opruimfout_na_een_geslaagd_antwoord_blijft_een_afkeuring(self):
        fout = RuntimeError('Resultaatvak kon niet worden opgeruimd')
        inspectie = module.Inspector(0)
        inspectie.ev = AsyncMock(side_effect=[None, json.dumps({'uit': 42}), fout])
        with patch.object(module.asyncio, 'sleep', new=AsyncMock()):
            with self.assertRaises(RuntimeError) as afkeuring:
                await inspectie.run('return 42;')
        self.assertIs(afkeuring.exception, fout)


if __name__ == '__main__':
    unittest.main()
