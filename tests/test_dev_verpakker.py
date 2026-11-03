"""De Linux-pakketproef moet de opgegeven Python-omgeving blijven gebruiken."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import venv

spec = importlib.util.spec_from_file_location('dev_verpakker', Path(__file__).parents[1] / 'scripts/verpak-dev-linux.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@unittest.skipUnless(os.name == 'posix', 'Linux-verpakker; symlinkgedrag wordt op POSIX getoetst')
class PythonOmgeving(unittest.TestCase):
    def test_gui_houdt_de_werkelijke_virtuele_omgeving(self):
        with tempfile.TemporaryDirectory(prefix='office-gui-omgeving-') as tmp:
            map = Path(tmp) / 'omgeving'
            venv.EnvBuilder(with_pip=False, symlinks=True).create(map)
            python = map / 'bin/python'
            env = {**os.environ, 'PYTHONPATH': ''}
            bibliotheek = Path(subprocess.check_output([str(python), '-c', 'import sysconfig; print(sysconfig.get_path("purelib"))'], text=True, env=env).strip())
            (bibliotheek / 'office_gui_proefomgeving.py').write_text('waarde = "omgeving behouden"\n')
            code = 'import office_gui_proefomgeving; print(office_gui_proefomgeving.waarde)'
            oud = subprocess.run([str(python.resolve()), '-c', code], capture_output=True, text=True, env=env)
            self.assertNotEqual(oud.returncode, 0)
            self.assertIn('ModuleNotFoundError', oud.stderr)
            nieuw = subprocess.check_output([module.gui_python(python), '-c', code], text=True, env=env)
            self.assertEqual(nieuw.strip(), 'omgeving behouden')


if __name__ == '__main__':
    unittest.main()
