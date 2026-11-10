import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
// @ts-expect-error The shared CLI is plain JavaScript, also used outside Vitest.
import {
  controleerFormatendekking,
  dekkingTabel,
} from "../scripts/controleer-formatendekking.mjs";

it("houdt de invoer-/uitvoercatalogus, echte bronnen, resultaten en documentatie in overeenstemming (#43)", () => {
  const gegevens = controleerFormatendekking();
  expect(readFileSync("docs/tests/formatendekking/matrix.md", "utf8")).toBe(
    dekkingTabel(gegevens),
  );
});
