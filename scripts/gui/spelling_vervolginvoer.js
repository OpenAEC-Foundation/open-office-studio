(() => {
  const s=api().getEditorRef().getYrsSession(),herstel=[];
  window._plakToetsen.length=0;
  window._vervolgProef={lezingen:0,aanvragen:0,groepsaanvragen:0,eersteToetsNaLezingen:null,hercontroleGestart:false,verhalen:s.storyIds().filter(id=>id==='body'||/^body:t[0-9]+:r[0-9]+c[0-9]+/.test(id)).length};
  // Vergelijk verhalen met verhalen: een groepsaanvraag leest meer dan één cel.
  for(const naam of ['readParagraphs','readStories']){
    if(typeof s[naam]!=='function')continue;
    const d=Object.getOwnPropertyDescriptor(s,naam),oud=s[naam];
    Object.defineProperty(s,naam,{...d,configurable:true,value:function(...args){
      _vervolgProef.aanvragen++;
      if(naam==='readStories'){
        _vervolgProef.groepsaanvragen++;
        _vervolgProef.lezingen+=Array.isArray(args[0]?.stories)?args[0].stories.length:_vervolgProef.verhalen;
      }else _vervolgProef.lezingen++;
      return Reflect.apply(oud,this,args);
    }});
    herstel.push(()=>{if(d)Object.defineProperty(s,naam,d);else delete s[naam]});
  }
  window._vervolgToets=e=>{if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&_vervolgProef.eersteToetsNaLezingen===null)_vervolgProef.eersteToetsNaLezingen=_vervolgProef.lezingen};
  window.addEventListener('keydown',_vervolgToets,true);
  window._vervolgOpruimen=()=>{herstel.forEach(f=>f());window.removeEventListener('keydown',_vervolgToets,true)};
  setTimeout(()=>{_vervolgProef.hercontroleGestart=true;_spellingProef().herbegin()},0);
  return true;
})()
