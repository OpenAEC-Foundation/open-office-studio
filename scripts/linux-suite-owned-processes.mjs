/** Read only same-UID processes; an unreadable own process remains a hard error. */
import {readdir,stat,readFile,realpath} from 'node:fs/promises';
export async function collectOwnedNativeResources({profile,application,uid=process.getuid(),io={readdir,stat,readFile,realpath}}){
  const result=[];
  for(const name of await io.readdir('/proc')){
    if(!/^\d+$/.test(name))continue;
    try{
      if((await io.stat('/proc/'+name)).uid!==uid)continue;
      const values=(await io.readFile('/proc/'+name+'/environ','utf8')).split('\0');
      if(!values.includes('XDG_CONFIG_HOME='+profile))continue;
      const executable=await io.realpath('/proc/'+name+'/exe');
      if(executable.endsWith('/usr/bin/open-office-studio')||values.includes('APPIMAGE='+application)||/\/WebKit(?:Web|Network|GPU)Process$/.test(executable)||executable===application)result.push({pid:Number(name),executable});
    }catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
  }
  return result;
}
