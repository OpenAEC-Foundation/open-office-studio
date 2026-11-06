/* Alleen een begrensde eigen test-WebView; geen productcode of documentinhoud. */
function plaatsWachtrijmeting(w,rij,sessie) {
  const begin=w.performance.now(),regels=[],herstel=[],grens=4096;let gemist=0,actief=true,taak=0,volgende=0,toetsen=0,frame=null,vorigFrame=begin;
  const frames=[],lezingen={},workers=new WeakMap();let workerTeller=0;
  const tijd=()=>w.performance.now()-begin;
  function meld(soort,extra={}){if(!actief)return;if(regels.length<grens)regels.push({soort,t:tijd(),taak,toetsen,...extra});else gemist++}
  function vervang(o,k,fn){const eigen=Object.getOwnPropertyDescriptor(o,k),oud=o[k];if(typeof oud!=='function')throw Error('Meetmethode ontbreekt: '+k);o[k]=fn(oud);if(o[k]===oud)throw Error('Meetmethode niet geplaatst: '+k);herstel.push(()=>{if(eigen)Object.defineProperty(o,k,eigen);else delete o[k]})}
  vervang(rij,'admit',oud=>function(fn,...rest){
    const id=++volgende;meld('toelaten',{id,diepte:this.depth});
    return oud.call(this,function(...args){
      taak=id;meld('taakbegin',{id});let resultaat;
      try{resultaat=fn.apply(this,args)}catch(e){meld('taakeinde',{id,goed:false});taak=0;throw e}
      const klaar=goed=>{meld('taakeinde',{id,goed});taak=0};
      if(resultaat&&typeof resultaat.then==='function')resultaat.then(()=>klaar(true),()=>klaar(false));else klaar(true);
      return resultaat;
    },...rest);
  });
  for(const naam of ['applyLocalUpdate','setSelection'])vervang(sessie,naam,oud=>function(...args){meld('methodebegin',{naam});try{return oud.apply(this,args)}finally{meld('methodeeinde',{naam})}});
  for(const naam of ['storyIds','paragraphs','paragraphSpans','paragraphSegments','storySegments','storySegmentUnits','selection','version','encodeStateVector','encodeStateAsUpdate','encodeStickyPosition','resolveStickyPosition','layoutFontRequirementsJson','layoutDocumentWithRegionsRetainedJson']){
    if(typeof sessie[naam]!=='function')continue;
    const teller=lezingen[naam]={aantal:0,totaalMs:0,maxMs:0};
    vervang(sessie,naam,oud=>function(...args){const t=w.performance.now();try{return oud.apply(this,args)}finally{const ms=w.performance.now()-t;teller.aantal++;teller.totaalMs+=ms;teller.maxMs=Math.max(teller.maxMs,ms)}});
  }
  if(w.Worker?.prototype?.postMessage){
    const namen=new Set(['sync','layout','fontRequirements','frame','result','response','request','render','source','query','open','init','close','measure','cancel','success','error']);
    function bericht(v,data,richting){
      const d=data&&typeof data==='object'?data:{},type=[d.type,d.kind,d.method].find(x=>namen.has(x))??'ander';
      meld('worker',{worker:v.id,richting,type,velden:Object.keys(d).sort().slice(0,12)});
    }
    vervang(w.Worker.prototype,'postMessage',oud=>function(data,...args){
      let v=workers.get(this);
      if(!v){v={id:++workerTeller};workers.set(this,v);const fn=e=>bericht(v,e.data,'ontvangst');this.addEventListener('message',fn);herstel.push(()=>this.removeEventListener('message',fn))}
      bericht(v,data,'verzonden');return oud.call(this,data,...args);
    });
  }
  const oudFetch=w.fetch,doel=w.__TAURI_INTERNALS__.convertFileSrc('writer_tekst_voorbereiden','ipc');
  vervang(w,'fetch',()=>async function(url,args,...rest){
    if(String(url)!==doel)return oudFetch.call(this,url,args,...rest);
    const a=JSON.parse(args.body).aanvraag;meld('nativebegin',{tekens:a.text.length,incrementeel:typeof a.basis==='string'});
    const antwoord=await oudFetch.call(this,url,args,...rest);meld('nativeontvangst');
    const json=antwoord.json;antwoord.json=async function(...params){const r=await json.apply(this,params);meld('nativejson',{rustMs:r.preparationMs,retryFull:r.retryFull===true});return r};return antwoord;
  });
  const key=e=>{if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){toetsen++;meld('toets')}};
  w.addEventListener('keydown',key,true);herstel.push(()=>w.removeEventListener('keydown',key,true));
  const af=sessie.onUpdate(()=>meld('bronupdate'));herstel.push(af);
  function tick(t){if(!actief)return;if(frames.length<grens)frames.push({t:t-begin,tussen:t-vorigFrame});else gemist++;vorigFrame=t;frame=w.requestAnimationFrame(tick)}
  frame=w.requestAnimationFrame(tick);
  const m=w.__OPENAEC_WRITER_INVOERMETING__;if(!m||m.lees().monsters.length)throw Error('Schone optionele fasemeting ontbreekt');m.start();
  return {lees(){return{regels:regels.map(r=>({...r})),gemist,toetsen,frames:frames.slice(),lezingen:JSON.parse(JSON.stringify(lezingen))}},stop(){meld('stop');actief=false;if(frame!==null)w.cancelAnimationFrame(frame);for(const fn of herstel.reverse())fn();return{schema:1,grens,gemist,toetsen,regels,frames,lezingen,invoerfasen:m.stop()}}};
}
function zoekEigenInvoerrij(w){
  const gevonden=new Set(),doelen=w.document.querySelectorAll('.paged-editor__yrs-input,[data-testid="yrs-input"]');
  if(!doelen.length)throw Error('Eigen actieve invoer ontbreekt');
  for(const el of doelen)for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
    for(let h=f.memoizedState,n=0;h&&n<1500;n++,h=h.next){const v=h.memoizedState?.current;if(v&&typeof v.admit==='function'&&typeof v.enqueue==='function'&&typeof v.captureInteractionEpoch==='function')gevonden.add(v)}
  if(gevonden.size!==1)throw Error('Geen unieke actieve invoerrij: '+gevonden.size);
  const rij=[...gevonden][0];if(rij.hasPending())throw Error('Invoerrij is nog bezet');return rij;
}
