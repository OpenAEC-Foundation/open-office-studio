import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { parseDocx } from "@betteroffice/docx/docx";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { registreerVeldBijwerker, registreerVeldNaam, veldOmgeving, werkDocumentVeldenBij } from "./opdrachten";
import { veldPayload } from "./model";

it("converges registered field owners with page-count changes and stable session metadata", async () => {
  const bytes=readFileSync("public/templates/nieuw.docx"), doc=await parseDocx(bytes,{preloadFonts:false}), s=await createYrsSession();
  let pages=1, calls=0;
  try {
    s.openDocx(bytes,true);
    const ed={getYrsSession:()=>s,getLayout:()=>({pages:Array.from({length:pages},(_,i)=>({number:i+1,fragments:[]}))}),syncYrsInputState:()=>{},yrsLocToDisplayPosition:()=>0};
    const make=()=>({getEditorRef:()=>ed,getDocument:()=>doc,getTotalPages:()=>pages,flushPendingInput:async()=>{},whenLayoutComplete:async()=>{}} as unknown as DocxEditorRef);
    const old=make(); registreerVeldNaam(old,"Preserved.docx"); const ref=make();
    expect(veldOmgeving(ref).bestandsnaam).toBe("Preserved.docx");
    s.applyRawOps("body",[{op:"insertEmbed",index:0,kind:"field",payload:veldPayload("NUMPAGES",veldOmgeving(ref),"body",0)}]);
    const stop=registreerVeldBijwerker(async()=>{calls++;if(calls===1){pages=2;return{gewijzigd:1,onopgelost:[]};}return{gewijzigd:0,onopgelost:[]};});
    try { await werkDocumentVeldenBij(ref); } finally {stop();}
    expect(calls).toBeGreaterThanOrEqual(2);
    const field=s.storySegments("body").find(x=>x.kind==="embed"&&x.embedKind==="field");
    expect(field?.kind==="embed"&&field.payload.displayText).toBe("2");
  }finally{s.destroy();}
});
