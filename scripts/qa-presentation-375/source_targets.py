"""Read-only CLI target gate for the exact #375 LibreOffice source witness."""
import hashlib
from pathlib import Path
import re


MODULE = 'instsetoo_native/Module_instsetoo_native.mk'
MODULE_SHA256 = '36ee079207d9e432e91e55dc67c5068746dd182327f13d5b27df5c4a7fe9fcdf'
OPTIONAL = 'Package_instsetoo_native_ooenv'
RECIPES = (
    ('Executable_soffice_bin', 'desktop/Executable_soffice_bin.mk'),
    ('Executable_oosplash', 'desktop/Executable_oosplash.mk'),
    ('Package_desktop_soffice_sh', 'desktop/Package_soffice_sh.mk'),
    ('Package_filter_xslt', 'filter/Package_xslt.mk'),
    ('Package_instsetoo_native_setup', 'instsetoo_native/Package_setup.mk'),
    ('Package_instsetoo_native_setup_ure', 'instsetoo_native/Package_setup_ure.mk'),
    (OPTIONAL, 'instsetoo_native/Package_instsetoo_native_ooenv.mk'),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def select_cli_targets(source, config):
    source = Path(source).resolve(strict=True)
    config = Path(config).resolve(strict=True)
    module = source / MODULE
    assert module.resolve(strict=True).is_relative_to(source)
    assert digest(module) == MODULE_SHA256, 'Pinned conditional target registration changed'
    values = re.findall(r'^export ENABLE_OOENV=(.*)$', config.read_text(), re.M)
    assert len(values) == 1, 'Expected exactly one configured ENABLE_OOENV value'
    enabled = values[0].strip()
    assert enabled in ('', 'TRUE'), 'Unsupported ENABLE_OOENV configuration'
    targets = []
    recipes = []
    for target, relative in RECIPES:
        if target == OPTIONAL and not enabled:
            continue
        recipe = source / relative
        assert recipe.resolve(strict=True).is_relative_to(source) and recipe.is_file()
        kind, name = target.split('_', 1)
        declaration = 'gb_' + kind + '_' + kind + ',' + name
        assert declaration in recipe.read_text(), 'Wrong target recipe: ' + relative
        targets.append(target)
        recipes.append({'target': target, 'path': relative, 'sha256': digest(recipe)})
    return targets, {
        'configuredENABLE_OOENV': enabled,
        'configSHA256': digest(config),
        'module': MODULE,
        'moduleSHA256': MODULE_SHA256,
        'targets': targets,
        'omittedTargets': [] if enabled else [OPTIONAL],
        'recipes': recipes,
        'method': 'Pinned module condition plus actual generated config; no configure mutation or make execution',
    }
