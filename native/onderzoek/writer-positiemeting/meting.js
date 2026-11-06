/* Alleen metadata van de eigen test-WebView; geen wijzigingen aan bron of mutatieroute. */
function plaatsPositiemeting(w,rij,sessie,projectiePrototype) {
  const herstel=[],regels=[],groepen=new Map(),grens=4096,begin=w.performance.now();
  let actief=true,taak=0,volgende=0,fase='buiten',gemist=0,updates=0;
  const tijd=()=>w.performance.now()-begin;
  function meld(soort,extra={}){if(!actief)return;if(regels.length<grens)regels.push({soort,taak,fase,t:tijd(),...extra});else gemist++}
  function vervang(o,k,maak){const eigen=Object.getOwnPropertyDescriptor(o,k),oud=o[k];if(typeof oud!=='function')throw Error('Meetmethode ontbreekt: '+k);const nieuw=maak(oud);o[k]=nieuw;if(o[k]!==nieuw)throw Error('Meetmethode niet schrijfbaar: '+k);herstel.push(()=>{if(eigen)Object.defineProperty(o,k,eigen);else delete o[k]})}
  function tel(naam,story,ms,lengte){
    if(!actief)return;
    const sleutel=taak+'\0'+fase+'\0'+naam;let g=groepen.get(sleutel);
    if(!g){if(groepen.size>=grens){gemist++;return}g={taak,fase,naam,aantal:0,totaalMs:0,maxMs:0,elementen:0,verhalen:new Set,meerVerhalen:0};groepen.set(sleutel,g)}
    g.aantal++;g.totaalMs+=ms;g.maxMs=Math.max(g.maxMs,ms);g.elementen+=lengte;
    if(typeof story==='string'){if(g.verhalen.size<2048)g.verhalen.add(story);else if(!g.verhalen.has(story))g.meerVerhalen++}
  }
  function lees(){return{schema:1,grens,gemist,updates,regels:regels.map(x=>({...x})),groepen:[...groepen.values()].map(g=>({...g,verhalen:[...g.verhalen].sort()}))}}
  try {
    vervang(rij,'admit',oud=>function(fn,...rest){
      const id=++volgende;meld('toelaten',{id});
      return oud.call(this,function(...args){
        taak=id;fase='taakbegin';meld('taakbegin');let antwoord;
        const klaar=goed=>{meld('taakeinde',{goed});taak=0;fase='buiten'};
        try{antwoord=fn.apply(this,args)}catch(e){klaar(false);throw e}
        if(antwoord&&typeof antwoord.then==='function')antwoord.then(()=>klaar(true),()=>klaar(false));else klaar(true);
        return antwoord;
      },...rest);
    });
    for(const [naam,binnen,na] of [['applyLocalUpdate','mutatie','na_mutatie'],['setSelection','selectie','na_selectie']])
      vervang(sessie,naam,oud=>function(...args){const vorig=fase;fase=binnen;meld('methodebegin',{naam});try{return oud.apply(this,args)}finally{meld('methodeeinde',{naam});fase=taak?na:vorig}});
    for(const naam of ['paragraphSpans','storySegments','storySegmentUnits','storySegmentUnitDigests','storiesChangedSince']) {
      if(typeof sessie[naam]!=='function')continue;
      vervang(sessie,naam,oud=>function(...args){const t=w.performance.now();let antwoord;try{return antwoord=oud.apply(this,args)}finally{tel(naam,naam==='storiesChangedSince'?undefined:args[0],w.performance.now()-t,Array.isArray(antwoord)?antwoord.length:0)}});
    }
    if(projectiePrototype){
      let diepte=0,bezoeken=0;
      vervang(projectiePrototype,'buildStory',oud=>function(...args){
        const buiten=diepte===0,t=w.performance.now();if(buiten)bezoeken=0;diepte++;bezoeken++;
        try{return oud.apply(this,args)}finally{
          diepte--;
          if(buiten){const ms=w.performance.now()-t;tel('positieprojectie',args[0],ms,bezoeken);meld('projectie',{bezoeken,verhalen:typeof this.stories?.size==='number'?this.stories.size:null})}
        }
      });
    }
    const af=sessie.onUpdate((_bytes,oorsprong)=>{updates++;meld('bronupdate',{oorsprong:typeof oorsprong==='string'&&['local','remote','host'].includes(oorsprong)?oorsprong:'anders'})});herstel.push(af);
    const doel=w.__TAURI_INTERNALS__.convertFileSrc('writer_tekst_voorbereiden','ipc');
    vervang(w,'fetch',oud=>async function(url,args,...rest){
      if(String(url)!==doel)return oud.call(this,url,args,...rest);
      const a=JSON.parse(args.body).aanvraag;fase='wacht_native';meld('nativebegin',{tekens:a.text.length,story:a.position?.story??null});
      const antwoord=await oud.call(this,url,args,...rest);fase='native_antwoord';meld('nativeontvangst');
      const json=antwoord.json;antwoord.json=async function(...p){const a=await json.apply(this,p);meld('nativejson',{retryFull:a.retryFull===true});return a};return antwoord;
    });
  }catch(e){actief=false;for(const fn of herstel.reverse())fn();throw e}
  return{lees,stop(){if(actief){meld('stop');actief=false;for(const fn of herstel.reverse())fn()}return lees()}};
}

function zoekEigenProjectiePrototype(w,sessie){
  const gevonden=new Set();
  for(const el of w.document.querySelectorAll('.office-tabpaneel:not([hidden]) .paged-editor'))
    for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)
      for(let h=f.memoizedState,n=0;h&&n<1500;n++,h=h.next){
        const v=h.memoizedState?.current,p=v?.projection;
        if(v?.session!==sessie||!p||typeof p.buildStory!=='function'||typeof p.stories?.size!=='number')continue;
        const prototype=Object.getPrototypeOf(p);if(prototype&&Object.hasOwn(prototype,'buildStory'))gevonden.add(prototype);
      }
  if(gevonden.size!==1)throw Error('Geen unieke eigen positieprojectie: '+gevonden.size);
  return [...gevonden][0];
}
