/** Vergelijk alle gegevens exact, met uitsluitend een bijectie voor nieuw gemaakte revisies. */
import assert from 'node:assert/strict';
const velden=new Set(['ins','del','pPrIns','pPrDel','pPrChange','trIns','trDel','tableIns','tableDel']);
export function vergelijkRevisies(referentie,native,bestaandeIds,clientId){
 const heen=new Map(),terug=new Map(),kopie=structuredClone(native);
 function loop(a,b,veld=''){
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return;
  if(velden.has(veld)&&typeof a.id==='string'&&typeof b.id==='string'){
   if(a.id!==b.id){
    assert.ok(!bestaandeIds.has(a.id)&&!bestaandeIds.has(b.id),'Bestaande revisie-identiteit veranderd');
    assert.ok(b.id.startsWith(`openaec-revision-v1:${clientId}:`),'Onbekende native revisienaamruimte');
    const teller=b.id.slice(`openaec-revision-v1:${clientId}:`.length);
    assert.match(teller,/^(0|[1-9][0-9]*)$/u,'Ongeldige revisieteller');
    assert.ok(BigInt(teller)<=18446744073709551615n,'Uitgeputte revisieteller');
   }
   assert.ok(!heen.has(a.id)||heen.get(a.id)===b.id,'Een referentierevisie is gesplitst');
   assert.ok(!terug.has(b.id)||terug.get(b.id)===a.id,'Verschillende revisies zijn samengevoegd');
   heen.set(a.id,b.id);terug.set(b.id,a.id);b.id=a.id;
  }
  if(Array.isArray(a)&&Array.isArray(b)){for(let i=0;i<Math.min(a.length,b.length);i++)loop(a[i],b[i]);}
  else for(const k of Object.keys(a))if(k in b)loop(a[k],b[k],k);
 }
 loop(referentie,kopie);
 assert.deepEqual(kopie,referentie,'Alle overige inhoud, opmaak en identiteiten blijven exact');
 return [...heen].map(([referentie,native])=>({referentie,native}));
}
