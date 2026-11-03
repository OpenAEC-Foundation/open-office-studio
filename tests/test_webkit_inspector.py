"""Consolefouten mogen tijdens een geslaagd inspectieantwoord niet verdwijnen."""
import importlib.util
import json
from pathlib import Path
import unittest

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


if __name__ == '__main__':
    unittest.main()
