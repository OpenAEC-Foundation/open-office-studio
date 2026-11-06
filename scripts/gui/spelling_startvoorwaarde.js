// Begin de echte toetsproef pas nadat de eigen hercontrole verhalen leest.
// Een afgeronde of nog niet gestarte lezing bewijst geen onderbreekbaarheid.
const begin = performance.now(), eind = begin + 10000;
while (!_vervolgProef.hercontroleGestart || _vervolgProef.lezingen === 0) {
  if (performance.now() > eind)
    throw Error('Spellinglezing niet gestart; geen toetsproef uitgevoerd');
  await new Promise(r => setTimeout(r, 5));
}
if (_vervolgProef.lezingen >= _vervolgProef.verhalen)
  throw Error('Spellinglezing al volledig; geen onderbrekingsproef');
return { wacht_ms: performance.now() - begin, lezingen: _vervolgProef.lezingen, verhalen: _vervolgProef.verhalen };
