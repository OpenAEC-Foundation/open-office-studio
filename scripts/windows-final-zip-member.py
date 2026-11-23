"""Stream one exact immutable artifact member; never unpack the other installers."""
import json
from pathlib import Path
import shutil
import stat
import sys
import zipfile

archive, member, output = sys.argv[1:]
with zipfile.ZipFile(archive) as z:
    matches = [info for info in z.infolist() if info.filename == member]
    assert len(matches) == 1, "Exactly one frozen installer member must exist"
    info = matches[0]
    assert not info.is_dir() and stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG), "Installer must be a regular archive member"
    with z.open(info) as source, Path(output).open("xb") as destination:
        shutil.copyfileobj(source, destination, length=1024 * 1024)
    print(json.dumps({"member": member, "bytes": info.file_size}))
