"""Geïsoleerde reproductie van WebKit #324459; geen acceptatie van de kantoorapp."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import argparse, json, tempfile, threading

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--uitvoer", type=Path, required=True)
opties = parser.parse_args()
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib

resultaat = {'geslaagd': False, 'omvang': 'Twee minimale moduleworkers in de geïnstalleerde WebKitGTK; geen app- of prestatieacceptatie.', 'webkit': '.'.join(str(f()) for f in [WebKit2.get_major_version, WebKit2.get_minor_version, WebKit2.get_micro_version])}
class Server(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
with tempfile.TemporaryDirectory(prefix='office-webkit-modulekaart-') as tmp:
    map = Path(tmp)
    for geval in ['oud', 'apart']:
        d = map / geval
        d.mkdir()
        code = '''globalThis.evaluaties=(globalThis.evaluaties??0)+1; export const identiteit=Math.random(); self.onmessage=async()=>{try{const{lees}=await import('./bewaren.js');self.postMessage({evaluaties:globalThis.evaluaties,gelijk:lees()===identiteit})}catch(e){self.postMessage({fout:String(e)})}};'''
        if geval == 'oud':
            (d / 'worker.js').write_text(code)
            (d / 'bewaren.js').write_text("import {identiteit} from './worker.js';export const lees=()=>identiteit;")
        else:
            (d / 'worker.js').write_text("import './implementatie.js';")
            (d / 'implementatie.js').write_text(code)
            (d / 'bewaren.js').write_text("import {identiteit} from './implementatie.js';export const lees=()=>identiteit;")
    (map / 'index.html').write_text('''<!doctype html><script>async function test(map){return new Promise((resolve,reject)=>{let w=new Worker('./'+map+'/worker.js',{type:'module'});w.onmessage=e=>{resolve(e.data);w.terminate()};w.onerror=e=>reject(Error(e.message));w.postMessage('go')})} (async()=>{try{document.title='uit:'+JSON.stringify({oud:await test('oud'),apart:await test('apart')})}catch(e){document.title='uit:'+JSON.stringify({fout:String(e)})}})()</script>''')
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Server, directory=tmp))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    venster = Gtk.Window()
    venster.set_default_size(600, 300)
    view = WebKit2.WebView()
    def titel(view, *_):
        naam = view.get_title() or ''
        if naam.startswith('uit:'):
            resultaat['gevallen'] = json.loads(naam[4:])
            Gtk.main_quit()
    def tijdgrens():
        resultaat['fout'] = 'Geen resultaat binnen 15 seconden'
        Gtk.main_quit()
        return False
    view.connect('notify::title', titel)
    venster.add(view)
    venster.show_all()
    view.load_uri(f'http://127.0.0.1:{server.server_port}/index.html')
    timer = GLib.timeout_add_seconds(15, tijdgrens)
    try:
        Gtk.main()
        gevallen = resultaat.get('gevallen', {})
        resultaat['kwetsbaar'] = gevallen.get('oud') == {'evaluaties': 2, 'gelijk': False}
        bekend = gevallen.get('oud') in [{'evaluaties': 2, 'gelijk': False}, {'evaluaties': 1, 'gelijk': True}]
        resultaat['geslaagd'] = bekend and gevallen.get('apart') == {'evaluaties': 1, 'gelijk': True}
    finally:
        if 'fout' not in resultaat:
            GLib.source_remove(timer)
        venster.destroy()
        server.shutdown()
opties.uitvoer.parent.mkdir(parents=True, exist_ok=True)
opties.uitvoer.write_text(json.dumps(resultaat, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(resultaat, ensure_ascii=False))
raise SystemExit(0 if resultaat['geslaagd'] else 1)
