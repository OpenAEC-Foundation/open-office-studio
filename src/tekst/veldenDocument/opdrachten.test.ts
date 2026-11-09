import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { parseDocx } from "@betteroffice/docx/docx";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { registreerVeldBijwerker, registreerVeldNaam, veldOmgeving, werkDocumentVeldenBij } from "./opdrachten";
import { veldPayload } from "./model";

it("converges registered field owners with page-count changes and stable session metadata", async () => {
  const bytes=readFileSync("public/templates/nieuw.docx"), doc=await parseDocx(bytes,{preloadFonts:false}), s=await createYrsSession();
  let pages=1, calls=0, rendered="";
  try {
    s.openDocx(bytes,true);
    const ed={getYrsSession:()=>s,getLayout:()=>({pages:Array.from({length:pages},(_,i)=>({number:i+1,fragments:[]}))}),syncYrsInputState:()=>{const f=s.storySegments("body").find(x=>x.kind==="embed"&&x.embedKind==="field");rendered=f?.kind==="embed"?String(f.payload.displayText):"";},yrsLocToDisplayPosition:()=>0};
    const make=()=>({getEditorRef:()=>ed,getDocument:()=>doc,getTotalPages:()=>pages,flushPendingInput:async()=>{},whenLayoutComplete:async()=>{}} as unknown as DocxEditorRef);
    const old=make(); registreerVeldNaam(old,"Preserved.docx"); const ref=make();
    expect(veldOmgeving(ref).bestandsnaam).toBe("Preserved.docx");
    s.applyRawOps("body",[{op:"insertEmbed",index:0,kind:"field",payload:veldPayload("NUMPAGES",{...veldOmgeving(ref),paginas:0},"body",0)}]);
    const stop=registreerVeldBijwerker(async()=>{calls++;if(calls===1){expect(rendered).toBe("1");pages=2;return{gewijzigd:1,onopgelost:[]};}expect(rendered).toBe("2");return{gewijzigd:0,onopgelost:[]};});
    try { await werkDocumentVeldenBij(ref); } finally {stop();}
    expect(calls).toBeGreaterThanOrEqual(2);
    const field=s.storySegments("body").find(x=>x.kind==="embed"&&x.embedKind==="field");
    expect(field?.kind==="embed"&&field.payload.displayText).toBe("2");
  }finally{s.destroy();}
});


it("shares a pending field update across replacement refs for the same native session", async () => {
  const bytes = readFileSync("public/templates/nieuw.docx");
  const doc = await parseDocx(bytes, { preloadFonts: false }), s = await createYrsSession();
  let release!: () => void, calls = 0;
  const pending = new Promise<void>(r => { release = r; });
  const ed = { getYrsSession: () => s, getLayout: () => ({ pages: [] }) };
  const make = () => ({ getEditorRef: () => ed, getDocument: () => doc, getTotalPages: () => 1,
    flushPendingInput: () => pending, whenLayoutComplete: async () => {} } as unknown as DocxEditorRef);
  const stop = registreerVeldBijwerker(async () => { calls++; return { gewijzigd: 0, onopgelost: [] }; });
  try {
    s.openDocx(bytes, true);
    const button = werkDocumentVeldenBij(make()), save = werkDocumentVeldenBij(make());
    expect(save).toBe(button);
    release(); await save;
    expect(calls).toBe(1);
    await werkDocumentVeldenBij(make());
    expect(calls).toBe(2);
  } finally { release(); stop(); s.destroy(); }
});
