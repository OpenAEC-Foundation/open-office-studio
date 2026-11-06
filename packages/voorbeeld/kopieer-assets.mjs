import { cp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Kopieer naar een eigen statische map; de host kiest de uiteindelijke URL. */
export async function kopieerVoorbeeldAssets(doel) {
  const map = resolve(doel);
  await mkdir(map, { recursive: true });
  await cp(
    fileURLToPath(new URL("./dist/frame", import.meta.url)),
    join(map, "frame"),
    { recursive: true },
  );
}
