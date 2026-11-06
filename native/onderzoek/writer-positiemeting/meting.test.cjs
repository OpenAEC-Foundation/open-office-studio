/* De observator mag retourwaarden, ontvangers, fouten, oorsprong of methode-eigendom niet veranderen. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/meting.js','utf8'),ctx);
function proef(){let klok=0,update;const obj={eigen:true},fout=new Error('fout');
 const proto={admit(fn,...rest){this.rest=rest;return this.laatste=Promise.resolve().then(fn)}};const rij=Object.create(proto);
 const sessie={onUpdate(fn){update=fn;return()=>update=null},applyLocalUpdate(v){assert.equal(this,sessie);update(v,'local');return v},setSelection(v){assert.equal(this,sessie);this.paragraphSpans('body');return v},paragraphSpans(s){assert.equal(this,sessie);if(s==='fout')throw fout;return obj},storySegments(){return[obj,obj]},storySegmentUnitDigests(){return['geheime inhoud']}};
 const response={json:async()=>obj};const fetch=async function(){assert.equal(this,w);return response};const w={performance:{now:()=>++klok},fetch,__TAURI_INTERNALS__:{convertFileSrc:n=>'ipc://'+n}};const orig={...sessie};const m=ctx.plaatsPositiemeting(w,rij,sessie);return{w,rij,sessie,m,obj,fout,orig,fetch};}
(async()=>{
 const p=proef();let klaar;const blokkade=new Promise(r=>klaar=r);
 const promise=p.rij.admit(async function(a){assert.equal(a,p.obj);const r=await p.w.fetch('ipc://writer_tekst_voorbereiden',{body:JSON.stringify({aanvraag:{text:'geheime inhoud',position:{story:'body'}}})});assert.equal(await r.json(),p.obj);assert.equal(p.sessie.applyLocalUpdate(p.obj),p.obj);assert.equal(p.sessie.setSelection(p.obj),p.obj);assert.equal(p.sessie.paragraphSpans('body'),p.obj);assert.throws(()=>p.sessie.paragraphSpans('fout'),e=>e===p.fout);p.sessie.storySegmentUnitDigests('body');await blokkade;return p.obj}.bind(null,p.obj),'rest');
 assert.equal(promise,p.rij.laatste);await new Promise(r=>setImmediate(r));assert.equal(p.m.lees().regels.filter(x=>x.soort==='taakeinde').length,0);klaar();assert.equal(await promise,p.obj);assert.deepEqual(p.rij.rest,['rest']);
 await assert.rejects(p.rij.admit(()=>{throw p.fout}),e=>e===p.fout);await assert.rejects(p.rij.admit(async()=>{throw p.fout}),e=>e===p.fout);
 const r=p.m.stop();assert.equal(r.updates,1);assert.equal(r.gemist,0);assert(r.regels.some(x=>x.soort==='bronupdate'&&x.oorsprong==='local'&&x.fase==='mutatie'&&x.taak===1));assert(r.groepen.some(x=>x.naam==='paragraphSpans'&&x.fase==='selectie'&&x.aantal===1));assert(r.groepen.some(x=>x.naam==='paragraphSpans'&&x.fase==='na_selectie'&&x.aantal===2));assert(!JSON.stringify(r).includes('geheime inhoud'));assert(!Object.hasOwn(p.rij,'admit'));assert.equal(p.w.fetch,p.fetch);for(const k of Object.keys(p.orig))assert.equal(p.sessie[k],p.orig[k]);assert.equal(JSON.stringify(p.m.stop()),JSON.stringify(r));
 const q=proef();for(let n=0;n<4200;n++)q.sessie.setSelection(q.obj);const cap=q.m.stop();assert.equal(cap.regels.length,4096);assert(cap.gemist>0);
 const z=proef();z.m.stop();const f=z.sessie.applyLocalUpdate;delete z.sessie.setSelection;assert.throws(()=>ctx.plaatsPositiemeting(z.w,z.rij,z.sessie),/Meetmethode ontbreekt/);assert.equal(z.sessie.applyLocalUpdate,f);assert(!Object.hasOwn(z.rij,'admit'));
 console.log('Doorgifte, asynchrone grenzen, fouten, oorsprong, geheimhouding, begrenzing en herstel slagen.');
})().catch(e=>{console.error(e);process.exitCode=1});
// De gedeelde klasse wordt alleen via de actieve sessie gevonden; recursie telt één buitenste projectie.
(async()=>{
 const p=proef();p.m.stop();
 class Projectie{constructor(){this.stories=new Map}buildStory(id){this.stories.set(id,1);if(id==='body')this.buildStory('cel');if(id==='fout')throw p.fout;return p.obj}}
 const prototype=Projectie.prototype,oud=prototype.buildStory,projectie=new Projectie;
 const el={__reactFiber$eigen:{memoizedState:{memoizedState:{current:{session:p.sessie,projection:projectie}},next:null},return:null}};
 const w={document:{querySelectorAll:()=>[el]}};assert.equal(ctx.zoekEigenProjectiePrototype(w,p.sessie),prototype);assert.throws(()=>ctx.zoekEigenProjectiePrototype(w,{}),/Geen unieke eigen/);
 const m=ctx.plaatsPositiemeting(p.w,p.rij,p.sessie,prototype);assert.equal(projectie.buildStory('body'),p.obj);assert.throws(()=>projectie.buildStory('fout'),e=>e===p.fout);const d=m.stop();assert.equal(prototype.buildStory,oud);const g=d.groepen.find(x=>x.naam==='positieprojectie');assert.equal(g.aantal,2);assert.equal(g.elementen,3);assert(d.regels.some(x=>x.soort==='projectie'&&x.bezoeken===2&&x.verhalen===2));
 console.log('Recursieve eigen projectie en foutpaden hersteld.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Cacheobservatie mag de laatst toegewezen waarde, schrijfbaarheid en gedeeltelijke fouten niet verliezen.
(()=>{
 const p=proef();p.m.stop();const waarde={session:p.sessie,version:1,rootStory:'body',projection:{}};const ref={current:waarde};const descriptor=Object.getOwnPropertyDescriptor(ref,'current');
 const m=ctx.plaatsPositiemeting(p.w,p.rij,p.sessie,undefined,[ref]);const nieuw={...waarde,version:2,projection:{}};ref.current=nieuw;assert.equal(ref.current,nieuw);const d=m.stop();assert.deepEqual(Object.getOwnPropertyDescriptor(ref,'current'),{...descriptor,value:nieuw});assert(d.regels.some(x=>x.soort==='cachetoewijzing'&&x.vorig.versie===1&&x.nieuw.versie===2&&x.nieuw.eigenSessie&&x.vorig.projectie!==x.nieuw.projectie));
 const fout=Object.freeze({current:waarde});assert.throws(()=>ctx.plaatsPositiemeting(p.w,p.rij,p.sessie,undefined,[ref,fout]),/niet observeerbaar/);assert.deepEqual(Object.getOwnPropertyDescriptor(ref,'current'),{...descriptor,value:nieuw});assert(!Object.hasOwn(p.rij,'admit'));
 const projectie={stories:new Map,buildStory(){}};const actieveRef={current:{session:p.sessie,projection:projectie}};const el={__reactFiber$eigen:{memoizedState:{memoizedState:actieveRef,next:null},return:null}};assert.equal(ctx.zoekEigenProjectieRefs({document:{querySelectorAll:()=>[el,el]}},p.sessie).length,1);assert.throws(()=>ctx.zoekEigenProjectieRefs({document:{querySelectorAll:()=>[el]}},{}),/Geen begrensde eigen/);
 console.log('Cachewaarden, beschrijvers, sessieselectie en gedeeltelijke afwijzing behouden.');
})();
// Stapels zijn beperkt tot acht eigen constructies, ook als de projectieref actief is.
(()=>{
 const p=proef();p.m.stop();class Projectie{constructor(){this.stories=new Map}buildStory(id){this.stories.set(id,1);return p.obj}}
 const ref={current:null},m=ctx.plaatsPositiemeting(p.w,p.rij,p.sessie,Projectie.prototype,[ref]);
 for(let n=0;n<12;n++){const x=new Projectie;assert.equal(x.buildStory('body'),p.obj);ref.current={version:n,session:p.sessie,rootStory:'body',projection:x}}
 const d=m.stop(),paden=d.regels.filter(x=>x.soort==='projectie'&&x.stapel);assert.equal(paden.length,8);assert(paden.every(x=>x.stapel.length<=6000));assert.equal(d.regels.filter(x=>x.soort==='cachetoewijzing').length,12);assert.equal(ref.current.version,11);
 console.log('Stapels en objectbinding begrensd; laatste cachewaarde behouden.');
})();
