import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

type Geval = { herkomst: string; gedeeld: boolean; weigeringen: number; bronEnVectorGelijk: boolean; sessieBruikbaar: boolean };
let gevallen: Geval[];
beforeAll(() => {
  const uitkomst = spawnSync(process.execPath, ['tests/fixtures/alinea-updatecallback.mjs'], {
    encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024,
  });
  if (uitkomst.status !== 0) throw Error(`Alinealezerproef mislukt: ${uitkomst.error ?? uitkomst.stderr.slice(-2000)}`);
  gevallen = JSON.parse(uitkomst.stdout).gevallen;
}, 30_000);

describe('alinealezen tijdens een Wasm-updatecallback', () => {
  for (const herkomst of ['local', 'remote']) for (const gedeeld of [false, true]) {
    it(`weigert veilig bij ${herkomst}, gedeelde leesscope: ${gedeeld}`, () => {
      const geval = gevallen.find(g => g.herkomst === herkomst && g.gedeeld === gedeeld);
      expect(geval).toBeDefined();
      expect(geval!.weigeringen).toBeGreaterThanOrEqual(2);
      expect(geval!.bronEnVectorGelijk).toBe(true);
      expect(geval!.sessieBruikbaar).toBe(true);
    });
  }
});
