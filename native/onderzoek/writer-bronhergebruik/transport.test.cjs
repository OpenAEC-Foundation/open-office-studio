/* De meting moet doorgeven, begrenzen en ongeschikte bronbinding onderscheiden. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bron=fs.readFileSync(__dirname+'/transport.js','utf8');
async function proef(){
  const ctx=vm.createContext({});vm.runInContext(bron,ctx);
  const origineel={schema:2,requestId:'vraag',documentId:'document',sourceVersion:'versie',snapshotSha256:'hash',clientId:7,sourceVector:'AQ==',snapshot:'AQ=='};
  let antwoord=null,fout=null,ontvangen;
  const oud=async function(...args){ontvangen={zelf:this,args};if(fout)throw fout;return {json:async()=>antwoord}};
  const w={fetch:oud,__TAURI_INTERNALS__:{convertFileSrc:n=>'ipc://'+n}},m=ctx.plaatsBronmeting(w);
  const vraag=async(a,b)=>{antwoord=b;const args={body:JSON.stringify({aanvraag:a})};const r=await w.fetch('ipc://writer_tekst_voorbereiden',args);assert.equal(ontvangen.zelf,w);assert.equal(ontvangen.args[1],args);assert.equal(await r.json(),b);return m.lees().regels.at(-1)};
  const reply=a=>({...a,basis:'a'.repeat(64),bronvector:a.sourceVector,delta:'Ag=='});
  const eerste=await vraag(origineel,reply(origineel));assert.equal(eerste.hergebruikGeschikt,false);assert.equal(eerste.bronbytes,1);
  const warm={...origineel,basis:'a'.repeat(64),snapshot:'Ag=='};
  assert.equal((await vraag(warm,reply(warm))).hergebruikGeschikt,true);
  for(const [veld,waarde]of [['clientId',8],['documentId','ander'],['basis','b'.repeat(64)],['snapshot','Aw==']]){
    await vraag(warm,reply(warm));assert.equal((await vraag({...warm,[veld]:waarde},reply({...warm,[veld]:waarde}))).hergebruikGeschikt,false);
  }
  for(const b of [{...reply(warm),requestId:'verkeerd'},{...reply(warm),bronvector:'Aw=='},{...reply(warm),retryFull:true}]){
    await vraag(warm,b);assert.equal((await vraag(warm,reply(warm))).vorig,false);
  }
  await w.fetch('ipc://writer_bron_vergeten',{});assert.equal((await vraag(warm,reply(warm))).vorig,false);
  fout=new Error('transport');await assert.rejects(w.fetch('ipc://writer_tekst_voorbereiden',{body:JSON.stringify({aanvraag:warm})}),e=>e===fout);fout=null;
  await vraag(warm,reply(warm));
  for(let i=0;i<1050;i++)await vraag(warm,reply(warm));
  const data=m.lees();assert.equal(data.regels.length,1024);assert(data.gemist>0);
  const json=JSON.stringify(data);assert(!json.includes('snapshot"'));assert(!json.includes('Ag=='));assert(!json.includes('document"'));
  data.regels[0].schema=99;assert.equal(m.lees().regels[0].schema,2);
  m.stop();assert.equal(w.fetch,oud);
  console.log('Bronbinding, afwijzingen, vergeten, doorgeven, foutbehoud en begrenzing slagen.');
}
proef().catch(e=>{console.error(e);process.exitCode=1});
