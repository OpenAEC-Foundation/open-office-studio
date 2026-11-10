import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { preview } from "vite";
const server = await preview({
  configFile: false,
  cacheDir: ".local/runtime-browser-cache",
  build: { outDir: process.argv[2] || "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
try {
  const result = await promisify(execFile)(
    process.execPath,
    [
      "scripts/test-formaatfouten-browser.mjs",
      `http://127.0.0.1:${server.httpServer.address().port}/`,
    ],
    { timeout: 180_000 },
  );
  process.stdout.write(result.stdout);
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
