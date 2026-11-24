"""Observer API lifecycle contract only. Does not load a native library."""
import unittest

from fontconfig_host import new_observer_config


class Function:
    def __init__(self,call):self.call=call
    def __call__(self,*args):return self.call(*args)


class PublicConfigApi:
    """Only the three permitted public APIs exist; no Fonts/scan/setter APIs."""
    def __init__(self,initial=101,empty=202):
        self.calls=[]
        def init():self.calls.append(('initialize',));return initial
        def destroy(pointer):self.calls.append(('destroy',pointer))
        def create():self.calls.append(('empty',));return empty
        self.FcInitLoadConfig=Function(init)
        self.FcConfigDestroy=Function(destroy)
        self.FcConfigCreate=Function(create)


class InitializationTest(unittest.TestCase):
    def test_initialization_is_disposed_before_returning_empty_probe_context(self):
        lib=PublicConfigApi()
        self.assertEqual(new_observer_config(lib),202)
        self.assertEqual(lib.calls,[('initialize',),('destroy',101),('empty',)])

    def test_failed_initialization_cannot_reach_empty_context_or_probe(self):
        lib=PublicConfigApi(initial=None)
        with self.assertRaisesRegex(AssertionError,'initialization failed'):new_observer_config(lib)
        self.assertEqual(lib.calls,[('initialize',)])

    def test_empty_context_failure_has_already_released_initial_configuration(self):
        lib=PublicConfigApi(empty=None)
        with self.assertRaisesRegex(AssertionError,'creation failed'):new_observer_config(lib)
        self.assertEqual(lib.calls,[('initialize',),('destroy',101),('empty',)])


if __name__=='__main__':unittest.main()
