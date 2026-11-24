import copy
from pathlib import Path
import runpy
import unittest

M=runpy.run_path(str(Path(__file__).with_name("mac-native-save-transport.py")))


class BoundedTransport(unittest.TestCase):
    def test_only_exact_approved_three_condition_six_copy_budget(self):
        v={"saveTransportDifferentialApproved":True,"saveTransportMaximumSets":2,
           "saveTransportConditions":list(M["CONDITIONS"]),"requireSignedNotarized":True}
        M["validate_scope"](v)
        for key,bad in [("saveTransportDifferentialApproved",False),("saveTransportMaximumSets",3),
                        ("saveTransportMaximumSets",2.0),("saveTransportConditions",["released-hid"]),
                        ("requireSignedNotarized",False)]:
            wrong=copy.deepcopy(v);wrong[key]=bad
            with self.subTest(key=key),self.assertRaises(PermissionError):M["validate_scope"](wrong)

    def test_distinguishing_first_set_stops_without_another_copy(self):
        self.assertFalse(M["another_set"]([{"savedExactly":x} for x in [False,True,True]],1))

    def test_non_reproduction_is_bounded_at_two_sets(self):
        for value in [True,False]:
            self.assertTrue(M["another_set"]([{"savedExactly":value}]*3,1))
            self.assertFalse(M["another_set"]([{"savedExactly":value}]*6,2))
        with self.assertRaises(RuntimeError):M["another_set"]([{"savedExactly":True}],1)


if __name__=="__main__":unittest.main()
