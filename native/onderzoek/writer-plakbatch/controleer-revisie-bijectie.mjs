import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vergelijkRevisies} from './revisie-identiteiten.mjs';
const id=n=>`openaec-revision-v1:21:${n}`;
const tag=(id,auteur='A')=>({ins:{id,author:auteur,date:'2026-11-04'}});
const bron=[{paraId:'p1',attributes:tag('21:0')},{paraId:'p2',attributes:tag('21:1','B')}];
const native=()=>[{paraId:'p1',attributes:tag(id(0))},{paraId:'p2',attributes:tag(id(1),'B')}];
test('twee nieuwe revisies behouden een afzonderlijke identiteit',()=>assert.equal(vergelijkRevisies(bron,native(),new Set(),21).length,2));
test('samengevoegde revisies worden geweigerd',()=>{const b=native();b[1].attributes.ins.id=id(0);assert.throws(()=>vergelijkRevisies(bron,b,new Set(),21),/samengevoegd/)});
test('een gesplitste revisie wordt geweigerd',()=>{const a=structuredClone(bron);a[1].attributes.ins.id='21:0';assert.throws(()=>vergelijkRevisies(a,native(),new Set(),21),/gesplitst/)});
test('bestaande revisies mogen geen andere identiteit krijgen',()=>assert.throws(()=>vergelijkRevisies(bron,native(),new Set(['21:0']),21),/Bestaande/));
test('auteur en alinea-identiteit worden niet genormaliseerd',()=>{for(const wijzig of [b=>b[0].attributes.ins.author='B',b=>b[0].paraId='ander']){const b=native();wijzig(b);assert.throws(()=>vergelijkRevisies(bron,b,new Set(),21),/overige inhoud/)}});
test('een vreemde native naamruimte wordt geweigerd',()=>{const b=native();b[0].attributes.ins.id='anders:0';assert.throws(()=>vergelijkRevisies(bron,b,new Set(),21),/naamruimte/)});

test('ongeldige en te grote tellers worden geweigerd',()=>{for(const teller of ['-1','0:extra','18446744073709551616']){const b=native();b[0].attributes.ins.id=id(teller);assert.throws(()=>vergelijkRevisies(bron,b,new Set(),21),/revisieteller/)}});
