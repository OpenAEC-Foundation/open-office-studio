/** Copy reviewed UI test backends only; no final application/SDK mutation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const HASHES = {
  interface: "470c82dc92a3159f35557435e7b7ad61d8dbd1307e474e687dd6195737df54d7",
  mac: "f93a5101a670d9775c0fe4306209486e10c9e3d828201bf8919f7b7940f4fc56",
  ax: "3ca52e7ffa15bac166bab4950510f4c19682214362d4ab97b145583bf004eda2",
};
function replace(source, before, after, count = 1) {
  assert.equal(source.split(before).length - 1, count, `Reviewed native marker changed: ${before}`);
  return source.replaceAll(before, after);
}
function checked(kind, source) {
  source = source.replaceAll("\r\n", "\n");
  assert.equal(createHash("sha256").update(source).digest("hex"), HASHES[kind], `Reviewed ${kind} backend changed`);
  return source;
}

const MAC_SAVE = `
    def native_save(pid, target):
        target = Path(target).resolve()
        assert target.suffix == ".docx" and not target.exists()
        target.parent.mkdir(parents=True, exist_ok=True)
        pressed = inspect(pid, "save")
        if not pressed.get("pressed"):
            raise RuntimeError("BLOCKED: owned custom Save button could not be pressed")
        native_report = options.report.with_name("native-os-save.json")
        completed = subprocess.run([sys.executable, "scripts/epub356-final-macos-save.py", "--pid", str(pid),
                                   "--save", str(target), "--report", str(native_report)], check=False, timeout=240)
        report["nativeSave"] = json.loads(native_report.read_text(encoding="utf-8"))
        if completed.returncode:
            detail = report["nativeSave"]
            raise RuntimeError(("BLOCKED: " if detail.get("status") == "blocked" else "") + detail.get("reason", "Native Save helper failed"))

`;

export function generateNativeSources(interfaceSource, macSource, axSource) {
  let js = checked("interface", interfaceSource), mac = checked("mac", macSource), ax = checked("ax", axSource);
  js = 'import { completeNativeSave } from "./epub356-final-os-save.mjs";\n' + js;
  js = replace(js, "  temporary,\n) {", "  temporary,\n  options,\n) {");
  js = replace(js, '  delete env.OPENAEC_CONVERSIE_PROGRAMMA;', '  assert(options?.input && ["epub", "docx"].includes(options.inputKind));\n  env.OOS_EPUB356_INPUT_KIND = options.inputKind;\n  env.OOS_EPUB356_SAVE_PATH = options.savePath || "";\n  delete env.OPENAEC_CONVERSIE_PROGRAMMA;');
  js = replace(js, '"scripts/proef-runtime-macos-interface.py"', '"scripts/epub356-final-macos.py"');
  // Bounds include existing AX compilation/startup plus the separately bounded
  // native panel helper. Do not terminate Python before its cleanup finally.
  js = replace(js, 'timeout: 420_000,', 'timeout: 720_000,');
  js = replace(js, 'join(nativeOutput, "Ontwerpnotitie.odt")', 'options.input', 2);
  js = replace(js, '      click = async () => {\n        await page.locator(".office-snelknop:has(.lucide-save-all)").click();', '      click = async (state) => {\n        await page.locator(state?.selector || ".office-snelknop:has(.lucide-save-all)").click();');
  js = replace(js, 'includes("Ontwerpnotitie")', 'includes("leesvolgorde")');
  js = replace(js, '"Opening must preserve the original ODT"', '"Opening must preserve the actual input bytes"');
  js = replace(js, '    diagnostics.states.push(await evaluate(interfaceState));\n    return {', '    diagnostics.states.push(await evaluate(interfaceState));\n    diagnostics.nativeSave = options.savePath ? await completeNativeSave({evaluate, click, env, pid: linuxApp?.pid || process_.pid, savePath: options.savePath, reportRoot}) : null;\n    return {');
  js = replace(js, '      odtLoadedInWriter: true,', '      inputFormat: options.inputKind,\n      epubLoadedInWriter: options.inputKind === "epub",\n      freshProcessReopen: options.inputKind === "docx",\n      nativeSave: diagnostics.nativeSave,\n      visualAcceptance: "pending original image review",');

  mac = replace(mac, '"runtime-macos-ax.swift"', '"epub356-final-macos-ax.swift"');
  mac = replace(mac, '    label_file = options.report.with_name("ax-labels.json")', '    labels["save"] = ["Save", "Opslaan"]\n    label_file = options.report.with_name("ax-labels.json")');
  mac = replace(mac, '    try:\n        operation_deadline', MAC_SAVE + '    try:\n        operation_deadline');
  mac = replace(mac, '        activation = applescript(pid,', '        report["ownedPid"] = pid\n        activation = applescript(pid,');
  mac = replace(mac, 'odtNativeWindow=True', 'inputFormat=os.environ["OOS_EPUB356_INPUT_KIND"], freshProcessReopen=os.environ["OOS_EPUB356_INPUT_KIND"] == "docx", visualAcceptance="pending original image review"');
  mac = replace(mac, '\n    except subprocess.TimeoutExpired:', '\n        if os.environ.get("OOS_EPUB356_SAVE_PATH"):\n            native_save(pid, os.environ["OOS_EPUB356_SAVE_PATH"])\n    except subprocess.TimeoutExpired:');

  ax = replace(ax, 'let press = CommandLine.arguments[3] == "press"', 'let action = CommandLine.arguments[3]\nlet press = action == "press" || action == "save"');
  ax = replace(ax, 'if !press, let focused', 'if !press || action == "save", let focused');
  ax = replace(ax, '(labels["saveAs"] ?? []).contains', '(labels[action == "save" ? "save" : "saveAs"] ?? []).contains');
  return { "epub356-final-native-interface.mjs": js, "epub356-final-macos.py": mac, "epub356-final-macos-ax.swift": ax };
}

export async function prepareFinalDrivers(destination) {
  const original = await Promise.all(["proef-runtime-interface.mjs", "proef-runtime-macos-interface.py", "runtime-macos-ax.swift"].map(n => readFile(new URL(n, import.meta.url), "utf8")));
  for (const [name, source] of Object.entries(generateNativeSources(...original)))
    await writeFile(resolve(destination, name), source);
  for (const name of ["epub356-final-os-save.mjs", "epub356-final-windows-save.ps1", "epub356-final-linux-save.py", "epub356-final-macos-save.py", "epub356-final-macos-save-ax.swift"])
    await copyFile(new URL(name, import.meta.url), resolve(destination, name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await prepareFinalDrivers(process.argv[2] || "scripts");
