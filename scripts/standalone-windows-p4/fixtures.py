"""Only committed empty office templates and a synthetic local SQLite database."""
from pathlib import Path
import hashlib
import json
import shutil
import sqlite3
import sys

root=Path(sys.argv[1]); root.mkdir(exist_ok=False)
files={}
for ext in ('docx','xlsx','pptx'):
    target=root/('Standalone23.'+ext); shutil.copyfile(Path('public/templates/nieuw.'+ext),target)
    files[ext]={'file':str(target.resolve()),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
database=root/'Standalone23.sqlite'
connection=sqlite3.connect(database)
connection.execute('create table standalone_qa(label text not null, amount integer not null)')
connection.execute('insert into standalone_qa values (?,?)',('STANDALONE23 DATABASE',42)); connection.commit(); connection.close()
files['database']={'file':str(database.resolve()),'sha256':hashlib.sha256(database.read_bytes()).hexdigest()}
(root/'manifest.json').write_text(json.dumps(files,indent=2)+'\n',encoding='utf-8')
