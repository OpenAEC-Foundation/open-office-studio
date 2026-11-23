/** Read only same-UID processes; an unreadable own process remains a hard error. */
import {readdir,stat,readFile,realpath} from 'node:fs/promises';
import {basename} from 'node:path';
export async function collectOwnedNativeResources({profile,application,processGroup,uid=process.getuid(),io={readdir,stat,readFile,realpath}}){
  const result=[];
  for(const name of await io.readdir('/proc')){
    if(!/^\d+$/.test(name))continue;
    try{
      if((await io.stat('/proc/'+name)).uid!==uid)continue;
      const state=await io.readFile('/proc/'+name+'/stat','utf8');
      const end=state.lastIndexOf(')'),comm=state.slice(state.indexOf('(')+1,end);
      const fields=state.slice(end+2).trim().split(/\s+/);
      const ownGroup=Number.isInteger(processGroup)&&Number(fields[2])===processGroup;
      const candidateName=comm==='open-office-studio'.slice(0,15)||comm===basename(application).slice(0,15)||comm==='AppRun'||/^WebKit(?:Web|Network|GPU)/.test(comm);
      if(!ownGroup&&!candidateName)continue;
      const values=(await io.readFile('/proc/'+name+'/environ','utf8')).split('\0');
      if(!values.includes('XDG_CONFIG_HOME='+profile))continue;
      const executable=await io.realpath('/proc/'+name+'/exe');
      if(executable.endsWith('/usr/bin/open-office-studio')||values.includes('APPIMAGE='+application)||/\/WebKit(?:Web|Network|GPU)Process$/.test(executable)||executable===application)result.push({pid:Number(name),executable});
    }catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
  }
  return result;
}
