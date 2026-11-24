"""Real deadline controls using only own temporary Python/file workers."""
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

from source_supervisor import CONTROLLER_SECONDS, supervise


class DeadlineChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='375-deadline-control-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_evidence_io_stops_at_deadline_and_reserve_remains(self):
        worker = self.root / 'worker.py'
        worker.write_text('''from pathlib import Path
import hashlib, shutil
root=Path(__file__).parent
source=root/'source.dat'
source.write_bytes(b'x'*1024*1024)
while True:
    shutil.copyfile(source,root/'copy.dat')
    hashlib.sha256((root/'copy.dat').read_bytes()).hexdigest()
    (root/'progress.txt').write_text('processing')
''')
        started = time.time()
        code = supervise([sys.executable, str(worker)], self.root / 'receipt', started, controller_seconds=.75)
        self.assertEqual(124, code)
        self.assertLess(time.time() - started, 3)
        progress = self.root / 'progress.txt'
        self.assertTrue(progress.exists(), 'Worker must really have performed evidence I/O')
        timestamp = progress.stat().st_mtime_ns
        time.sleep(.08)
        self.assertEqual(timestamp, progress.stat().st_mtime_ns)
        receipt = json.loads((self.root / 'receipt/controller-envelope.json').read_text())
        self.assertTrue(receipt['timedOut'])
        self.assertGreater(receipt['remainingUploadCleanupSeconds'], 590)
        self.assertEqual(600, receipt['reservedSeconds'])

    def test_expired_allocation_starts_no_worker(self):
        code = supervise([sys.executable, '-c', 'raise RuntimeError("must not start")'], self.root, time.time()-10, controller_seconds=1)
        self.assertEqual(124, code)
        self.assertFalse(json.loads((self.root / 'controller-envelope.json').read_text())['controllerStarted'])

    def test_completed_worker_keeps_actual_outcome(self):
        code = supervise([sys.executable, '-c', 'pass'], self.root, time.time(), controller_seconds=3)
        self.assertEqual(0, code)
        self.assertFalse(json.loads((self.root / 'controller-envelope.json').read_text())['timedOut'])

    def test_budget_increase_refused(self):
        with self.assertRaises(AssertionError):
            supervise([], self.root, time.time(), controller_seconds=CONTROLLER_SECONDS+1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
