"""Optionele leesobservatie; opruimen vóór de inspectieverbinding sluit."""
from pathlib import Path


class LeesLevensduur:
    def __init__(self, inspectie, rapport, aan=False):
        self.inspectie = inspectie
        self.rapport = rapport
        self.aan = aan
        self.gestart = False

    async def __aenter__(self):
        return self

    async def start(self):
        if not self.aan:
            return
        bron = Path(__file__).with_suffix('.js').read_text()
        self.rapport['leesobservatie_start'] = await self.inspectie.ev(bron)
        self.gestart = True

    async def __aexit__(self, soort, fout, traceback):
        if self.gestart:
            try:
                opname = await self.inspectie.ev('_leesProbe.stop()')
                self.rapport['leesobservatie'] = opname
                if opname.get('hersteld') is not True or opname.get('over') != 0:
                    raise RuntimeError('Leesobservatie onvolledig of niet hersteld')
            except Exception as meetfout:
                self.rapport['leesobservatie_fout'] = repr(meetfout)
                self.rapport['geslaagd'] = False
                # Een oorspronkelijke app-/testfout blijft de primaire fout.
                if fout is None:
                    raise
        return False
