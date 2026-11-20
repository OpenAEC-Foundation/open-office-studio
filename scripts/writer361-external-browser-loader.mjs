/** External QA code uses the exact app checkout's dependencies and receipt guard. */
import assert from "node:assert/strict";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

assert(
  process.env.OFFICE_TEST_APP_CWD,
  "Explicit immutable application checkout required",
);
const app = resolvePath(process.env.OFFICE_TEST_APP_CWD);
const packages = {
  playwright: "node_modules/playwright/index.mjs",
  vite: "node_modules/vite/dist/node/index.js",
  fflate: "node_modules/fflate/esm/index.mjs",
};
export async function resolve(specifier, context, next) {
  if (packages[specifier])
    return next(
      pathToFileURL(resolvePath(app, packages[specifier])).href,
      context,
    );
  if (specifier === "./writer-proefbuild.mjs")
    return next(
      pathToFileURL(resolvePath(app, "scripts/writer-proefbuild.mjs")).href,
      context,
    );
  return next(specifier, context);
}
