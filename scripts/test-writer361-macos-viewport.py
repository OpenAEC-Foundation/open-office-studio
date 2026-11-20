"""Pure native-AX geometry/owner protocol tests; no app or capture execution."""
import copy
from pathlib import Path
import runpy
import unittest

M = runpy.run_path(str(Path(__file__).with_name('writer361-macos-viewport.py')))


def node(role='AXStaticText', text='alpha', size=None):
    values = {'AXRole': role, 'AXTitle': text, 'AXValue': text,
              'AXEnabled': True, 'AXPosition': {'x': 120, 'y': 300},
              'AXSize': size or {'width': 35, 'height': 19}}
    return {'index': 1, 'attributes': {**{k: {'status': 'available', 'value': v} for k, v in values.items()},
            'actions': {'value': ['AXPress'], 'axError': 0}}}


def snapshot():
    return {'screenCaptureAuthorized': True,
            'ownedScreenWindows': [{'id': 33, 'pid': 7, 'bounds': {'X': 0, 'Y': 25, 'Width': 1024, 'Height': 700}}],
            'mainDisplay': {'bounds': {'X': 0, 'Y': 0, 'Width': 1024, 'Height': 768}},
            'rawNodes': [node()]}


class ViewportTests(unittest.TestCase):
    def test_real_unique_press_control_required(self):
        s = snapshot()
        s['rawNodes'] = [node('AXButton', 'Maximize')]
        self.assertEqual(M['button'](s, 'Maximize')['index'], 1)
        s['rawNodes'].append(copy.deepcopy(s['rawNodes'][0]))
        with self.assertRaises(PermissionError): M['button'](s, 'Maximize')

    def test_fitted_native_bounds_and_main_display(self):
        s = snapshot()
        self.assertTrue(M['fitted'](s, 7))
        s['ownedScreenWindows'][0]['bounds']['X'] = -208
        self.assertFalse(M['fitted'](s, 7))

    def test_unique_readable_alpha_geometry_only(self):
        self.assertEqual(M['alpha_target'](snapshot(), 7)['value'], 'alpha')
        for change in [lambda s: s['rawNodes'][0]['attributes']['AXSize'].update(value={'width': 816, 'height': 10}),
                       lambda s: s['rawNodes'].append(copy.deepcopy(s['rawNodes'][0])),
                       lambda s: s['rawNodes'][0]['attributes']['AXValue'].update(value='')]:
            s = snapshot(); change(s)
            with self.assertRaises(PermissionError): M['alpha_target'](s, 7)

    def test_foreign_pid_and_missing_capture_authority_fail_closed(self):
        with self.assertRaises(PermissionError): M['alpha_target'](snapshot(), 8)
        s = snapshot(); s['screenCaptureAuthorized'] = False
        with self.assertRaises(PermissionError): M['fitted'](s, 7)


if __name__ == '__main__': unittest.main()
