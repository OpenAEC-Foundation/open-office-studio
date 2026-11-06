/* De opname bewaart haar eigen gegevens en wijzigt geldige transportobjecten niet. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/opnemen.js','utf8'),ctx);
function maak(){let antwoord={},fout=null,ontvangen;const oud=async function(...args){ontvangen={zelf:this,args};if(fout)throw fout;return{json:async()=>antwoord}};
 const w={fetch:oud,__TAURI_INTERNALS__:{convertFileSrc:n=>'ipc://'+n}},m=ctx.plaatsOpname(w);
 return{w,m,oud,set(b,e){antwoord=b;fout=e},get ontvangen(){return ontvangen},async vraag(a){const args={body:JSON.stringify({aanvraag:a})},r=await w.fetch('ipc://writer_tekst_voorbereiden',args);assert.equal(ontvangen.zelf,w);assert.equal(ontvangen.args[1],args);const b=await r.json();assert.equal(b,antwoord);return b}}}
(async()=>{
 const a={schema:2,text:'Eigen proeftekst',snapshot:'AQ=='},b={delta:'Ag=='};
 {const t=maak();t.set(b);await t.vraag(a);await t.w.fetch('https://eigen.test',{});const r=t.m.stop();assert.equal(JSON.stringify(r.ronden),JSON.stringify([{aanvraag:a,antwoord:b}]));assert.equal(t.w.fetch,t.oud);assert(r.omvang>0)}
 {const t=maak();t.set(b);const eerste=await t.w.fetch('ipc://writer_tekst_voorbereiden',{body:JSON.stringify({aanvraag:a})});await assert.rejects(t.vraag(a),/sequentiële/);await eerste.json();assert.throws(()=>t.m.stop(),/sequentiële/)}
 {const t=maak();t.set(b);for(let i=0;i<256;i++)await t.vraag(a);await assert.rejects(t.vraag(a),/sequentiële/);assert.throws(()=>t.m.stop(),/sequentiële/)}
 {const t=maak();await assert.rejects(t.vraag({...a,text:'x'.repeat(16*1024*1024)}),/begrensde/);assert.throws(()=>t.m.stop(),/begrensde/)}
 {const t=maak();t.set({delta:'x'.repeat(16*1024*1024)});await assert.rejects(t.vraag(a),/Antwoord overschrijdt/);assert.throws(()=>t.m.stop(),/Antwoord overschrijdt/)}
 {const t=maak(),e=new Error('originele fout');t.set(null,e);await assert.rejects(t.vraag(a),f=>f===e);assert.throws(()=>t.m.stop(),/Transportfout/);assert.equal(t.w.fetch,t.oud)}
 console.log('Doorgifte, sequentie, aantals-/omvangsgrens, fouten en herstel slagen.');
})().catch(e=>{console.error(e);process.exitCode=1});
