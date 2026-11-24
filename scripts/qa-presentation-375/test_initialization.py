"""Exact test-only UI dependency and resource receipts; no product correction."""
import hashlib
from pathlib import Path

RECIPE = 'xmloff/CppunitTest_xmloff_draw.mk'
RECIPE_AFTER = 'd6c2ac082894b09a8973eaf69141cad84a69d73fac724555c756bfc0bc45c0b2'
PATCH = Path(__file__).resolve().parents[2] / 'docs/tests/presentation-375/375-test-initialization-proposal.patch'
PATCH_SHA256 = 'bf6b59953999970e8982133f6e6e6a1abe7c3ea27d4b1550e863a68e5b016828'
RESOURCE_SOURCE = 'sd/uiconfig/simpress/ui/tabviewbar.ui'
RESOURCE_INSTALLED = 'instdir/share/config/soffice.cfg/modules/simpress/ui/tabviewbar.ui'
RESOURCE_SHA256 = '90b5b37d690ae59fe5cd24e8c9078499cab25056c28be0126a86dc823109b1ec'
PRIMARY = {
    RECIPE: '3c426f9108fa93901839250be91a39ca1c35eee79dc75065f979268a042fce40',
    RESOURCE_SOURCE: RESOURCE_SHA256,
    'sd/UIConfig_simpress.mk': '8442b06b6293e22491c0c9f59133b94282da6f0afae1eb4db3346f9167be1ae7',
    'solenv/gbuild/CppunitTest.mk': '6eb8de580d678b77f00cdc8e5081825aaf173158c70d4021e5523fa05ddb420f',
    'solenv/gbuild/UIConfig.mk': 'e14f8fe33f88897ee0d02f0d6fbc92fc726bfa0bb9379a540e3bfca4e9d84c8d',
    'solenv/gbuild/TargetLocations.mk': 'a5b0b1186c3bc5afa3a955887e14a9fdacfe7ab8dff1a40eca9de6b1767250ed',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verified_inputs(source):
    source = Path(source).resolve(strict=True)
    assert sha(PATCH) == PATCH_SHA256, 'Unexpected test-only initialization patch'
    for relative, expected in PRIMARY.items():
        path = source / relative
        assert path.resolve(strict=True).is_relative_to(source)
        assert sha(path) == expected, 'Unexpected pinned initialization input: ' + relative
    # Exact target mapping from the pinned TargetLocations.mk, not a guessed
    # user-friendly package alias. The witness uses the default workdir config.
    return {
        'patchSHA256': PATCH_SHA256,
        'recipe': RECIPE,
        'recipeBeforeSHA256': PRIMARY[RECIPE],
        'recipeAfterSHA256': RECIPE_AFTER,
        'primarySHA256': dict(PRIMARY),
        'resourceTarget': str(source / 'workdir/UIConfig/modules/simpress.done'),
        'resourceInstalled': RESOURCE_INSTALLED,
        'resourceSHA256': RESOURCE_SHA256,
        'initializationPatchChangesProductionImporter': False,
    }


def resource_receipt(source):
    source = Path(source).resolve(strict=True)
    installed = source / RESOURCE_INSTALLED
    resolved = installed.resolve(strict=True)
    assert resolved.is_relative_to(source), 'UI resource resolves outside own source/build tree'
    assert installed.is_file() and sha(installed) == RESOURCE_SHA256, 'Wrong installed Impress UI resource'
    return {'relativePath': RESOURCE_INSTALLED, 'resolvedPath': str(resolved),
            'bytes': installed.stat().st_size, 'sha256': sha(installed),
            'method': 'Actual installed file bytes, checked before baseline execution'}
