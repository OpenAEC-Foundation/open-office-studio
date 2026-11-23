import assert from 'node:assert/strict';
import {collectOwnedNativeResources} from '../../scripts/linux-suite-owned-processes.mjs';
const args={profile:'/own/profile',application:'/own/original.AppImage',uid:1001};
const io={readdir:async()=>['1','23','24','25','self'],stat:async p=>({uid:p==='/proc/1'?0:1001}),readFile:async p=>{assert.notEqual(p,'/proc/1/environ','Foreign root environment must never be read');return p==='/proc/25/environ'?'XDG_CONFIG_HOME=/other':'XDG_CONFIG_HOME=/own/profile\0APPIMAGE=/own/original.AppImage';},realpath:async p=>p==='/proc/24/exe'?'/usr/lib/WebKitWebProcess':'/tmp/appimage/usr/bin/open-office-studio'};
assert.deepEqual(await collectOwnedNativeResources({...args,io}),[{pid:23,executable:'/tmp/appimage/usr/bin/open-office-studio'},{pid:24,executable:'/usr/lib/WebKitWebProcess'}]);
await assert.rejects(collectOwnedNativeResources({...args,io:{...io,readFile:async()=>{throw Object.assign(new Error('Owned environment inaccessible'),{code:'EACCES'});}}}),/Owned environment inaccessible/);
assert.deepEqual(await collectOwnedNativeResources({...args,io:{...io,stat:async()=>{throw Object.assign(new Error('Exited'),{code:'ENOENT'});}}}),[]);
console.log('3 own-UID process contracts passed; foreign root environment unread, owned permission errors fail closed');
