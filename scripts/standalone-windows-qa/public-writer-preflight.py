"""Exactly one public old standalone Writer: host/driver proof, never final acceptance."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

root=Path(sys.argv[1]); root.mkdir(parents=True,exist_ok=False)
url='https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Writer.Studio_2026.46.2_x64-setup.exe'
expected='0d8db828c23379bddcad8f9028e12cef0e43b00e7a312c3b3ba8652774be7adb'
target=root/'Open.Writer.Studio_2026.46.2_x64-setup.exe'
digest=hashlib.sha256(); length=0
with urllib.request.urlopen(url,timeout=90) as response, target.open('xb') as stream:
    for data in iter(lambda:response.read(1024*1024),b''):
        length+=len(data); assert length<=73593696
        digest.update(data); stream.write(data)
assert length==73593696 and digest.hexdigest()==expected
receipt=dict(preflightOnly=True,applicationCommit='cf65adf4b2ca76e4affd89f6f8812bfa4b8bec67',
             applicationTree='246fcdf922e327a464b06d780b687c091beeb7cc',version='2026.46.2',
             artifactRun=None,archiveSha256=None,releaseTag='v2026.46.2',assetId=741617327,
             installer=target.name,sourceUrl=url,
             application=dict(key='writer',title='Open Writer Studio',executable='open-writer-studio.exe',
                              identifier='org.openaec.writer-studio',packagePath=target.name,sha256=expected,bytes=length,signature='record'),
             limitation='The only permitted old public Writer host/driver preflight. Never count as final 2026.48 standalone acceptance.')
(root/'package.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
