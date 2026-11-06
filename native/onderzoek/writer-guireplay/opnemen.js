/* Uitsluitend de eigen proefbron opnemen, nooit installeren in een gebruikerssessie. */
function plaatsOpname(w) {
  const oud=w.fetch, doel=w.__TAURI_INTERNALS__.convertFileSrc('writer_tekst_voorbereiden','ipc');
  const ronden=[];let actief=true,bezig=0,omvang=0,fout=null;
  async function nieuw(url,args,...rest){
    if(!actief||String(url)!==doel)return oud.call(this,url,args,...rest);
    const a=JSON.parse(args.body).aanvraag;
    if(bezig||ronden.length>=256||omvang+args.body.length>16*1024*1024){fout='Geen sequentiële begrensde opname';throw Error(fout)}
    bezig++;omvang+=args.body.length;
    let response;
    try{response=await oud.call(this,url,args,...rest)}catch(e){bezig--;fout='Transportfout tijdens opname';throw e}
    const json=response.json;
    response.json=async function(...params){
      try{
        const b=await json.apply(this,params),n=JSON.stringify(b).length;
        if(omvang+n>16*1024*1024){fout='Antwoord overschrijdt opnamegrens';throw Error(fout)}
        omvang+=n;ronden.push({aanvraag:a,antwoord:b});return b;
      }catch(e){fout??='Antwoordfout tijdens opname';throw e}finally{bezig--}
    };
    return response;
  }
  w.fetch=nieuw;
  return{stop(){actief=false;if(w.fetch===nieuw)w.fetch=oud;if(fout||bezig)throw Error(fout??'Opname nog onderweg');return{schema:1,omvang,ronden}}};
}
