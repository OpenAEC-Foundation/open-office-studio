/** Label-only probe of the caller's existing, checksum-verified Linux session. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const modulePath = fileURLToPath(import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const errorInfo = (error) => ({
  name: error?.name ?? "Error",
  message: String(error?.message ?? error),
  ...(error instanceof AggregateError
    ? { errors: error.errors.map(errorInfo) }
    : {}),
});

// Read-only DOM inspection: no click(), dispatchEvent(), editor API or language writes.
const readDom = `
const visible=e=>Boolean(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
const tab=e=>({id:e.id,name:e.textContent.trim(),selected:e.getAttribute('aria-selected')==='true',visible:visible(e)});
return {
  tauriObject:typeof window.__TAURI_INTERNALS__==='object'&&window.__TAURI_INTERNALS__!==null,
  tauriInvoke:typeof window.__TAURI_INTERNALS__?.invoke,
  diagnostics:Boolean(window.__writerApis||window.__writerWarmup||window.__writerSpelling),
  writerVisible:[...document.querySelectorAll('[data-testid=yrs-input]')].some(visible),
  language:document.documentElement.lang,
  tabs:[...document.querySelectorAll('.ribbon-tabknoppen [role=tab]')].map(tab),
  groups:[...document.querySelectorAll('.ribbon-groep')].map(g=>({
    name:g.getAttribute('aria-label'),visible:visible(g),
    buttons:[...g.querySelectorAll('button.ribbon-actie')].map(b=>({
      name:b.getAttribute('aria-label'),title:b.getAttribute('title'),text:b.textContent.trim(),disabled:b.disabled,visible:visible(b)
    }))
  }))
};`;
const readPoint = `
const e=document.getElementById(arguments[0]);
if(!e||!e.matches('.ribbon-tabknoppen [role=tab]'))return null;
const r=e.getBoundingClientRect(),x=Math.floor(r.left+r.width/2),y=Math.floor(r.top+r.height/2);
const hit=document.elementFromPoint(x,y);
return {x,y,visible:Boolean(e.getClientRects().length&&r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'),
  inViewport:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,hit:Boolean(hit&&(hit===e||e.contains(hit)))};`;

/**
 * The caller owns the profile, installed app, session and package/executable checks.
 * This module neither creates/deletes sessions nor starts/stops the application.
 * Return status must be checked by the caller; failed/skipped never means accepted.
 */
export async function runWriter363NativeLabels({
  endpoint,
  sessionId,
  outDir,
  source,
  ownedProfile,
  signal,
}) {
  assert(
    typeof outDir === "string" && outDir.trim(),
    "A dedicated outDir is required",
  );
  await mkdir(outDir, { recursive: true });
  const report = {
    schemaVersion: 1,
    issue: 363,
    status: "failed",
    browserOnly: true,
    harnessCommit: execFileSync(
      "git",
      ["-C", dirname(modulePath), "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim(),
    harnessSha256: hash(await readFile(modulePath)),
    host: platform(),
    scope:
      "Existing installed Linux Tauri session; Styles-tab pointer and read-only labels only",
    delegatedProvenance: {
      ...source,
      ownedProfile,
      verification:
        "Caller-provided; package, PID and installed executable are not independently checked by this module",
    },
    cleanup: {
      tabRestoreNeeded: false,
      tabRestored: null,
      actionsReleased: null,
    },
    limits: [
      "EN/NL UI only; no language injection",
      "No style action or document edit",
      "No app/session ownership; caller must close its resources",
    ],
  };
  const errors = [];
  let base,
    previous,
    touched = false,
    evaluated = false;
  async function request(method, path, body, cleanup = false) {
    const timeout = AbortSignal.timeout(cleanup ? 5000 : 10000);
    const response = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: cleanup || !signal ? timeout : AbortSignal.any([signal, timeout]),
    });
    const result = await response.json();
    if (!response.ok || result.value?.error)
      throw new Error(
        `W3C ${method} ${path}: ${JSON.stringify(result.value ?? result)}`,
      );
    return result.value;
  }
  const path = () => `/session/${encodeURIComponent(sessionId)}`;
  const evaluate = (script, args = [], cleanup = false) =>
    request("POST", path() + "/execute/sync", { script, args }, cleanup);
  async function pointer(id, cleanup = false) {
    const point = await evaluate(readPoint, [id], cleanup);
    assert(
      point?.visible && point.inViewport && point.hit,
      "Ribbon tab has no unobstructed native pointer target",
    );
    touched = true;
    await request(
      "POST",
      path() + "/actions",
      {
        actions: [
          {
            type: "pointer",
            id: "writer363-native-pointer",
            parameters: { pointerType: "mouse" },
            actions: [
              {
                type: "pointerMove",
                duration: 100,
                origin: "viewport",
                x: point.x,
                y: point.y,
              },
              { type: "pointerDown", button: 0 },
              { type: "pointerUp", button: 0 },
            ],
          },
        ],
      },
      cleanup,
    );
  }
  async function selected(id, cleanup = false) {
    const until = Date.now() + 5000;
    do {
      const dom = await evaluate(readDom, [], cleanup);
      if (dom.tabs.some((tab) => tab.id === id && tab.selected && tab.visible))
        return dom;
      await delay(100, undefined, cleanup ? {} : { signal });
    } while (Date.now() < until);
    throw new Error("Native pointer did not select the requested ribbon tab");
  }
  async function release() {
    try {
      await request("DELETE", path() + "/actions", undefined, true);
      report.cleanup.actionsReleased = true;
    } catch (error) {
      report.cleanup.actionsReleased = false;
      errors.push(error);
    }
  }
  try {
    assert.equal(platform(), "linux", "Native Linux host required");
    assert.equal(
      ownedProfile,
      true,
      "Caller must attest ownedProfile === true",
    );
    for (const field of ["commit", "tree"])
      assert.match(
        source?.[field] ?? "",
        /^[0-9a-f]{40}$/,
        `Caller source.${field} requires a full Git SHA`,
      );
    for (const field of ["packageSha256", "executableSha256"])
      assert.match(
        source?.[field] ?? "",
        /^[0-9a-f]{64}$/,
        `Caller source.${field} requires SHA-256`,
      );
    const url = new URL(endpoint);
    assert(
      ["http:", "https:"].includes(url.protocol) &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
      "Existing W3C endpoint must be loopback HTTP(S)",
    );
    assert(
      typeof sessionId === "string" && sessionId.trim(),
      "An existing sessionId is required",
    );
    base = url.href.replace(/\/$/, "");
    signal?.throwIfAborted();
    const before = await evaluate(readDom);
    evaluated = true;
    report.nativeGate = {
      ownedProfile: true,
      linuxHost: true,
      tauriObject: before.tauriObject,
      tauriInvoke: before.tauriInvoke,
      noDiagnostics: !before.diagnostics,
      writerVisible: before.writerVisible,
    };
    assert(
      before.tauriObject && !before.diagnostics && before.writerVisible,
      "Existing session must expose actual production Tauri Writer DOM without diagnostic/editor bridges",
    );
    report.browserOnly = false;
    report.language = before.language;
    const language = /^en(?:-|$)/i.test(before.language)
      ? "en"
      : /^nl(?:-|$)/i.test(before.language)
        ? "nl"
        : null;
    if (!language) {
      report.status = "skipped";
      report.reason = `Unsupported current UI language: ${before.language || "<empty>"}`;
    } else {
      const nl = language === "nl",
        styles = nl ? "Stijlen" : "Styles",
        pane = nl ? "Stijlenvenster" : "Styles pane";
      const current = before.tabs.filter((tab) => tab.selected && tab.visible),
        targets = before.tabs.filter(
          (tab) => tab.name === styles && tab.visible,
        );
      assert.equal(
        current.length,
        1,
        "Exactly one previous ribbon tab is required",
      );
      assert.equal(
        targets.length,
        1,
        "Exactly one visible Styles ribbon tab is required",
      );
      previous = current[0];
      report.previousTab = previous;
      report.cleanup.tabRestoreNeeded = previous.id !== targets[0].id;
      await pointer(targets[0].id);
      const after = await selected(targets[0].id);
      assert.equal(
        after.language,
        before.language,
        "UI language changed during probe",
      );
      const groups = after.groups.filter(
        (group) =>
          group.visible && group.buttons.some((button) => button.name === pane),
      );
      assert.equal(
        groups.length,
        1,
        "Exactly one style-management group is required",
      );
      const group = groups[0];
      report.group = group;
      assert.equal(group.name, styles);
      assert.equal(group.buttons.length, 5);
      assert(
        !/styles\.[\w.]|\{\{|writer:/.test(JSON.stringify(group)),
        "Raw or uninterpolated style labels",
      );
      assert(
        group.buttons.every(
          (button) =>
            button.name?.trim() &&
            button.title?.trim() &&
            button.text?.trim() &&
            button.visible,
        ),
        "All five label controls must be visible and have names/tooltips",
      );
      const [paneButton, newButton, update, modify, sets] = group.buttons;
      assert.equal(paneButton.name, pane);
      assert.equal(newButton.name, nl ? "Nieuwe stijl…" : "New Style…");
      assert.equal(sets.name, nl ? "Stijlset…" : "Style Set…");
      const prefix = nl ? "Stijl wijzigen: " : "Modify Style: ";
      assert(
        modify.name.startsWith(prefix),
        "Current style interpolation is required",
      );
      const styleName = modify.name.slice(prefix.length).trim();
      assert(styleName, "Current style name must not be empty");
      assert.equal(
        update.name,
        nl ? `${styleName} bijwerken` : `Update ${styleName}`,
      );
      assert.equal(modify.title, modify.name);
      assert(
        update.title.includes(styleName),
        "Update tooltip must interpolate the same style name",
      );
      report.styleName = styleName;
      const screenshot = await request("GET", path() + "/screenshot");
      assert(
        typeof screenshot === "string" && screenshot.length > 0,
        "Native screenshot required",
      );
      const bytes = Buffer.from(screenshot, "base64"),
        name = "writer363-native-labels.png";
      assert(
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        "Native screenshot must be PNG",
      );
      await writeFile(resolve(outDir, name), bytes);
      report.screenshot = { name, sha256: hash(bytes) };
      report.status = "passed";
    }
  } catch (error) {
    errors.push(error);
  } finally {
    // Release first even after a partially completed action sequence. Cleanup
    // uses its own short deadline so cancellation cannot skip input release.
    if (touched) await release();
    if (previous) {
      try {
        const now = await evaluate(readDom, [], true);
        if (
          !now.tabs.some(
            (tab) => tab.id === previous.id && tab.selected && tab.visible,
          )
        ) {
          await pointer(previous.id, true);
          await selected(previous.id, true);
        }
        report.cleanup.tabRestored = true;
      } catch (error) {
        report.cleanup.tabRestored = false;
        errors.push(error);
      }
      if (touched) await release();
    }
    report.existingSessionRead = evaluated;
    if (errors.length) {
      report.status = "failed";
      report.error = errorInfo(
        errors.length === 1
          ? errors[0]
          : new AggregateError(
              errors,
              "Native label probe and/or restoration failed",
            ),
      );
    }
    try {
      await writeFile(
        resolve(outDir, "writer363-native-labels.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
    } catch (error) {
      report.status = "failed";
      report.outputError = errorInfo(error);
      error.probeReport = report;
      throw error;
    }
  }
  return report;
}
