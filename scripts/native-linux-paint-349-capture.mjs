/** Read-only capture first; user-visible view toggle only after timed captures.
 * Raw canvas export is intentionally last because readback can flush graphics.
 */
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');

// This function executes in the real production WebView. It only reads DOM,
// CSS and public font/resource metadata; no SDK bridge or model operations.
function pageState(){
  const visible=e=>e.getClientRects().length&&!e.closest('[hidden],[inert]');
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const page=[...document.querySelectorAll('.canvas-page')].find(visible);
  const canvases=[...document.querySelectorAll('.canvas-page canvas')].filter(visible).slice(0,8);
  let faces=[];try{faces=[...document.fonts].map(f=>({family:f.family,status:f.status,style:f.style,weight:f.weight}));}catch{}
  return {
    timestamp:performance.now(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,screenX:screenX,screenY:screenY,screenWidth:screen.width,screenHeight:screen.height},
    theme:{html:document.documentElement.getAttribute('data-thema'),office:document.querySelector('.office')?.getAttribute('data-thema'),prefersDark:matchMedia('(prefers-color-scheme: dark)').matches,darkPage:!!document.querySelector('.office-tekst-donker')},
    page:page?{rect:rect(page),filter:getComputedStyle(page).filter,background:getComputedStyle(page).backgroundColor}:null,
    canvases:canvases.map((c,index)=>({index,width:c.width,height:c.height,rect:rect(c),class:c.className,background:getComputedStyle(c).backgroundColor,color:getComputedStyle(c).color})),
    fonts:{status:document.fonts?.status,faces},
    resources:performance.getEntriesByType('resource').filter(r=>/\.(woff2?|ttf|otf)(\?|$)/i.test(r.name)).map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize,responseStatus:r.responseStatus??null})),
    statusText:document.querySelector('.statusbalk')?.innerText??null,
    visibleAlerts:[...document.querySelectorAll('[role=alert],[role=status]')].filter(visible).map(e=>e.innerText).slice(-10),
  };
}

export function createPaintProbe({request,evaluate,screenshot,sessionId,out,env,report,documentPath}){
  report.paint=[];
  const implementationReady=(async()=>{
    report.paintCaptureImplementation={sha256:hash(await readFile(fileURLToPath(import.meta.url))),
      order:'WebDriver and X11 captures before raw canvas export; raw readback may itself flush graphics',
      nativeGraphics:'Baseline GDK x11 / LIBGL software; optional explicit child-only DMABUF A/B',
      visualAcceptance:'Not inferred from native data-roundtrip pass'};
  })();
  async function pair(scene,label,start){
    const item={label,elapsedMs:Date.now()-start};
    item.webdriverAtMs=Date.now()-start;
    await screenshot(`${label}-webdriver.png`);
    item.x11AtMs=Date.now()-start;
    execFileSync('import',['-window','root',join(out,`${label}-x11.png`)],{env,timeout:15000});
    // Bracket X11 with another WebDriver image to expose simple paint-between-
    // captures timing instead of mislabelling it as a capture-method difference.
    item.webdriverAfterX11AtMs=Date.now()-start;
    await screenshot(`${label}-webdriver-after-x11.png`);
    item.state=await evaluate(`return (${pageState.toString()})()`);
    item.stateReadAfterImages=true;
    const windows=execFileSync('xwininfo',['-root','-tree'],{env,timeout:10000});
    await writeFile(join(out,`${label}-windows.txt`),windows);
    item.captures={webdriver:`${label}-webdriver.png`,x11:`${label}-x11.png`,webdriverAfterX11:`${label}-webdriver-after-x11.png`};
    scene.samples.push(item);
    await writeFile(join(out,'paint-progress.json'),JSON.stringify(report.paint,null,2));
    return item;
  }
  async function raw(scene,label){
    const data=await evaluate(`return [...document.querySelectorAll('.canvas-page canvas')].filter(e=>e.getClientRects().length&&!e.closest('[hidden],[inert]')).slice(0,8).map((c,index)=>{try{return {index,width:c.width,height:c.height,data:c.toDataURL('image/png')}}catch(e){return {index,error:String(e)}}})`);
    const entries=[];
    for(const c of data){
      if(c.error){entries.push(c);continue;}
      const bytes=Buffer.from(c.data.split(',')[1],'base64'),file=`${label}-canvas-${c.index}.png`;
      await writeFile(join(out,file),bytes);
      entries.push({index:c.index,width:c.width,height:c.height,file,sha256:hash(bytes)});
    }
    scene.raw.push({label,entries});
  }
  async function clickNamed(role,name){
    const element=await evaluate(`return [...document.querySelectorAll(arguments[0]==='tab'?'[role=tab]':'button')].find(e=>e.getClientRects().length&&!e.closest('[hidden],[inert]')&&((e.getAttribute('aria-label')||e.textContent).trim()===arguments[1]))`,[role,name]);
    const actual=element?.['element-6066-11e4-a52e-4f735466cecf'];
    if(!actual)throw Error(`Native ${role} '${name}' element not found: ${JSON.stringify(element)}`);
    await request('POST',`/session/${sessionId()}/element/${actual}/click`,{});
  }
  return {async inspect(name){
    await implementationReady;
    const start=Date.now(),before=hash(await readFile(documentPath));
    const scene={name,start:new Date(start).toISOString(),samples:[],raw:[],fontWait:null,viewToggle:null};
    report.paint.push(scene);
    const first=await pair(scene,`${name}-immediate`,start);
    if(name==='saved')for(const [command,args,file]of [['xdpyinfo',[],'display.txt'],['fc-list',[],'system-fonts.txt']]){
      try{const b=execFileSync(command,args,{env,timeout:10000,maxBuffer:5*1024*1024});await writeFile(join(out,file),b);}catch(e){report.paintCaptureImplementation[file]=String(e);}
    }
    try{
      scene.fontWait=await request('POST',`/session/${sessionId()}/execute/async`,{script:`const done=arguments[arguments.length-1],start=performance.now();Promise.race([document.fonts.ready.then(()=>({ready:true})),new Promise(r=>setTimeout(()=>r({ready:false,timeout:true}),10000))]).then(v=>requestAnimationFrame(()=>requestAnimationFrame(()=>done({...v,elapsedMs:performance.now()-start,status:document.fonts.status}))))`,args:[]});
    }catch(e){scene.fontWait={error:String(e)};}
    await pair(scene,`${name}-fonts-frames`,start);
    for(const [wait,label]of [[1000,'wait1'],[4000,'wait5'],[10000,'wait15']]){
      await delay(wait);await pair(scene,`${name}-${label}`,start);
    }
    // OffscreenCanvas readback is after both capture routes at every timed point.
    await raw(scene,`${name}-after-waits`);
    await pair(scene,`${name}-after-raw-readback`,start);
    const initialDark=first.state.theme.darkPage;
    try{
      await clickNamed('tab','View');
      await clickNamed('button','Dark page');
      await delay(500);
      const switched=await pair(scene,`${name}-view-toggled`,start);
      assert.notEqual(switched.state.theme.darkPage,initialDark,'Actual user-facing page mode changed');
      await raw(scene,`${name}-view-toggled`);
      await clickNamed('button','Dark page');await delay(500);
      const restored=await pair(scene,`${name}-view-restored`,start);
      assert.equal(restored.state.theme.darkPage,initialDark);
      scene.viewToggle={changedAndRestored:true};
      await clickNamed('tab','Home');
    }catch(e){scene.viewToggle={error:String(e)};}
    const after=hash(await readFile(documentPath));
    scene.fileUnchanged=before===after;
    assert.equal(after,before,'Diagnostic capture/view preferences must not modify saved DOCX');
    await writeFile(join(out,'paint-progress.json'),JSON.stringify(report.paint,null,2));
  }};
}
