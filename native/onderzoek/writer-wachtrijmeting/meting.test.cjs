/* Controleer doorgifte, afwijzingen, begrenzing en volledig herstel van de observator. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/meting.js','utf8'),ctx);
function proef(){let klok=0,luisteraar,update;const callbacks=[];
 const proto={admit(fn,...rest){this.rest=rest;return this.laatste=Promise.resolve().then(fn)}};
 const rij=Object.create(proto);rij.depth=0;
 const sessie={version(){return 7},applyLocalUpdate(v){update?.();return v},setSelection(v){return v},onUpdate(fn){update=fn;return()=>{update=null}}};
 class EigenWorker{postMessage(...args){this.args=args;return 'behouden'}addEventListener(n,fn){this.fn=fn}removeEventListener(n,fn){assert.equal(this.fn,fn);this.fn=null}}
 const oudPost=EigenWorker.prototype.postMessage;
 const antwoord={preparationMs:4};const oud=async()=>({json:async()=>antwoord});
 const w={Worker:EigenWorker,performance:{now:()=>++klok},fetch:oud,__TAURI_INTERNALS__:{convertFileSrc:n=>'ipc://'+n},addEventListener(n,fn){luisteraar=fn},removeEventListener(n,fn){assert.equal(fn,luisteraar);luisteraar=null},requestAnimationFrame(fn){callbacks.push(fn);return callbacks.length},cancelAnimationFrame(){},__OPENAEC_WRITER_INVOERMETING__:{lees:()=>({monsters:[]}),start(){this.actief=true},stop(){assert(this.actief);this.actief=false;return{monsters:[]}}}};
 const orig={...sessie},m=ctx.plaatsWachtrijmeting(w,rij,sessie);
 return{w,rij,sessie,m,oud,orig,oudPost,antwoord,key(){luisteraar({key:'a',ctrlKey:false,metaKey:false})},frame(){callbacks.shift()(100)}};
}
(async()=>{
 const p=proef(),obj={eigen:true};p.key();p.frame();let binnen;
 const promise=p.rij.admit(async function(){binnen=await p.w.fetch('ipc://writer_tekst_voorbereiden',{body:JSON.stringify({aanvraag:{text:'eigen',basis:'abc'}})});assert.equal(await binnen.json(),p.antwoord);assert.equal(p.sessie.applyLocalUpdate(obj),obj);assert.equal(p.sessie.setSelection(obj),obj);return obj},true);
 assert.equal(promise,p.rij.laatste);assert.equal(await promise,obj);assert.deepEqual(p.rij.rest,[true]);
 const fout=new Error('eigen fout');await assert.rejects(p.rij.admit(()=>{throw fout}),e=>e===fout);
 await assert.rejects(p.rij.admit(async()=>{throw fout}),e=>e===fout);
 assert.equal(p.sessie.version(),7);const worker=new p.w.Worker(),data={type:'layout',payload:'geheim'};assert.equal(worker.postMessage(data,['overdracht']),'behouden');assert.equal(worker.args[0],data);worker.fn({data:{type:'result',payload:'geheim'}});
 const r=p.m.stop();assert.equal(p.w.Worker.prototype.postMessage,p.oudPost);assert.equal(worker.fn,null);assert.equal(r.lezingen.version.aantal,1);assert.equal(r.regels.filter(x=>x.soort==='worker').length,2);assert(!JSON.stringify(r).includes('geheim'));assert.equal(r.gemist,0);assert.equal(r.toetsen,1);assert(r.regels.some(x=>x.soort==='nativejson'&&x.rustMs===4&&x.taak===1));assert(r.regels.some(x=>x.soort==='taakeinde'&&x.goed===false));assert(r.regels.some(x=>x.soort==='bronupdate'));
 assert.equal(p.w.fetch,p.oud);assert.equal(p.sessie.applyLocalUpdate,p.orig.applyLocalUpdate);assert(!Object.hasOwn(p.rij,'admit'));assert(!JSON.stringify(r).includes('abc'));assert(!JSON.stringify(r).includes('eigen'));
 const q=proef();for(let i=0;i<4200;i++)q.key();const cap=q.m.stop();assert.equal(cap.regels.length,4096);assert(cap.gemist>0);
 const rij={admit(){},enqueue(){},captureInteractionEpoch(){},hasPending:()=>false};const el={__reactFiber$eigen:{memoizedState:{memoizedState:{current:rij},next:null},return:null}};
 assert.equal(ctx.zoekEigenInvoerrij({document:{querySelectorAll:()=>[el]}}),rij);assert.throws(()=>ctx.zoekEigenInvoerrij({document:{querySelectorAll:()=>[]}}),/invoer ontbreekt/);
 console.log('Doorgifte, async/sync fouten, taakbinding, begrenzing en herstel slagen.');
})().catch(e=>{console.error(e);process.exitCode=1});
