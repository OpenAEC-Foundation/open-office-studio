/** De echte GUI-meethulp telt aanvragen en gelezen verhalen afzonderlijk. */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
const code=readFileSync("scripts/gui/spelling_vervolginvoer.js","utf8");
function proef(groepen=true){
 const stories=["body",...Array.from({length:64},(_,i)=>`body:t0:r${i}c0`)];
 const antwoord={ok:true},readParagraphs=vi.fn((..._args: unknown[])=>antwoord),readStories=vi.fn((..._args: unknown[])=>antwoord);
 const sessie={storyIds:()=>stories,readParagraphs,...(groepen?{readStories}:{})};
 const timers: (()=>void)[]=[],listeners=new Map<string,(e:unknown)=>void>(),herbegin=vi.fn();
 const ctx:any={api:()=>({getEditorRef:()=>({getYrsSession:()=>sessie})}),_plakToetsen:["oud"],_spellingProef:()=>({herbegin}),setTimeout:(f:()=>void)=>timers.push(f),addEventListener:(n:string,f:(e:unknown)=>void)=>listeners.set(n,f),removeEventListener:(n:string,f:(e:unknown)=>void)=>{if(listeners.get(n)===f)listeners.delete(n)}};
 ctx.window=ctx;runInNewContext(code,ctx);return{ctx,sessie,antwoord,readParagraphs,readStories,timers,listeners,herbegin,stories};
}
it("telt de daadwerkelijke verhalen in een groep vóór de eerste toets en behoudt de aanroep",()=>{
 const p=proef(),s=p.sessie as typeof p.sessie&{readStories:typeof p.readStories};
 expect(s.readStories({stories:p.stories.slice(0,32)})).toBe(p.antwoord);
 expect(s.readParagraphs()).toBe(p.antwoord);p.listeners.get("keydown")!({key:"a"});
 expect(p.ctx._vervolgProef).toMatchObject({lezingen:33,aanvragen:2,groepsaanvragen:1,eersteToetsNaLezingen:33,verhalen:65});
 s.readStories({stories:p.stories.slice(32,64)});p.listeners.get("keydown")!({key:"b"});
 expect(p.ctx._vervolgProef.eersteToetsNaLezingen).toBe(33);
 p.ctx._vervolgOpruimen();expect(s.readParagraphs).toBe(p.readParagraphs);expect(s.readStories).toBe(p.readStories);expect(p.listeners.size).toBe(0);
});
it("blijft bruikbaar voor de oorspronkelijke route zonder groepsmethode",()=>{
 const p=proef(false);p.sessie.readParagraphs();p.listeners.get("keydown")!({key:"a",ctrlKey:true});
 expect(p.ctx._vervolgProef.eersteToetsNaLezingen).toBeNull();p.listeners.get("keydown")!({key:"b"});
 expect(p.ctx._vervolgProef.eersteToetsNaLezingen).toBe(1);p.ctx._vervolgOpruimen();
 expect(Object.hasOwn(p.sessie,"readStories")).toBe(false);expect(p.sessie.readParagraphs).toBe(p.readParagraphs);
});
it("start werkelijk een nieuwe hercontrole en verwijdert oude toetsregistratie",()=>{
 const p=proef();expect(p.ctx._plakToetsen).toHaveLength(0);expect(p.herbegin).not.toHaveBeenCalled();
 p.timers[0]();expect(p.herbegin).toHaveBeenCalledOnce();expect(p.ctx._vervolgProef.hercontroleGestart).toBe(true);p.ctx._vervolgOpruimen();
});
