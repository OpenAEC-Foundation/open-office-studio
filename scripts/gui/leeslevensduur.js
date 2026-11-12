(() => {
 const sessie=api().getEditorRef().getYrsSession();
 const oud=[],regels=[],stacks={};let schrijfDiepte=0,leesDiepte=0,vernietigingGestart=false,vernietigd=false,over=0;
 function noteer(naam,fout){
  if(regels.length>=8192){over++;return;}
  const sleutel=[naam,schrijfDiepte,leesDiepte,!!sessie.oosBewaarUpdate,vernietigingGestart,vernietigd,!!fout].join('|');
  if(!(sleutel in stacks)&&Object.keys(stacks).length<64)stacks[sleutel]=String(new Error().stack??'').slice(0,3000);
  regels.push({naam,ms:performance.now(),schrijfDiepte,leesDiepte,bewaarAdoptie:!!sessie.oosBewaarUpdate,vernietigingGestart,vernietigd,fout:fout?String(fout):null,stack:sleutel});
 }
 function volg(naam,soort){
  const fn=sessie[naam],descriptor=Object.getOwnPropertyDescriptor(sessie,naam);
  if(typeof fn!=='function'||descriptor&&!descriptor.configurable)throw Error('Niet veilig te volgen: '+naam);
  const wrapper=function(...args){
   let fout=null;if(soort==='schrijf')schrijfDiepte++;if(soort==='lees')leesDiepte++;if(soort==='vernietig')vernietigingGestart=true;
   try{noteer(naam+':begin',null);const uit=Reflect.apply(fn,this,args);if(soort==='vernietig')vernietigd=true;return uit;}
   catch(e){fout=e;throw e;}
   finally{noteer(naam+':eind',fout);if(soort==='schrijf')schrijfDiepte--;if(soort==='lees')leesDiepte--;}
  };
  Object.defineProperty(sessie,naam,{value:wrapper,configurable:true,writable:true,enumerable:descriptor?.enumerable??false});
  oud.push({naam,descriptor,fn,wrapper});
 }
 for(const naam of ['applyUpdate','applyLocalUpdate','applyRawOps'])if(typeof sessie[naam]==='function')volg(naam,'schrijf');
 for(const naam of ['readStories','readParagraphs'])volg(naam,'lees');
 if(typeof sessie.destroy==='function')volg('destroy','vernietig');
 window._leesProbe={lees:()=>({regels,stacks,over,vernietigd}),stop:()=>{
  const vervangen=[];
  for(const o of oud){if(sessie[o.naam]!==o.wrapper){vervangen.push(o.naam);continue;}if(o.descriptor)Object.defineProperty(sessie,o.naam,o.descriptor);else delete sessie[o.naam];}
  return {regels,stacks,over,vernietigd,vervangen,hersteld:!vervangen.length&&oud.every(o=>sessie[o.naam]===o.fn)};
 }};
 return {methodes:oud.map(o=>o.naam)};
})()
