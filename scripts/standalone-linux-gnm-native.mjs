/** Caller-owned standalone Spreadsheet GNM regression. Native steps copied from proven c5763790. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, realpath, stat } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { typeVerifiedNativeText } from "./linux-p2-native-input.mjs";
import { writer362ProcStartTime } from "./linux-p2-ribbon-native.mjs";
export async function runStandaloneGnmProbe(context) {
  assert.equal(context.origin.studio.sleutel, "spreadsheet");
  assert.equal(
    context.origin.sourceCommit,
    "b696ab86bd1c128729a079b68c0082e6df3d36a5",
  );
  assert.equal(
    context.origin.sourceTree,
    "e30879fd772871e690847c061ef66e6b81808a05",
  );
  assert.equal(context.origin.version, "2026.48.1");
  const exec = promisify(execFile),
    hash = (b) => createHash("sha256").update(b).digest("hex");
  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(
    ".local/linux-p2-native/standalone-spreadsheet-" + context.kind,
  );
  await mkdir(out, { recursive: true });
  const env = context.env;
  let phase = "setup",
    guard;
  const command = (...args) => context.command(...args);
  const evaluate = (f, ...args) =>
    command("POST", "/execute/sync", {
      script: `return (${f.toString()})(...arguments)`,
      args,
    });
  const report = {
    status: "running",
    scope:
      "Actual independently installed Spreadsheet " +
      context.kind +
      " GNM regression after core save/reopen preflight",
    origin: context.origin,
    package: context.package,
    upstreamDriverPin: "c576379059fa819ac64017f9c84e1e519ce135fa",
    harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    cases: [],
    checks: [],
    inputs: [],
    captures: [],
    pickers: [],
    sessions: [],
    limits: [
      "Same genuine Gnumeric producer bytes under two suffixes; no all-variant claim.",
      "Caller owns actual standalone package/session, empty profile, normal full exit and AppImage child cleanup. No Office-suite bytes are installed or extracted.",
    ],
  };
  async function start(path) {
    const r = await context.start(path);
    guard = context.getGuard();
    assert.ok(guard);
    report.sessions.push({ phase, pid: r.pid, x11: guard.evidence });
    return r;
  }
  async function close() {
    await context.close();
    guard = undefined;
  }
  async function waitFor(fn, label, timeout = 30000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try {
        const a = await fn();
        if (a) return a;
      } catch (e) {
        last = String(e);
      }
      await delay(100);
    }
    throw Error(label + (last ? ": " + last : ""));
  }
  async function observation() {
    return evaluate(() => {
      const tab = document.querySelector(
        '.office-tab[role="tab"][aria-selected="true"]',
      );
      const panel =
        tab && document.getElementById(tab.getAttribute("aria-controls"));
      return {
        title: document.title,
        hasFocus: document.hasFocus(),
        active: {
          tag: document.activeElement?.tagName,
          label: document.activeElement?.getAttribute("aria-label"),
          testid: document.activeElement?.getAttribute("data-testid"),
          className: document.activeElement?.className,
        },
        tabs: [...document.querySelectorAll('.office-tab[role="tab"]')].map(
          (e) => ({
            text: e.textContent,
            selected: e.getAttribute("aria-selected"),
          }),
        ),
        sheets: [
          ...(panel?.querySelectorAll(
            '[data-testid="xlsx-sheet-tabs"] [role="tab"]',
          ) ?? []),
        ].map((e) => ({
          name: e.textContent,
          selected: e.getAttribute("aria-selected"),
        })),
        panelId: panel?.id,
        panelText: panel?.innerText?.slice(0, 16000),
        nameBox: panel?.querySelector(".rekenblad-naamvak")?.value,
        formula: panel?.querySelector('[data-testid="xlsx-formula-input"]')
          ?.value,
        grid: [
          ...(panel?.querySelectorAll('[role="grid"] [role="row"]') ?? []),
        ].map((e) => ({
          row: e.querySelector('[role="rowheader"]')?.textContent,
          cells: [...e.querySelectorAll('[role="gridcell"]')].map((c) => ({
            text: c.textContent,
            selected: c.getAttribute("aria-selected"),
          })),
        })),
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map(
          (e) => e.textContent,
        ),
        alerts: [...document.querySelectorAll('[role="alert"]')].map(
          (e) => e.textContent,
        ),
      };
    });
  }
  async function click(selector, text) {
    const el = await waitFor(
      () =>
        evaluate(
          (s, t) => {
            const tab = document.querySelector(
              '.office-tab[role="tab"][aria-selected="true"]',
            );
            const panel =
              tab && document.getElementById(tab.getAttribute("aria-controls"));
            const scope = s.startsWith(".opslaanals") ? document : panel;
            const all = [...(scope?.querySelectorAll(s) ?? [])].filter(
              (e) =>
                e.getClientRects().length &&
                !e.disabled &&
                (t === null ||
                  (e.getAttribute("aria-label") || e.textContent).trim() === t),
            );
            return all.length === 1 ? all[0] : null;
          },
          selector,
          text ?? null,
        ),
      "One visible " + selector + " " + (text ?? ""),
    );
    await guard.verify("before native element click");
    await command(
      "POST",
      `/element/${el["element-6066-11e4-a52e-4f735466cecf"]}/click`,
      {},
    );
    await guard.verify("after native element click");
    report.inputs.push({
      phase,
      kind: "WebDriver native element click",
      selector,
      text,
    });
  }
  async function key(chord, opensPicker = false) {
    assert.ok(
      new Set([
        "ctrl+a",
        "ctrl+s",
        "ctrl+o",
        "ctrl+shift+s",
        "Return",
        "Escape",
        "Tab",
      ]).has(chord),
    );
    await guard.verify("before " + chord);
    await exec("xdotool", ["key", "--clearmodifiers", chord], {
      env,
      timeout: 5000,
    });
    report.inputs.push({ phase, kind: "XTest key", chord });
    if (!opensPicker) await guard.verify("after " + chord);
  }
  async function type(text) {
    const sig = () => ({
      panel: document
        .querySelector('.office-tab[role="tab"][aria-selected="true"]')
        ?.getAttribute("aria-controls"),
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute("aria-label"),
      testid: document.activeElement?.getAttribute("data-testid"),
      className: document.activeElement?.className,
    });
    const target = await evaluate(sig);
    await typeVerifiedNativeText({
      text,
      verify: async (stage) => {
        const a = await guard.verify(stage);
        assert.deepEqual(
          await evaluate(sig),
          target,
          "Exact native input remains focused per character",
        );
        return a;
      },
      run: (a) => exec("xdotool", a, { env, timeout: 5000 }),
      record: (a) => report.inputs.push({ phase, ...a }),
    });
  }
  async function cell(where, wanted) {
    await click(".rekenblad-naamvak");
    await key("ctrl+a");
    await type(where);
    await key("Return");
    const a = await waitFor(
      async () => {
        const o = await observation();
        const expectedDisplay = wanted?.startsWith("=")
          ? { C1: "6", C2: "5", C3: "-1", C4: "11" }[where]
          : wanted;
        const shown = o.grid
          .flatMap((r) => r.cells)
          .some(
            (c) =>
              c.selected === "true" &&
              c.text === `${where}, ${expectedDisplay}, selected`,
          );
        return o.nameBox === where &&
          (wanted === undefined || (o.formula === wanted && shown))
          ? o
          : null;
      },
      "Native selected " + where + " formula/value " + wanted,
    );
    report.checks.push({
      phase,
      label: "native cell observation",
      where,
      wanted,
      actual: a,
    });
    return a;
  }
  async function edit(where, text) {
    await cell(where);
    await click('[data-testid="xlsx-formula-input"]');
    await key("ctrl+a");
    await type(text);
    await key("Return");
    await cell(where, text);
  }
  async function sheet(name) {
    await click('[data-testid="xlsx-sheet-tabs"] [role="tab"]', name);
    await waitFor(async () => {
      const o = await observation();
      return o.sheets.some((s) => s.name === name && s.selected === "true");
    }, "Native sheet " + name);
  }
  async function capture(name) {
    await guard.verify("before owned capture");
    await delay(150);
    const e = guard.evidence,
      path = join(out, name + ".png");
    const r = await exec(
      "/usr/bin/python3",
      [
        join(here, "linux-p2-native-capture.py"),
        String(e.pid),
        e.xid,
        e.binding.startTime,
        e.binding.executable,
        path,
      ],
      { env, timeout: 10000 },
    );
    const receipt = JSON.parse(r.stdout);
    assert.equal(hash(await readFile(path)), receipt.sha256);
    await guard.verify("after owned capture");
    report.captures.push({ phase, file: basename(path), ...receipt });
  }
  async function ready(names) {
    return waitFor(
      async () => {
        const o = await observation();
        return JSON.stringify(o.sheets.map((s) => s.name)) ===
          JSON.stringify(names) &&
          o.nameBox !== undefined &&
          o.grid.length > 0
          ? o
          : null;
      },
      "Real spreadsheet rendered with " + names.join(","),
      90000,
    );
  }
  async function focusedWindow() {
    const xid = (
      await exec("xdotool", ["getwindowfocus"], { env, timeout: 5000 })
    ).stdout.trim();
    const title = (
      await exec("xdotool", ["getwindowname", xid], { env, timeout: 5000 })
    ).stdout.trim();
    const pid = (
      await exec("xdotool", ["getwindowpid", xid], { env, timeout: 5000 })
    ).stdout.trim();
    return { xid, title, pid };
  }
  async function picker(path, title) {
    const d = await waitFor(
      async () => {
        const w = await focusedWindow();
        return w.title === title ? w : null;
      },
      "Exact native GTK picker title " + title,
      30000,
    );
    assert.notEqual(d.xid, guard.evidence.xid);
    const check = async () =>
      assert.deepEqual(
        await focusedWindow(),
        d,
        "Exact native dialog retains focus",
      );
    async function snapshot(suffix) {
      await check();
      const executable = await realpath(`/proc/${d.pid}/exe`);
      assert.equal(executable, "/usr/libexec/xdg-desktop-portal-gtk");
      const startTime = writer362ProcStartTime(
        await readFile(`/proc/${d.pid}/stat`, "utf8"),
        Number(d.pid),
      );
      const file = `${phase}-${title === "Open file" ? "open" : "save"}-picker-${suffix}.png`;
      const r = await exec(
        "/usr/bin/python3",
        [
          join(here, "linux-p2-native-capture.py"),
          d.pid,
          d.xid,
          startTime,
          executable,
          join(out, file),
        ],
        { env, timeout: 10000 },
      );
      report.captures.push({
        phase,
        file,
        kind: "Owned private-session GTK picker",
        ...JSON.parse(r.stdout),
      });
    }
    await delay(350);
    await snapshot("initial");
    await check();
    await exec("xdotool", ["key", "--clearmodifiers", "ctrl+l"], {
      env,
      timeout: 5000,
    });
    await delay(350);
    await check();
    await exec("xdotool", ["key", "--clearmodifiers", "ctrl+a"], {
      env,
      timeout: 5000,
    });
    await check();
    assert.ok(path.startsWith(out + "/") && !/[\n\r]/.test(path));
    await exec(
      "xdotool",
      ["type", "--clearmodifiers", "--delay", "3", "--", path],
      { env, timeout: 10000 },
    );
    await check();
    await snapshot("typed-path");
    report.pickers.push({
      phase,
      dialog: d,
      selectedPath: path,
      status: "typed verified path in actual OS dialog",
    });
    await exec(
      "xdotool",
      ["key", "--clearmodifiers", title === "Open file" ? "alt+o" : "Return"],
      {
        env,
        timeout: 5000,
      },
    );
    try {
      await waitFor(
        async () => {
          const w = await focusedWindow();
          return w.xid === guard.evidence.xid;
        },
        "Picker closed and exact app window resumed",
        60000,
      );
    } catch (e) {
      await snapshot("not-dismissed").catch(
        (c) => (report.pickerCaptureError = String(c)),
      );
      throw e;
    }
    await guard.verify("after real GTK picker");
    report.pickers.push({
      phase,
      kind: "real GTK OS file picker",
      dialog: d,
      selectedPath: path,
      protocol:
        "wait exact dialog; Ctrl+L; Ctrl+A; XTest path; Alt+O for Open or Return for Save; owned app focus restored",
    });
  }
  async function openPicker(path) {
    await key("ctrl+o", true);
    await picker(path, "Open file");
    await ready(["Sheet1", "Sheet2"]);
  }
  async function oracle(source, xlsx, name, marker = true) {
    const dest = join(out, name + ".json");
    await exec(
      "/usr/bin/python3",
      [
        join(here, "format30-gnm/oracle.py"),
        "--source",
        source,
        "--xlsx",
        xlsx,
        ...(marker ? ["--marker"] : []),
        "--report",
        dest,
      ],
      { env, timeout: 10000 },
    );
    const r = JSON.parse(await readFile(dest, "utf8"));
    assert.equal(r.status, "passed");
    report.checks.push({
      phase,
      label: "independent gzip-source and XLSX ZIP/XML oracle",
      receipt: basename(dest),
      ...r,
    });
    return r;
  }
  async function saveAs(source, path, name) {
    await key("ctrl+shift+s");
    await waitFor(
      () =>
        evaluate(() =>
          Boolean(document.querySelector('.opslaanals[role="dialog"]')),
        ),
      "App Save as dialog",
    );
    await click('.opslaanals input[type="radio"][value="xlsx"]');
    const runtime = await waitFor(
      () =>
        evaluate(() => {
          const text = document.querySelector(
            ".opslaanals-runtime",
          )?.textContent;
          return text?.includes("included with the app") ? text : null;
        }),
      "Save as reports the actual included private runtime",
    );
    report.checks.push({
      phase,
      label: "Native runtime status identifies bundled office runtime",
      runtime,
    });
    assert.equal(
      await evaluate(
        () =>
          document.querySelector('.opslaanals input[type="radio"]:checked')
            ?.value,
      ),
      "xlsx",
    );
    await capture(name + "-save-as-xlsx");
    const el = await evaluate(() =>
      document.querySelector(".opslaanals .office-dialoogdoorgaan"),
    );
    await guard.verify("before Save as confirmation");
    await command(
      "POST",
      `/element/${el["element-6066-11e4-a52e-4f735466cecf"]}/click`,
      {},
    );
    await picker(path, "Save as");
    await waitFor(
      () =>
        stat(path)
          .then((s) => s.size > 1000)
          .catch(() => false),
      "XLSX produced by native Save as",
      30000,
    );
    return oracle(source, path, name + "-saved");
  }
  async function originals() {
    await sheet("Sheet1");
    for (const [where, v] of [
      ["A1", "1"],
      ["A2", "2"],
      ["B1", "String1"],
      ["B2", "String2"],
      ["C1", "=2*3"],
      ["C2", "=2+3"],
      ["C3", "=2-3"],
      ["C4", "=C1+C2"],
    ])
      await cell(where, v);
    await capture(phase + "-sheet1");
    await sheet("Sheet2");
    await cell("A1");
    await capture(phase + "-sheet2");
  }
  const sourceSha =
    "0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6";
  try {
    const source = await readFile(
      join(here, "../tests/fixtures/gnm-linux/universal-content.gnumeric"),
    );
    assert.equal(source.length, 2062);
    assert.equal(hash(source), sourceSha);
    for (const ext of ["gnm", "gnumeric"]) {
      const input = join(out, "source." + ext);
      await writeFile(input, source);
      phase = ext + "-import";
      const opened = await start(context.preflightPath);
      await openPicker(input);
      await originals();
      await edit("A1", "GNM30 EDIT");
      await capture(ext + "-edited");
      const output = join(out, ext + "-saved.xlsx");
      await saveAs(input, output, ext);
      await close();
      phase = ext + "-reopen";
      const reopened = await start(output);
      assert.notEqual(opened.pid, reopened.pid);
      await ready(["Sheet1", "Sheet2"]);
      await originals();
      await sheet("Sheet2");
      await cell("A1", "GNM30 EDIT");
      await capture(ext + "-reopened-marker");
      const proof = await oracle(input, output, ext + "-reopened");
      assert.equal(hash(await readFile(input)), sourceSha);
      await close();
      report.cases.push({
        extension: ext,
        status: "passed",
        sourceSha256: sourceSha,
        sourceBytes: source.length,
        xlsx: basename(output),
        xlsxSha256: proof.xlsxSha256,
        firstPid: opened.pid,
        reopenPid: reopened.pid,
        cells: 8,
        formulas: 4,
        sheets: 2,
        edit: "Sheet2!A1 = GNM30 EDIT",
        originalUnchanged: true,
      });
    }
    report.status = "passed";
    return report;
  } catch (e) {
    report.status = "failed";
    report.failedPhase = phase;
    report.error = String(e.stack ?? e);
    report.failureObservation = await observation().catch((e) => ({
      error: String(e),
    }));
    // Observe the app's own diagnostic through a real native click. Never
    // replace its error with an injected model, hidden bridge or retry setter.
    try {
      const details = await evaluate(() => {
        const tab = document.querySelector(
          '.office-tab[role="tab"][aria-selected="true"]',
        );
        const panel =
          tab && document.getElementById(tab.getAttribute("aria-controls"));
        const items = [
          ...(panel?.querySelectorAll("button,summary") ?? []),
        ].filter(
          (e) =>
            e.getClientRects().length &&
            e.textContent.trim() === "Show details",
        );
        return items.length === 1 ? items[0] : null;
      });
      if (details) {
        await guard.verify("before actual native Show details diagnostic");
        await command(
          "POST",
          `/element/${details["element-6066-11e4-a52e-4f735466cecf"]}/click`,
          {},
        );
        await guard.verify("after actual native Show details diagnostic");
        report.failureDetails = await observation();
        await capture("failure-details");
      }
    } catch (error) {
      report.failureDetailsObservationError = String(error);
    }
    throw e;
  } finally {
    report.completedAt = new Date().toISOString();
    await writeFile(
      join(out, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
}
