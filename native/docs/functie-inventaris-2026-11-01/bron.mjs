/** Lees letterlijke aansluitingen uit de vaste referentie; voer geen toepassingscode uit. */
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const ref='0fc4d2bbf94bb6025d8d8517d53631d5f830cd1e';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024});
const bestanden=git('ls-tree','-r','--name-only',ref,'--','src').trim().split('\n').filter(n=>/\.tsx?$/.test(n)&&!/(?:\.test\.|\.spec\.)/.test(n));
const onderdelen={'@betteroffice/docx-react':'writer','@betteroffice/xlsx-react':'spreadsheet','@betteroffice/pptx-react':'presentation'};
const wrappers={W:'writer',WK:'writer',WS:'writer',C:'spreadsheet',CK:'spreadsheet',CL:'spreadsheet',P:'presentation',PK:'presentation',PL:'presentation'};
const aansluitingen=[],dynamisch=[],bronnen={};
for(const bestand of bestanden){
 const tekst=git('show',`${ref}:${bestand}`);bronnen[bestand]=createHash('sha256').update(tekst).digest('hex');
 const boom=ts.createSourceFile(bestand,tekst,ts.ScriptTarget.Latest,true,bestand.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const haken=new Map(),knoppen=new Map();
 for(const n of boom.statements){
  if(!ts.isImportDeclaration(n)||!ts.isStringLiteral(n.moduleSpecifier))continue;
  const pakket=n.moduleSpecifier.text, module=onderdelen[pakket];
  const namen=n.importClause?.namedBindings;
  if(!namen||!ts.isNamedImports(namen))continue;
  for(const a of namen.elements){
   const naam=(a.propertyName??a.name).text,lokaal=a.name.text;
   if(module&&/^use(?:Docx|Xlsx|Pptx)Command$/.test(naam))haken.set(lokaal,module);
   if(module&&naam==='ToolbarCommand')knoppen.set(lokaal,module);
   if((/\/gedeeld$/.test(pakket)||pakket==='./gedeeld'||/tekst-opdrachten$/.test(pakket))&&wrappers[naam])knoppen.set(lokaal,wrappers[naam]);
  }
 }
 if(bestand==='src/lint/presentatie.tsx')knoppen.set('PT','presentation');
 function voeg(n,module,soort,id,args){
  if(!id)return;
  const plek=boom.getLineAndCharacterOfPosition(n.getStart(boom));
  const bron={bestand,regel:plek.line+1,module,soort};
  if(ts.isStringLiteralLike(id))aansluitingen.push({...bron,id:id.text,argumenten_bron:args?.getText(boom)??null});
  else dynamisch.push({...bron,uitdrukking:id.getText(boom),argumenten_bron:args?.getText(boom)??null});
 }
 function bezoek(n){
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&haken.has(n.expression.text))voeg(n,haken.get(n.expression.text),'opdrachthaak',n.arguments[0],n.arguments[1]);
  if((ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n))&&ts.isIdentifier(n.tagName)&&knoppen.has(n.tagName.text)){
   let id,args;
   for(const a of n.attributes.properties){
    if(!ts.isJsxAttribute(a))continue;
    const waarde=a.initializer&&ts.isJsxExpression(a.initializer)?a.initializer.expression:a.initializer;
    if(a.name.getText(boom)==='id')id=waarde;
    if(a.name.getText(boom)==='args')args=waarde;
   }
   voeg(n,knoppen.get(n.tagName.text),'lintcomponent',id,args);
  }
  ts.forEachChild(n,bezoek);
 }
 bezoek(boom);
}
const modules=Object.fromEntries(Object.values(onderdelen).map(m=>[m,{letterlijke_aansluitingen:aansluitingen.filter(a=>a.module===m).length,unieke_ids:[...new Set(aansluitingen.filter(a=>a.module===m).map(a=>a.id))].sort(),dynamische_aansluitingen:dynamisch.filter(a=>a.module===m).length}]));
const rapport={referentie_commit:ref,omvang:'Statische TypeScript-boom van letterlijke opdrachthaken en bekende lintcomponenten in de vaste referentie. Argumenten blijven bronnotatie; dynamische koppelingen worden apart geregistreerd. Geen uitvoering, volledige functie-inventaris, native koppeling of testdekking. Menu’s, eigen acties, dynamische lijsten en andere modules vragen aanvullende inventarisatie.',modules,aansluitingen,dynamisch,bronbestanden:bronnen};
const map='.local/controle-2026-10-31/functie-inventaris';mkdirSync(map,{recursive:true});writeFileSync(`${map}/letterlijke-opdrachten.json`,JSON.stringify(rapport,null,2)+'\n');
const kort=Object.fromEntries(Object.entries(modules).map(([m,v])=>[m,{aansluitingen:v.letterlijke_aansluitingen,ids:v.unieke_ids.length,dynamisch:v.dynamische_aansluitingen}]));
process.stdout.write(JSON.stringify(kort)+'\n');
