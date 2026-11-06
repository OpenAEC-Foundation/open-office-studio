/* Alleen de guarded host-preflight; toegelaten workerberichten blijven ongewijzigd. */
function openaecLaatsteHostFont(ref,bron,actueel,lees) {
  if(!actueel())return Promise.resolve(null);
  let slot=ref.openaecHostFont;
  if(!slot||slot.bron!==bron){
    if(slot?.wacht){slot.wacht.klaar(null);slot.wacht=null}
    slot={bron,bezig:false,wacht:null};ref.openaecHostFont=slot;
  }
  function volgende(goed,fout){
    slot.bezig=false;
    if(ref.openaecHostFont!==slot)return;
    const wacht=slot.wacht;slot.wacht=null;
    if(!wacht){delete ref.openaecHostFont;return}
    let geldig;try{geldig=wacht.actueel()}catch(f){wacht.fout(f);delete ref.openaecHostFont;return}
    if(!geldig){wacht.klaar(null);delete ref.openaecHostFont;return}
    if(!goed){wacht.fout(fout);delete ref.openaecHostFont;return}
    try{const p=start(wacht.lees);Promise.resolve(p).then(wacht.klaar,wacht.fout)}catch(f){wacht.fout(f)}
  }
  function start(doe){
    slot.bezig=true;
    let p;
    try{p=doe()}catch(f){volgende(false,f);throw f}
    if(!p||typeof p.then!=='function'){volgende(true);return p}
    p.then(()=>volgende(true),f=>volgende(false,f));return p;
  }
  if(!slot.bezig)return start(lees);
  // Alleen nog niet verzonden, inmiddels achterhaalde passes verdwijnen.
  // Hun bestaande layoutcallback verwerpt het antwoord via pass-/bronbewaking.
  slot.wacht?.klaar(null);
  return new Promise((klaar,fout)=>{slot.wacht={actueel,lees,klaar,fout}});
}
