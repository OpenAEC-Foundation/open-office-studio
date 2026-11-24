import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { studioConfig, studios } from './studio-config.mjs';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
// Tauri's --config overlays follow JSON Merge Patch (RFC 7396), including null
// removal and array replacement. Test the effective config, not just one file.
function merge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = {...base};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = merge(out[key], value);
  }
  return out;
}
const base = await json('src-tauri/tauri.conf.json');
const linux = await json('src-tauri/tauri.linux.conf.json');

for (const studio of studios) {
  test(`${studio.sleutel}: effective Linux DEB and RPM declare confirmation runtime`, async () => {
    const effective = studio.sleutel === 'database'
      ? await json('apps/database-studio/src-tauri/tauri.conf.json')
      : merge(merge(base, linux), studio.sleutel === 'office' ? {} : await studioConfig(studio.sleutel, 'linux'));
    for (const kind of ['deb', 'rpm']) {
      assert.ok(effective.bundle.linux[kind].depends.includes('zenity'), `${studio.sleutel}/${kind}`);
    }
    if (studio.sleutel !== 'database') {
      const knownFiles = effective.bundle.linux.deb.files ?? {};
      if (!['notition'].includes(studio.sleutel)) {
        assert.ok(Object.hasOwn(knownFiles, `/usr/libexec/${studio.naam}/kantoorruntime`));
      }
    }
  });
}

// De Snap pakt het DEB uit met `dpkg-deb -x`: Depends wordt daar niet opgelost
// en de strikte afscherming ziet geen Zenity van de host. Zonder eigen exemplaar
// meldt de app bij elke bevestiging een eis die de gebruiker niet kan vervullen.
for (const studio of studios.filter(s => s.sleutel !== 'database')) {
  test(`${studio.sleutel}: Snap levert Zenity en zijn gegevensmap zelf mee`, async () => {
    const recept = (await readFile(`snap/recipes/open-${studio.sleutel}-studio.yaml`, 'utf8')).replace(/\r\n/g, '\n');
    const pakketten = /^    stage-packages:\n((?:    - .+\n)+)/m.exec(recept)?.[1] ?? '';
    assert.match(pakketten, /^    - zenity$/m, 'stage-packages');
    assert.match(recept, /^layout:\n  \/usr\/share\/zenity:\n    bind: \$SNAP\/usr\/share\/zenity$/m, 'layout');
    assert.match(recept, /^confinement: strict$/m);
  });
}

test('all seven native confirmation sites use the requirement guard', async () => {
  let sites = 0;
  for (const file of ['src-tauri/src/main.rs', 'src-tauri/src/werkbestanden.rs', 'src-tauri/src/vensters.rs', 'src-tauri/src/database_export.rs', 'src-tauri/src/email/bestanden.rs', 'apps/database-studio/src-tauri/src/main.rs']) {
    const source = await readFile(file, 'utf8');
    for (const m of source.matchAll(/rfd::AsyncMessageDialog::new\(\)/g)) {
      sites++;
      assert.match(source.slice(Math.max(0, m.index - 70), m.index), /native_dialog::toon\(\s*$/, file);
    }
  }
  assert.equal(sites, 7);
});

test('pinned portal backend remains the dependency choice in both Rust products', async () => {
  for (const path of ['src-tauri/Cargo.toml', 'apps/database-studio/src-tauri/Cargo.toml']) {
    assert.match(await readFile(path, 'utf8'), /^rfd = "0\.15"$/m);
  }
});
