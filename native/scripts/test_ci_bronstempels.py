"""Controleer de echte Cargo-uitvoer bij een gelijke en een gewijzigde bron."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

SCRIPT = Path(__file__).with_name('ci-bronstempels.py').resolve()


class Bronstempels(unittest.TestCase):
    def test_gelijke_bron_hergebruikt_bouw_en_gewijzigde_bron_wordt_echt_gebouwd(self):
        with tempfile.TemporaryDirectory(prefix='office-bronstempelproef-') as tmp:
            repo = Path(tmp)
            bron = repo / 'native/src/main.rs'
            bron.parent.mkdir(parents=True)
            bron.write_text('fn main() { println!("eerste"); }\n', encoding='utf-8')
            manifest = repo / 'native/Cargo.toml'
            manifest.write_text('[package]\nname="bronstempelproef"\nversion="0.1.0"\nedition="2024"\n', encoding='utf-8')
            self.run_ok(['git', 'init', '-q', str(repo)])
            self.run_ok(['git', '-C', str(repo), 'add', 'native/Cargo.toml', 'native/src/main.rs'])
            env = dict(os.environ, CARGO_TARGET_DIR=str(repo / 'native/target'))
            bouw = ['cargo', 'build', '--offline', '--manifest-path', str(manifest)]
            self.run_ok(bouw, env=env)
            exe = repo / 'native/target/debug' / ('bronstempelproef.exe' if os.name == 'nt' else 'bronstempelproef')
            self.assertEqual(self.run_ok([str(exe)]).strip(), 'eerste')
            bronstempel, programmastempel = bron.stat().st_mtime_ns, exe.stat().st_mtime_ns
            self.run_ok([sys.executable, str(SCRIPT), 'opslaan', '--repo', str(repo)])
            # Zelfde bytes met een nieuwe checkoutstempel: de binary blijft gelijk.
            os.utime(bron, ns=(time.time_ns(), time.time_ns()))
            self.run_ok([sys.executable, str(SCRIPT), 'herstellen', '--repo', str(repo)])
            self.assertEqual(bron.stat().st_mtime_ns, bronstempel)
            self.run_ok(bouw, env=env)
            self.assertEqual(exe.stat().st_mtime_ns, programmastempel)
            # Andere bytes met zelfs een oude stempel mogen nooit een oude binary geven.
            bron.write_text('fn main() { println!("tweede"); }\n', encoding='utf-8')
            os.utime(bron, ns=(bronstempel, bronstempel))
            self.run_ok([sys.executable, str(SCRIPT), 'herstellen', '--repo', str(repo)])
            self.run_ok(bouw, env=env)
            self.assertEqual(self.run_ok([str(exe)]).strip(), 'tweede')

    def run_ok(self, args, **kwargs):
        r = subprocess.run(args, text=True, encoding='utf-8', capture_output=True, timeout=60, **kwargs)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r.stdout


if __name__ == '__main__':
    unittest.main()
