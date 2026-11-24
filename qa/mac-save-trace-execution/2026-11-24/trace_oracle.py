"""Pure offline ledger oracle; no app/input/network and no guessed delivery cause."""
from pathlib import Path
import json
from contract import BASE, require


def inspect(rows,pid,nonce,saved_sha):
    result={'complete':False,'status':'INCONCLUSIVE','errors':[],
        'limits':['Session-global native events need one unambiguous owned request chain',
                  'Missing terminal71 is not evidence that a command was not received',
                  'A matching hash proves bytes only; external DOCX semantic oracle is separate']}
    try:
        require(0<len(rows)<1024,'Missing/overflow ledger')
        for i,r in enumerate(rows,1):
            require(r.get('schema')==1 and r.get('pid')==pid and r.get('session')==nonce,'Wrong schema/PID/session')
            require(r.get('derived')=='P5_OBSERVER_NOT_SIGNED_RELEASE' and r.get('baseSource')==BASE and r.get('baseVersion')=='2026.48.1','Wrong DERIVED/source witness')
            require(r.get('nativeSeq')==i and r.get('nativeLost')==0,'Noncontiguous/lost native record')
        js=[r for r in rows if r.get('jsSeq',0)>0 and r['point']!=99]
        require(sorted(r['jsSeq'] for r in js)==list(range(1,len(js)+1)),'Lost/duplicate JS sequence')
        coverage=[r for r in rows if r['point']==99]
        require(bool(coverage),'No logger coverage marker')
        require(coverage[-1]['values']==[len(js),0,0] and coverage[-1]['jsSeq']==len(js),'Logger pending/loss/highwater differs')
        require(sum(r['point']==90 for r in rows)==1 and sum(r['point']==91 for r in rows)==1 and not any(r['point']==98 for r in rows),'Scope bind changed')
        keys=[r for r in js if r['point']==10]
        q=[r for r in keys if r['values'][0]==2];s=[r for r in keys if r['values'][0]==1]
        require(len(q)==len(s)==1 and q[0]['jsSeq']<s[0]['jsSeq'],'Exactly one real Q before one S listener receipt required')
        require(s[0]['values'][3]==1 and s[0]['values'][6]==0,'Actual nonrepeat Command-S required')
        for point in (17,20,22,27,29,31,32,33,35,40,41,42,45,50,54,55,56,57,58,63,64):
            require(sum(r['point']==point for r in js)==1,'Missing/duplicate frontend phase '+str(point))
        order=(17,20,22,31,32,55,56,57,58,33,35,50,54,51,36,40,60,63,64,41,42,45,27,29)
        positions=[next(r['jsSeq'] for r in js if r['point']==point) for point in order]
        require(positions==sorted(positions),'Frontend receiver/flush/serializer/save phases do not follow the observed original call order')
        require(not any(r['point'] in (11,13,14,16,21,23,24,26,30,34,38,39,44,53,62) for r in rows),'Guard/error/incomplete buffer observed')
        buffer_pairs={}
        for start in (36,51,60):
            begun=[r for r in js if r['point']==start];hashed=[r for r in js if r['point']==start+1]
            require(len(begun)==len(hashed)==1,'Missing/extra buffer snapshot')
            require(begun[0]['values']==hashed[0]['values'] and bool(hashed[0].get('sha256')),'Wrong buffer correlation')
            buffer_pairs[start]=hashed[0]
        require(len({r['values'][0] for r in buffer_pairs.values()})==3,'Buffer identities are not distinct')
        native={}
        for point in (69,70,72,74,76,71):
            found=[r for r in rows if r['point']==point and r.get('jsSeq')==0]
            require(len(found)==1,'Missing/duplicate native phase '+str(point));native[point]=found[0]
        require(not any(r['point'] in (73,75) for r in rows),'Native guard/write error path; terminal semantics incomplete')
        require([native[p]['nativeSeq'] for p in (69,70,72,74,76,71)]==sorted(native[p]['nativeSeq'] for p in (69,70,72,74,76,71)),'Interleaved native request chain')
        require(native[72]['values']==[1,1,1] and native[76]['values']==[5] and native[71]['values']==[5],'Owned target/success result differs')
        final=buffer_pairs[36];ipc=buffer_pairs[60]
        require(final['sha256']==ipc['sha256']==native[70]['sha256']==saved_sha,'Actual serializer/IPC/native/saved bytes do not join')
        require(final['values'][1]==ipc['values'][1]==native[70]['values'][0],'Byte lengths differ')
        result.update(complete=True,status='ONE_OWNED_WRITE_CHAIN_OBSERVED',joinedSavedSha256=saved_sha,
            rows=len(rows),jsRows=len(js),cutoffNativeSeq=rows[-1]['nativeSeq'],
            semanticQRequiresIndependentDocxOracle=True)
    except (ValueError,KeyError,IndexError,TypeError) as error:result['errors'].append(str(error))
    return result


def read_rows(path):
    raw=Path(path).read_bytes();require(len(raw)<=2*1024*1024 and raw.endswith(b'\n'),'Incomplete/oversized ledger bytes')
    return [json.loads(line) for line in raw.splitlines()]
