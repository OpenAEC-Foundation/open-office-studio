import vm from 'node:vm';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const bron=readFileSync('scripts/gui/leeslevensduur.js','utf8'),token={},fout=new Error('Eigen fout');let werp=false;
const s={oosBewaarUpdate:true,applyUpdate(callback){assert.equal(this,s);return callback();},readStories(...args){assert.equal(this,s);assert.equal(args[0],token);if(werp)throw fout;return token;},readParagraphs(){return token;},destroy(){return token;}};
const origineel=Object.getOwnPropertyDescriptors(s),window={},context=vm.createContext({api:()=>({getEditorRef:()=>({getYrsSession:()=>s})}),window,performance:{now:()=>1}});
vm.runInContext(bron,context);assert.equal(s.applyUpdate(()=>s.readStories(token)),token);werp=true;assert.throws(()=>s.applyUpdate(()=>s.readStories(token)),e=>e===fout);werp=false;
assert.equal(s.destroy(),token);assert.equal(s.readStories(token),token);const r=window._leesProbe.stop();assert.ok(r.hersteld);assert.ok(r.regels.some(x=>x.naam==='readStories:begin'&&x.schrijfDiepte===1&&x.leesDiepte===1&&x.bewaarAdoptie));assert.ok(r.regels.some(x=>x.naam==='readStories:begin'&&x.vernietigd));assert.ok(r.regels.some(x=>x.fout));assert.deepEqual(Object.getOwnPropertyDescriptors(s),origineel);
// Geen await in de wrapper: ook een Promise blijft exact hetzelfde object.
const promise=Promise.resolve(token);s.readStories=()=>promise;vm.runInContext(bron,context);assert.equal(s.readStories(token),promise);assert.equal(window._leesProbe.stop().hersteld,true);
console.log('this/argument/retour/exception/descriptors en Promise-identiteit behouden; nesting en destroy-volgorde vastgelegd.');

vm.runInContext(bron,context);const later=()=>token;s.readParagraphs=later;const derde=window._leesProbe.stop();assert.equal(derde.hersteld,false);assert.equal(s.readParagraphs,later);assert.equal(derde.vervangen[0],'readParagraphs');assert.ok(derde.regels);console.log('Vervangen methode niet overschreven; opname behouden en afkeuring gemarkeerd.');
