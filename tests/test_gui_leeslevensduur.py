"""Een late meetfout mag de oorspronkelijke native afkeuring niet vervangen."""
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from gui.leeslevensduur import LeesLevensduur


class LeesObservatieTest(unittest.IsolatedAsyncioTestCase):
    async def test_uitgeschakeld_geen_inspectie(self):
        p = AsyncMock(); r = {}
        async with LeesLevensduur(p, r) as o:
            await o.start()
        p.ev.assert_not_called(); self.assertEqual(r, {})

    async def test_opname_voor_sluiten_ook_bij_oorspronkelijke_fout(self):
        p = AsyncMock(); p.ev.side_effect = [{}, {'hersteld': True, 'over': 0}]
        r = {}; fout = RuntimeError('Eigen appfout')
        with self.assertRaises(RuntimeError) as uit:
            async with LeesLevensduur(p, r, True) as o:
                await o.start(); raise fout
        self.assertIs(uit.exception, fout)
        self.assertTrue(r['leesobservatie']['hersteld'])
        self.assertEqual(p.ev.call_args.args, ('_leesProbe.stop()',))

    async def test_meetfout_vervangt_geen_appfout(self):
        p = AsyncMock(); p.ev.side_effect = [{}, RuntimeError('Verbinding weg')]
        r = {}; fout = ValueError('Oorspronkelijk')
        with self.assertRaises(ValueError) as uit:
            async with LeesLevensduur(p, r, True) as o:
                await o.start(); raise fout
        self.assertIs(uit.exception, fout); self.assertIn('Verbinding weg', r['leesobservatie_fout'])

    async def test_meetfout_zonder_appfout_keurt_af(self):
        p = AsyncMock(); p.ev.side_effect = [{}, {'hersteld': False, 'over': 0}]
        rapport = {'geslaagd': True}
        with self.assertRaisesRegex(RuntimeError, 'onvolledig'):
            async with LeesLevensduur(p, rapport, True) as o:
                await o.start()
        self.assertFalse(rapport['geslaagd'])

    async def test_verloren_regels_keuren_af(self):
        p = AsyncMock(); p.ev.side_effect = [{}, {'hersteld': True, 'over': 1}]
        rapport = {'geslaagd': True}
        with self.assertRaisesRegex(RuntimeError, 'onvolledig'):
            async with LeesLevensduur(p, rapport, True) as o:
                await o.start()
        self.assertFalse(rapport['geslaagd'])

    async def test_mislukte_start_blijft_zichtbaar(self):
        p = AsyncMock(); p.ev.side_effect = RuntimeError('Start geweigerd')
        with self.assertRaisesRegex(RuntimeError, 'Start geweigerd'):
            async with LeesLevensduur(p, {}, True) as o:
                await o.start()
        self.assertEqual(p.ev.call_count, 1)
