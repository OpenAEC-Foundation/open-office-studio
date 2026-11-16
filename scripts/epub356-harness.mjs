/** Change only copied CI test drivers after the fixed application is packaged. */
import assert from "node:assert/strict";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
await import("./runtime317-harness.mjs");
const driverPath = "scripts/proef-runtime-interface.mjs";
let driver = await readFile(driverPath, "utf8");
function change(before, after, count) {
  assert.equal(
    driver.split(before).length - 1,
    count,
    `Reviewed marker changed: ${before}`,
  );
  driver = driver.replaceAll(before, after);
}
change(
  'import { dirname, join } from "node:path";',
  'import { dirname, join, resolve } from "node:path";',
  1,
);
change(
  'join(nativeOutput, "Ontwerpnotitie.odt")',
  'resolve("docs/tests/epub356/leesvolgorde.epub")',
  2,
);
change('includes("Ontwerpnotitie")', 'includes("leesvolgorde")', 1);
change(
  "odtLoadedInWriter: true",
  'epubLoadedInWriter: true, inputFormat: "epub"',
  1,
);
change(
  "Opening must preserve the original ODT",
  "Opening must preserve the original EPUB",
  1,
);
await writeFile(driverPath, driver);
const macPath = "scripts/proef-runtime-macos-interface.py";
let mac = (await readFile(macPath, "utf8")).replaceAll("\r\n", "\n");
assert.equal(mac.split("odtNativeWindow=True").length, 2);
mac = mac
  .replace("odtNativeWindow=True", 'epubNativeWindow=True, inputFormat="epub"')
  .replace("The converted ODT", "The EPUB document");
const beforePress = "        applescript(pid, 'set frontmost to true')\n";
assert.equal(mac.split(beforePress).length, 2);
mac = mac.replace(
  beforePress,
  beforePress +
    `
        # Capture the loaded book before Save As blurs the document behind it.
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            state = inspect(pid, "inspect")
            if state["status"] == "blocked":
                report.update(status="blocked", reason=state["reason"])
                return
            ready = any(button.get("enabled") and any(
                text == label or text.startswith(label + " ·")
                for text in [button.get("title", ""), button.get("description", "")]
                for label in labels["saveAs"]
            ) for button in state.get("buttons", []))
            if ready:
                subprocess.run(["screencapture", "-x", str(options.report.with_name("epub-interface-ready.png"))],
                               check=True, capture_output=True, timeout=10)
                report["epubInputReadyBeforeSaveAs"] = True
                break
            time.sleep(.5)
        else:
            raise RuntimeError("The EPUB book did not enable Save As before its unobstructed capture")
`,
);
await writeFile(macPath, mac);
await copyFile(
  fileURLToPath(new URL("proef-epub356-hosted.mjs", import.meta.url)),
  "scripts/proef-epub356-hosted.mjs",
);
