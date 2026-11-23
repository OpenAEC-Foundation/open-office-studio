/** Read only same-UID processes; an unreadable own process remains a hard error. */
import {readdir,stat,readFile,realpath} from 'node:fs/promises';
import {basename} from 'node:path';
export async function collectOwnedNativeResources({profile,application,processGroup,uid=process.getuid(),observe=()=>{},io={readdir,stat,readFile,realpath}}){
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
      if(!/^\d+$/.test(fields[19]??''))throw Error('Unknown native process starttime '+name);
      const observation={pid:Number(name),uid,comm,stateBefore:fields[0],startTime:fields[19],processGroup:Number(fields[2]),expectedProcessGroup:processGroup,statBefore:state};
      if(['Z','X'].includes(fields[0])){
        let after;try{after=await io.readFile('/proc/'+name+'/stat','utf8');}catch(error){if(['ENOENT','ESRCH'].includes(error.code)){observe({...observation,status:'process-exited-before-environment-read'});continue;}throw error;}
        const current=after.slice(after.lastIndexOf(')')+2).trim().split(/\s+/);
        if(current[19]!==fields[19]||!['Z','X'].includes(current[0]))throw Error('Exited process incarnation changed '+name);
        observe({...observation,statAfter:after,stateAfter:current[0],status:'kernel-exited-before-environment-read'});continue;
      }
      let environment;
      try{environment=await io.readFile('/proc/'+name+'/environ','utf8');}
      catch(error){
        if(error.code!=='EACCES')throw error;
        let after;
        try{after=await io.readFile('/proc/'+name+'/stat','utf8');}
        catch(next){if(['ENOENT','ESRCH'].includes(next.code)){observe({...observation,status:'process-exited-during-environment-read'});continue;}throw next;}
        const afterFields=after.slice(after.lastIndexOf(')')+2).trim().split(/\s+/);
        if(afterFields[19]!==fields[19]){observe({...observation,statAfter:after,stateAfter:afterFields[0],startTimeAfter:afterFields[19],status:'blocked-changed-process-incarnation',error:String(error)});throw error;}
        if(['Z','X'].includes(afterFields[0])){observe({...observation,statAfter:after,stateAfter:afterFields[0],status:'kernel-exited-during-environment-read'});continue;}
        observe({...observation,statAfter:after,stateAfter:afterFields[0],status:'blocked-live-or-unknown-environment',error:String(error)});
        throw error;
      }
      const values=environment.split('\0');
      if(!values.includes('XDG_CONFIG_HOME='+profile))continue;
      const executable=await io.realpath('/proc/'+name+'/exe');
      if(executable.endsWith('/usr/bin/open-office-studio')||values.includes('APPIMAGE='+application)||/\/WebKit(?:Web|Network|GPU)Process$/.test(executable)||executable===application)result.push({pid:Number(name),executable});
    }catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
  }
  return result;
}
