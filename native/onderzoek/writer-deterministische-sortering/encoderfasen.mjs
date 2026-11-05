// Alleen de eigen vaste fixture; dezelfde bronidentiteit als de gegevensproef.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createYrsSession } from '@betteroffice/docx/yrs';
const root = new URL('./.local/', import.meta.url);
const bron = await readFile(new URL('../../../docs/tests/writer-doortypen/bron.docx', import.meta.url));
const s = await createYrsSession({clientId:20264561});
try {
  s.openDocx(new Uint8Array(bron), true);
  const update = s.encodeStateAsUpdate(), vector = s.encodeStateVector();
  await writeFile(new URL('encoderbron.bin', root), update);
  await writeFile(new URL('encoderbron-vector.bin', root), vector);
  await writeFile(new URL('encoderbron.json', root), JSON.stringify({fixture_sha256:createHash('sha256').update(bron).digest('hex'), bron_sha256:createHash('sha256').update(update).digest('hex'), bytes:update.byteLength, verhalen:s.storyIds().length},null,2)+'\n');
} finally { s.destroy(); }
