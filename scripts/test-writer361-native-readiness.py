"""Protocol-only readiness tests; never opens an application or claims native acceptance."""
from pathlib import Path
import runpy
import unittest

WAIT = runpy.run_path(str(Path(__file__).with_name("proef-writer-361-macos-session.py")))["wait_for_native_grid"]


def grid(columns=3):
    return {"tables": [{"rows": 3, "columns": columns,
                        "rowEvidenceAvailable": True, "columnEvidenceAvailable": True}]}


class ReadinessTests(unittest.TestCase):
    def run_wait(self, states, columns=3):
        ticks = [0]
        remaining = iter(states)
        latest = [states[-1]]
        def snapshot():
            latest[0] = next(remaining, latest[0])
            return latest[0]
        def pause(duration):
            ticks[0] += duration
        return WAIT(snapshot, columns, seconds=1, clock=lambda: ticks[0], pause=pause)

    def test_loading_absence_then_real_grid(self):
        state, timing = self.run_wait([{}, {"tables": []}, grid()])
        self.assertEqual(state, grid())
        self.assertEqual(timing, {"attempts": 3, "elapsedSeconds": .5})

    def test_reopen_waits_for_persisted_four_columns(self):
        state, timing = self.run_wait([grid(3), grid(4)], columns=4)
        self.assertEqual(state, grid(4))
        self.assertEqual(timing["attempts"], 2)

    def test_permanent_absence_is_unavailable(self):
        with self.assertRaisesRegex(PermissionError, "remained unavailable"):
            self.run_wait([{"tables": []}])

    def test_wrong_final_structure_is_failure(self):
        with self.assertRaisesRegex(AssertionError, "expected 3x4"):
            self.run_wait([grid(3)], columns=4)

    def test_ambiguous_tables_do_not_pass(self):
        with self.assertRaises(PermissionError):
            self.run_wait([{"tables": [*grid()["tables"], *grid()["tables"]]}])

    def test_permission_block_is_not_retried_as_loading(self):
        def blocked():
            raise PermissionError("Accessibility unavailable")
        with self.assertRaisesRegex(PermissionError, "Accessibility unavailable"):
            WAIT(blocked, 3)


if __name__ == "__main__":
    unittest.main()
