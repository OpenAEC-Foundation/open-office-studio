import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createYrsPositionProjection, createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { herstelTabelContext } from "../../../scripts/tekstengine-compatibiliteit";
import { Pakket } from "../../grafieken/pakket";
import { rijMet, type TabelPayload } from "./logica";
import { actueleCel, herstelCelNaGeschiedenis } from "./navigatie";
import { splitsTabelSessie } from "./splitsen";

const inhoud = (s: YrsSession, n: number) => s.tablePayload("body", n) as unknown as TabelPayload;
const loc = {story:"body",tableIndex:0};
async function maak() {
  const s = await createYrsSession();
  s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
  s.beginUndoCapture(); s.setUndoCaptureMode("manual");
  const p = s.paragraphs("body")[0];
  s.insertTable({story:"body",paraId:p.paraId,offset:0},3,2);
  const payload = inhoud(s,0);
  for (const [i,r] of payload.rows.entries()) for (const [j,c] of r.cells.entries()) {
    const paraId=s.paragraphs(c.story)[0].paraId;
    s.insertText({story:c.story,paraId,offset:0},`Rij ${i+1}, cel ${j+1}`);
    s.applyRawOps(c.story,[{op:"format",index:0,len:3,attrs:{bold:true}}]);
  }
  s.setColumnWidth({...loc,row:0,column:0},3000);
  s.setColumnWidth({...loc,row:0,column:1},4000);
  const rijen=inhoud(s,0).rows.map(r=>({...r,trPr:rijMet(r.trPr,{hoogte:600,regel:"atLeast",kopregel:true})}));
  s.applyRawOps("body",[{op:"setEmbedAttr",index:0,key:"rows",value:rijen}]);
  s.addUndoBoundary();
  return s;
}

describe("tabel splitsen binnen de geschiedenis (#139)",()=>{
  it("bewaakt de native tabelcontext na verplaatsen en terugdraaien", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/chunk-LZ2DPBZ6.mjs", "utf8");
    const na = herstelTabelContext(bron);
    expect(na).toContain("let n=oosActueleCel(e,t.head.story)");
    expect(na).toContain("o.anchor.tableIndex===n.tableIndex");
    expect(na).toContain("i&&oosHerstelCel(e,o?.head.story)");
    expect(() => herstelTabelContext("andere engine")).toThrow("tabelcontext");
    expect(() => herstelTabelContext(bron + bron)).toThrow("tabelcontext");
  });
  it("bewaart de celverhalen, opmaak, eerdere geschiedenis en één undo/redo-stap",async()=>{
    const s=await maak();
    try {
      const voor=inhoud(s,0), verhalen=s.storyIds(), segmenten=voor.rows.flatMap(r=>r.cells.map(c=>s.storySegments(c.story)));
      expect(splitsTabelSessie(s,loc,1)).toEqual({...loc,tableIndex:1}); s.addUndoBoundary();
      expect(s.storyIds()).toEqual(verhalen);
      expect(inhoud(s,0).rows).toEqual(voor.rows.slice(0,1));
      const tweede=inhoud(s,1);
      expect(tweede.grid).toEqual(voor.grid); expect(tweede.tblPr).toEqual(voor.tblPr);
      expect(tweede.rows.map(r=>r.trPr?.isHeader)).toEqual([false,false]);
      expect(tweede.rows.flatMap(r=>r.cells.map(c=>s.storySegments(c.story)))).toEqual(segmenten.slice(2));
      const cel=tweede.rows[0].cells[0], paraId=s.paragraphs(cel.story)[0].paraId;
      expect(actueleCel(s,cel.story)).toEqual({...loc,tableIndex:1,row:0,column:0});
      const projectie=createYrsPositionProjection(s,"body")!;
      expect(projectie.targetAt(projectie.positionForLoc({story:cel.story,paraId,offset:0})!).cell).toMatchObject({tableIndex:1,row:0,column:0});
      expect(s.undo()).toBe(true); expect(inhoud(s,0)).toEqual(voor);
      expect(s.redo()).toBe(true); expect(inhoud(s,1)).toEqual(tweede);
      expect(s.undo()).toBe(true); expect(s.undo()).toBe(true);
      expect(s.storySegments("body").some(d=>d.kind==="embed"&&d.embedKind==="table")).toBe(false);
    } finally {s.destroy();}
  });
  it("kan terugdraaien via de native editoropdracht", async () => {
    const s = await maak();
    try {
      splitsTabelSessie(s, loc, 1); s.addUndoBoundary();
      const module = await import(/* @vite-ignore */ pathToFileURL(resolve("node_modules/@betteroffice/docx-react/dist/chunk-LZ2DPBZ6.mjs")).href);
      const bron = herstelTabelContext(readFileSync("node_modules/@betteroffice/docx-react/dist/chunk-LZ2DPBZ6.mjs", "utf8"));
      const begin = bron.indexOf("function j5(e,t)");
      const einde = bron.indexOf("function gr(e)", begin);
      // De echte gepatchte opdracht, met haar eigen native hulpfuncties.
      const geschiedenis = new Function("oosActueleCel", "oosHerstelCel", "Mw", "Np", `return (${bron.slice(begin, einde)});`)(actueleCel, herstelCelNaGeschiedenis, module.Ea, module.xa);
      expect(geschiedenis(s, false).changed).toBe(true);
      expect(() => s.cellSelection()).not.toThrow();
      expect(inhoud(s, 0).rows).toHaveLength(3);
      expect(geschiedenis(s, true).changed).toBe(true);
      expect(() => s.cellSelection()).not.toThrow();
      expect(inhoud(s, 1).rows).toHaveLength(2);
    } finally { s.destroy(); }
  });
  it("bewaart de rijvolgorde en tekstopmaak in het opgeslagen en heropende pakket",async()=>{
    const s=await maak(); const heropend=await createYrsSession();
    try {
      // Eerst bewaren/openen: ook bestaande bronidentiteiten moeten werken.
      heropend.openDocx((await saveYrsDocx(s)).bytes,true);
      heropend.beginUndoCapture(); heropend.setUndoCaptureMode("manual");
      splitsTabelSessie(heropend,loc,2); heropend.addUndoBoundary();
      const bytes=(await saveYrsDocx(heropend)).bytes;
      const xml=new Pakket(bytes).lees("word/document.xml");
      expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
      expect(xml.match(/<w:tr>/g)).toHaveLength(3);
      expect(xml.replace(/<[^>]+>/g," ").replace(/\s+/g," ")).toContain("Rij 1, cel 1");
      const terug=await createYrsSession();
      try {
        terug.openDocx(bytes,true);
        expect(inhoud(terug,0).rows).toHaveLength(2); expect(inhoud(terug,1).rows).toHaveLength(1);
        expect(inhoud(terug,1).grid).toEqual([3000,4000]);
        const c=inhoud(terug,1).rows[0].cells[0];
        expect(terug.paragraphs(c.story)[0].text).toBe("Rij 3, cel 1");
        expect(terug.storySegments(c.story).some(d=>d.kind==="text"&&d.attributes.bold===true)).toBe(true);
      } finally {terug.destroy();}
      expect(heropend.undo()).toBe(true); expect(inhoud(heropend,0).rows).toHaveLength(3);
    } finally {s.destroy();heropend.destroy();}
  });
  it("weigert de eerste rij en een verticale samenvoeging over de splitsgrens zonder wijziging",async()=>{
    const s=await maak();
    try {
      const voor=s.storySegments("body");
      expect(()=>splitsTabelSessie(s,loc,0)).toThrow(); expect(s.storySegments("body")).toEqual(voor);
      s.mergeCells({anchor:{...loc,row:0,column:0},head:{...loc,row:1,column:0}});
      const samen=s.storySegments("body");
      expect(()=>splitsTabelSessie(s,loc,1)).toThrow(); expect(s.storySegments("body")).toEqual(samen);
    } finally {s.destroy();}
  });
});
