import assert from 'node:assert/strict';
import {join} from 'node:path';
export function pickerPaths({out,member,pid,index}){
  assert(['OpenFile','SaveFile'].includes(member));assert(Number.isSafeInteger(pid)&&pid>0);assert(Number.isSafeInteger(index)&&index>=0);
  const key=member.toLowerCase()+'-'+pid+'-'+index,prefix=join(out,key);
  return {key,proof:prefix+'-portal.json',ready:prefix+'-ready.json'};
}
export function requirePickerReady(ready,{pid,observerPid}){
  assert.equal(ready.status,'ready');assert.equal(ready.ownedPid,pid);assert.equal(ready.observerPid,observerPid);
  return ready;
}
