import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bron = readFileSync(new URL('../../scripts/gui/spelling_startvoorwaarde.js', import.meta.url), 'utf8');
const voerUit = new (Object.getPrototypeOf(async function () {}).constructor)('performance', 'setTimeout', '_vervolgProef', bron);
async function proef(stand, stap = () => {}) {
  let tijd = 0;
  return voerUit({ now: () => tijd }, (klaar, ms) => {
    tijd += ms;
    stap(stand, tijd);
    klaar();
  }, stand);
}

assert.deepEqual(await proef({ hercontroleGestart: true, lezingen: 32, verhalen: 1537 }), { wacht_ms: 0, lezingen: 32, verhalen: 1537 });
assert.deepEqual(await proef({ hercontroleGestart: false, lezingen: 0, verhalen: 1537 }, (s, tijd) => {
  if (tijd === 15) Object.assign(s, { hercontroleGestart: true, lezingen: 32 });
}), { wacht_ms: 15, lezingen: 32, verhalen: 1537 });
await assert.rejects(proef({ hercontroleGestart: false, lezingen: 32, verhalen: 1537 }), /niet gestart/);
await assert.rejects(proef({ hercontroleGestart: true, lezingen: 0, verhalen: 1537 }), /niet gestart/);
await assert.rejects(proef({ hercontroleGestart: true, lezingen: 1537, verhalen: 1537 }), /al volledig/);
await assert.rejects(proef({ hercontroleGestart: false, lezingen: 0, verhalen: 1537 }, s => Object.assign(s, { hercontroleGestart: true, lezingen: 1537 })), /al volledig/);
console.log('Zes startvoorwaarden slagen; een lege of voltooide lezing telt niet als toetsproef.');
