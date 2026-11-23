/** #362 checks in a caller-owned, installed Linux Tauri session. No app lifecycle. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const elementKey = "element-6066-11e4-a52e-4f735466cecf";
const groups = {
  Text: [
    "Special Character",
    "Date",
    "Time",
    "Date & Time",
    "Insert field…",
    "Update fields",
  ],
  Alignment: ["Top", "Center", "Bottom", "Cell Margins", "Text Direction"],
  Data: [
    "Formula",
    "Sort",
    "Repeat Header Rows",
    "Convert to Text",
    "Split Table",
  ],
  Delete: ["Delete Row", "Delete Column", "Delete Table"],
};
const keys = {
  down: "\uE015",
  right: "\uE014",
  enter: "\uE007",
  escape: "\uE00C",
  control: "\uE009",
  home: "\uE011",
  end: "\uE010",
  tab: "\uE004",
};
const execFileAsync = promisify(execFile);

export function writer362XTestChord(values) {
  const names = new Map([
    [keys.down, "Down"],
    [keys.right, "Right"],
    [keys.enter, "Return"],
    [keys.escape, "Escape"],
    [keys.control, "ctrl"],
    [keys.home, "Home"],
    [keys.end, "End"],
    [keys.tab, "Tab"],
  ]);
  assert.ok(values.length > 0, "At least one native key required");
  return values
    .map((value) => {
      assert.ok(names.has(value), "Unsupported XTest key");
      return names.get(value);
    })
    .join("+");
}

export function writer362KeyboardEntryKeys(entry) {
  assert.ok(
    ["arrow-down", "tab"].includes(entry),
    "Unsupported ribbon keyboard entry",
  );
  // DOM order: selected ribbon tab → .ribbon-inklap → first toolbar control.
  return entry === "tab" ? [keys.tab, keys.tab] : [keys.down];
}

export function writer362DocumentFocus() {
  const e = document.activeElement;
  return {
    hasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
    hidden: document.hidden,
    activeElement: {
      tag: e?.tagName,
      id: e?.id,
      role: e?.getAttribute("role"),
      label: e?.getAttribute("aria-label"),
      className: e?.className,
      focusVisible: e?.matches(":focus-visible"),
    },
  };
}

export function writer362ProcStartTime(text, pid) {
  assert.equal(
    Number(text.slice(0, text.indexOf(" "))),
    pid,
    "Unexpected /proc PID",
  );
  const fields = text
    .slice(text.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  assert.match(fields[19] ?? "", /^\d+$/, "Missing /proc starttime");
  return fields[19];
}

/** Exact caller PID/executable and private-display binding; injected IO is unit-test only. */
export function createWriter362XTestInput(
  { source, ownedProfile, display, observe, signal },
  io = {},
) {
  assert.equal(
    io.platform ?? process.platform,
    "linux",
    "XTest requires Linux",
  );
  assert.equal(ownedProfile, true, "XTest requires caller-owned profile");
  assert.match(
    display ?? "",
    /^:\d+(?:\.\d+)?$/,
    "Explicit local X11 DISPLAY required",
  );
  assert.ok(
    Number.isSafeInteger(source?.pid) && source.pid > 0,
    "Verified caller PID required",
  );
  assert.match(source.executableSha256 ?? "", /^[a-f0-9]{64}$/);
  const pid = source.pid;
  const xdo =
    io.xdo ??
    (async (args) =>
      (
        await execFileAsync("xdotool", args, {
          env: { ...process.env, DISPLAY: display },
          timeout: 5000,
          maxBuffer: 128 * 1024,
        })
      ).stdout.trim());
  const readOwner =
    io.readOwner ??
    (async (withHash = false) => {
      const proc = `/proc/${pid}`,
        start = (s) => writer362ProcStartTime(s, pid);
      const first = start(await readFile(proc + "/stat", "utf8")),
        executable = await realpath(proc + "/exe"),
        info = await stat(proc + "/exe");
      const identity = [info.dev, info.ino, info.size, info.mtimeMs].join(":");
      const sha256 = withHash ? hash(await readFile(proc + "/exe")) : undefined;
      assert.equal(
        start(await readFile(proc + "/stat", "utf8")),
        first,
        "Caller PID changed while observing",
      );
      assert.equal(
        await realpath(proc + "/exe"),
        executable,
        "Caller executable changed while observing",
      );
      const after = await stat(proc + "/exe");
      assert.equal(
        [after.dev, after.ino, after.size, after.mtimeMs].join(":"),
        identity,
        "Caller executable identity changed",
      );
      return {
        pid,
        startTime: first,
        executable,
        identity,
        ...(sha256 ? { sha256 } : {}),
      };
    });
  const evidence = {
    backend: "x11-xtest",
    pid,
    display,
    activationPerformed: false,
    checks: [],
    keys: [],
  };
  let binding, xid;
  const owner = async () => {
    assert.ok(binding && xid, "XTest foreground binding is not initialized");
    signal?.throwIfAborted();
    const current = await readOwner(false);
    assert.equal(current.pid, pid);
    assert.equal(
      current.startTime,
      binding.startTime,
      "Caller PID starttime changed",
    );
    assert.equal(
      current.executable,
      binding.executable,
      "Caller executable changed",
    );
    assert.equal(
      current.identity,
      binding.identity,
      "Caller executable identity changed",
    );
    assert.equal(
      (await xdo(["getwindowpid", xid])).trim(),
      String(pid),
      "X11 window no longer belongs to caller PID",
    );
    return current;
  };
  const verify = async (stage) => {
    const process = await owner(),
      windowFocus = (await xdo(["getwindowfocus"])).trim(),
      dom = await observe();
    const observation = {
      stage,
      at: new Date().toISOString(),
      process,
      windowFocus,
      dom,
    };
    evidence.checks.push(observation);
    assert.equal(windowFocus, xid, "Owned X11 window lost foreground");
    assert.equal(dom.hasFocus, true, "Native document lacks focus");
    assert.equal(dom.hidden, false, "Native document is hidden");
    assert.equal(
      dom.visibilityState,
      "visible",
      "Native document is not visible",
    );
    return observation;
  };
  return {
    evidence,
    verify,
    async initialize() {
      signal?.throwIfAborted();
      binding = await readOwner(true);
      assert.equal(binding.pid, pid);
      assert.equal(
        binding.sha256,
        source.executableSha256,
        "Caller executable hash mismatch",
      );
      evidence.binding = binding;
      const windows = [
        ...new Set(
          (await xdo(["search", "--onlyvisible", "--pid", String(pid)]))
            .trim()
            .split(/\s+/)
            .filter(Boolean),
        ),
      ];
      assert.equal(
        windows.length,
        1,
        "Exactly one visible caller window required",
      );
      xid = windows[0];
      assert.match(xid, /^[1-9]\d*$/);
      evidence.xid = xid;
      await owner();
      let windowFocus = null,
        windowFocusError;
      try {
        windowFocus = (await xdo(["getwindowfocus"])).trim();
      } catch (error) {
        windowFocusError = String(error);
      }
      evidence.pre = {
        windowFocus,
        ...(windowFocusError ? { windowFocusError } : {}),
        dom: await observe(),
      };
      if (evidence.pre.windowFocus !== xid || !evidence.pre.dom.hasFocus) {
        await owner();
        evidence.activationPerformed = true;
        await xdo(["windowfocus", "--sync", xid]);
      }
      evidence.post = await verify("foreground postcondition");
      return evidence;
    },
    async press(values) {
      const chord = writer362XTestChord(values);
      await verify("before XTest " + chord);
      const action = {
        chord,
        at: new Date().toISOString(),
        args: ["key", "--clearmodifiers", chord],
      };
      evidence.keys.push(action);
      await xdo(action.args);
      action.post = await verify("after XTest " + chord);
    },
  };
}

// Observations may read DOM state; input uses native W3C or opt-in XTest.
// Reject interaction/mutation forms before they can reach the native webview.
function assertReadOnlyObservation(script) {
  assert.equal(
    typeof script,
    "string",
    "Read-only DOM observation script required",
  );
  const mutatingMethods =
    "focus|blur|click|select|setSelectionRange|setRangeText|dispatchEvent|setAttribute|removeAttribute|append|appendChild|prepend|replaceChildren|replaceChild|removeChild|remove|replaceWith|insertBefore|insertAdjacentHTML|insertAdjacentText|insertAdjacentElement|before|after|write|writeln|showPopover|hidePopover|showModal|requestFullscreen|exitFullscreen|scroll|scrollTo|scrollBy|scrollIntoView|setProperty|removeProperty|setItem|removeItem|clear|invoke|execute";
  const call = String.raw`\s*(?:\?\.)?\s*\(`;
  assert.doesNotMatch(
    script,
    new RegExp(String.raw`\.(?:${mutatingMethods})${call}`),
    "Read-only DOM observation cannot invoke scripted interaction or mutation",
  );
  assert.doesNotMatch(
    script,
    new RegExp(String.raw`\[\s*["'](?:${mutatingMethods})["']\s*\]${call}`),
    "Read-only DOM observation cannot invoke computed scripted interaction or mutation",
  );
  const assignment = String.raw`\s*(?:(?:[+*/%&|^-]|&&|\|\||\?\?)?=(?!=)|\+\+|--)`;
  const mutableProperties =
    "innerHTML|outerHTML|innerText|textContent|value|disabled|checked|selected|tabIndex|scrollTop|scrollLeft|className|ariaExpanded|ariaPressed";
  assert.doesNotMatch(
    script,
    new RegExp(String.raw`\.(?:${mutableProperties})${assignment}`),
    "Read-only DOM observation cannot assign DOM state",
  );
  assert.doesNotMatch(
    script,
    new RegExp(
      String.raw`\[\s*["'](?:${mutableProperties})["']\s*\]${assignment}`,
    ),
    "Read-only DOM observation cannot assign computed DOM state",
  );
  assert.doesNotMatch(
    script,
    new RegExp(
      String.raw`\.(?:style|dataset)(?:\.[\w$]+|\[[^\]]+\])${assignment}`,
    ),
    "Read-only DOM observation cannot change style or dataset",
  );
  assert.doesNotMatch(
    script,
    /\.classList\.(?:add|remove|toggle|replace)\s*\(|\b(?:Object\.assign|Reflect\.set)\s*\(|\bdelete\s+/,
    "Read-only DOM observation cannot mutate DOM properties",
  );
}

/** Deliberately cannot create/delete sessions, navigate URLs or invoke native IPC. */
export function createWriter362Transport({
  endpoint,
  sessionId,
  signal,
  timeoutMs = 15_000,
}) {
  const url = new URL(endpoint);
  assert.equal(url.protocol, "http:");
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "Loopback driver only",
  );
  assert.ok(!url.username && !url.password && !url.search && !url.hash);
  assert.match(sessionId, /^[a-zA-Z0-9_-]+$/);
  assert.ok(
    Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000,
  );
  return async function command(method, suffix, body) {
    const allowed =
      (method === "GET" && ["/screenshot", "/window/rect"].includes(suffix)) ||
      (method === "POST" &&
        (["/execute/sync", "/element", "/actions", "/window/rect"].includes(
          suffix,
        ) ||
          /^\/element\/[a-zA-Z0-9_-]+\/click$/.test(suffix))) ||
      (method === "DELETE" && suffix === "/actions");
    assert.ok(allowed, `Unsupported session command: ${method} ${suffix}`);
    if (method === "POST" && suffix === "/execute/sync")
      assertReadOnlyObservation(body?.script);
    // WebKitGTK requires a JSON object even for parameterless element clicks.
    if (method === "POST" && suffix.endsWith("/click") && body === undefined)
      body = {};
    const response = await fetch(
      `${url.href.replace(/\/$/, "")}/session/${sessionId}${suffix}`,
      {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      },
    );
    const result = await response.json();
    if (!response.ok || result.value?.error)
      throw new Error(JSON.stringify(result.value ?? result));
    assert.ok(Object.hasOwn(result, "value"), "Expected W3C value envelope");
    return result.value;
  };
}

/** Caller opens this fixture through its normal native document-opening route. */
export async function createWriter362Fixture({
  templatePath,
  outDir,
  protectedDocument = false,
}) {
  await mkdir(outDir, { recursive: true });
  const parts = unzipSync(await readFile(templatePath));
  const xml = strFromU8(parts["word/document.xml"]);
  const cell = (text) =>
    `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid>${[
    ["Alpha", "Beta", "Gamma"],
    ["One", "Two", "Three"],
  ]
    .map(
      (row) =>
        `<w:tr><w:trPr><w:tblHeader/></w:trPr>${row.map(cell).join("")}</w:tr>`,
    )
    .join("")}</w:tbl><w:p/>`;
  const next = xml.replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`);
  assert.notEqual(next, xml, "Known synthetic fixture construction");
  parts["word/document.xml"] = strToU8(next);
  if (protectedDocument) {
    const settings = strFromU8(parts["word/settings.xml"]);
    assert.ok(settings.includes("</w:settings>"));
    parts["word/settings.xml"] = strToU8(
      settings.replace(
        "</w:settings>",
        '<w:documentProtection w:edit="readOnly" w:enforcement="1"/></w:settings>',
      ),
    );
  }
  const bytes = Buffer.from(zipSync(parts));
  const path = resolve(
    outDir,
    protectedDocument ? "writer362-protected.docx" : "writer362-table.docx",
  );
  await writeFile(path, bytes, { flag: "wx" });
  return { path, sha256: hash(bytes), protectedDocument };
}

function geometry(groupName) {
  const visible = (e) =>
    !!e?.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
  const group = [
    ...document.querySelectorAll('.ribbon-groep[role="group"]'),
  ].find((e) => e.getAttribute("aria-label") === groupName && visible(e));
  if (!group) return null;
  const content = group.querySelector(":scope > .ribbon-groep-inhoud");
  if (!visible(content)) return null;
  const box = (e) => {
    const r = e.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  };
  const bounds = box(content),
    horizontal = content.hasAttribute("data-open") ? bounds : box(group);
  const caption = box(group.querySelector(":scope > .ribbon-groep-naam"));
  return {
    level: group.dataset.niveau ?? "0",
    bounds,
    caption,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    buttons: [...content.querySelectorAll("button.ribbon-actie")]
      .filter(visible)
      .map((button) => {
        const r = box(button),
          css = getComputedStyle(button),
          focusVisible = button.matches(":focus-visible");
        const ring =
          focusVisible && css.outlineStyle !== "none"
            ? Math.max(
                0,
                parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset),
              )
            : 0;
        const fits = (element) => {
          if (!visible(element)) return false;
          const c = box(element);
          return (
            c.top >= r.top - 0.5 &&
            c.bottom <= r.bottom + 0.5 &&
            c.left >= r.left - 0.5 &&
            c.right <= r.right + 0.5 &&
            element.scrollWidth <= element.clientWidth + 1
          );
        };
        return {
          name: button.getAttribute("aria-label"),
          ...r,
          disabled: button.disabled,
          active: button.getAttribute("aria-pressed") === "true",
          hovered: button.matches(":hover"),
          focusVisible,
          ring,
          borderColor: css.borderColor,
          borderWidth: css.borderWidth,
          labelVisible: visible(button.querySelector("span")),
          labelFits: fits(button.querySelector("span")),
          iconFits: fits(button.querySelector("svg")),
          clipped:
            r.top - ring < bounds.top - 0.5 ||
            r.bottom + ring > bounds.bottom + 0.5 ||
            r.left - ring < horizontal.left - 0.5 ||
            r.right + ring > horizontal.right + 0.5,
        };
      }),
  };
}

/** Serializable read-only DOM measurement; also tested independently of a host. */
export function writer362GroupTriggerGeometry(groupName) {
  const group = [
    ...document.querySelectorAll('.ribbon-groep[role="group"]'),
  ].find(
    (e) =>
      e.getAttribute("aria-label") === groupName && e.getClientRects().length,
  );
  const button = group?.querySelector(":scope > .ribbon-groep-knop");
  if (!button?.getClientRects().length) return null;
  const rect = button.getBoundingClientRect(),
    css = getComputedStyle(button);
  const focusVisible = button.matches(":focus-visible");
  const ring =
    focusVisible && css.outlineStyle !== "none"
      ? Math.max(
          0,
          parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset),
        )
      : 0;
  const outline = {
    top: rect.top - ring,
    bottom: rect.bottom + ring,
    left: rect.left - ring,
    right: rect.right + ring,
  };
  const clippingAncestors = [];
  for (
    let parent = button.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent),
      bounds = parent.getBoundingClientRect();
    const clipX = ["auto", "scroll", "hidden", "clip"].includes(
        style.overflowX,
      ),
      clipY = ["auto", "scroll", "hidden", "clip"].includes(style.overflowY);
    if (!clipX && !clipY) continue;
    const clip = {
      top: bounds.top + parent.clientTop,
      left: bounds.left + parent.clientLeft,
    };
    clip.bottom = clip.top + parent.clientHeight;
    clip.right = clip.left + parent.clientWidth;
    const clippedY =
      clipY &&
      (outline.top < clip.top - 0.5 || outline.bottom > clip.bottom + 0.5);
    const clippedX =
      clipX &&
      (outline.left < clip.left - 0.5 || outline.right > clip.right + 0.5);
    clippingAncestors.push({
      className: parent.className,
      clip,
      clipX,
      clipY,
      clippedX,
      clippedY,
      clipped: clippedX || clippedY,
    });
  }
  return {
    focused: document.activeElement === button,
    focusVisible,
    ring,
    outline,
    clippingAncestors,
    clippedX: clippingAncestors.some((a) => a.clippedX),
    clippedY: clippingAncestors.some((a) => a.clippedY),
    clipped: clippingAncestors.some((a) => a.clipped),
  };
}

/** Same selected-panel canvas/viewport conversion as the proven #361 driver. */
export function writer362SelectedCanvasPoint(x, y) {
  const tabs = [
    ...document.querySelectorAll(".office-tab[role=tab][aria-selected=true]"),
  ];
  if (tabs.length !== 1) return null;
  const panelId = tabs[0].getAttribute("aria-controls"),
    panel = document.getElementById(panelId);
  if (!panel || panel.closest("[hidden],[inert]")) return null;
  const canvas = [...panel.querySelectorAll(".canvas-page canvas")].find(
    (e) => e.getClientRects().length && e.width > 0 && e.height > 0,
  );
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
  return {
    panelId,
    point: { x: Math.round(r.x + x), y: Math.round(r.y + y) },
    canvas: { x: r.x, y: r.y, width: r.width, height: r.height },
  };
}

export function writer362NativeCanvasActions(point) {
  return {
    actions: [
      {
        type: "pointer",
        id: "writer362-pointer",
        parameters: { pointerType: "mouse" },
        actions: [
          {
            type: "pointerMove",
            duration: 0,
            origin: "viewport",
            x: point.x,
            y: point.y,
          },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  };
}

/** Read-only hit test: a narrow tab's center can be covered by the collapse button. */
export function writer362NativeTabPoint(name) {
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter(
    (e) => e.textContent === name,
  );
  if (tabs.length !== 1 || !tabs[0].id) return null;
  const tab = tabs[0],
    r = tab.getBoundingClientRect();
  const left = Math.max(0, Math.ceil(r.left + 2));
  const right = Math.min(innerWidth - 1, Math.floor(r.right - 2));
  const y = Math.round((r.top + r.bottom) / 2);
  if (right < left || y < 0 || y >= innerHeight) return null;
  const xs = [Math.round((left + right) / 2)];
  for (let x = left; x <= right; x += 2) xs.push(x);
  for (const x of xs) {
    const hit = document.elementFromPoint(x, y);
    if (hit === tab || (hit && tab.contains(hit)))
      return {
        id: tab.id,
        point: { x, y },
        bounds: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      };
  }
  return null;
}

/** Read-only diagnostics saved before cleanup when initial table context fails. */
export function writer362NativeAnatomy() {
  const rect = (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const f = document.activeElement;
  return {
    hasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
    hidden: document.hidden,
    focus: {
      tag: f?.tagName,
      id: f?.id,
      role: f?.getAttribute("role"),
      label: f?.getAttribute("aria-label"),
      className: f?.className,
    },
    fonts: document.fonts.status,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    ribbonTabs: [...document.querySelectorAll(".ribbon [role=tab]")].map(
      (e) => ({
        rawText: e.textContent,
        trimmedText: e.textContent.trim(),
        selected: e.getAttribute("aria-selected"),
        visible: !!e.getClientRects().length,
      }),
    ),
    documentTabs: [...document.querySelectorAll(".office-tab[role=tab]")].map(
      (e) => ({
        rawText: e.textContent,
        trimmedText: e.textContent.trim(),
        selected: e.getAttribute("aria-selected"),
        controls: e.getAttribute("aria-controls"),
      }),
    ),
    panels: [...document.querySelectorAll(".office-tabpaneel")].map((p) => ({
      id: p.id,
      blocked: !!p.closest("[hidden],[inert]"),
      tables: [...p.querySelectorAll("[role=table]")].map((t) => ({
        rows: t.getAttribute("aria-rowcount"),
        columns: t.getAttribute("aria-colcount"),
        cells: [
          ...t.querySelectorAll(
            "[role=columnheader],[role=rowheader],[role=cell]",
          ),
        ].map((c) => c.textContent),
      })),
      canvases: [...p.querySelectorAll(".canvas-page canvas")].map((c) => ({
        width: c.width,
        height: c.height,
        rect: rect(c),
      })),
    })),
    inputPortals: [...document.querySelectorAll("[data-testid=yrs-input]")].map(
      (e) => ({
        tag: e.tagName,
        parent: e.parentElement?.tagName,
        panel: e.closest("[role=tabpanel]")?.id ?? null,
        rect: rect(e),
      }),
    ),
  };
}

/**
 * Requires a disposable profile and the supplied fixture already open in English.
 * source hashes must come from the caller's verified installed-package binding.
 * Retains fixture/report/screenshots; restores theme/rect/tab and releases actions.
 * Never deletes the caller's session, files, processes or document tabs.
 */
export async function runWriter362NativeProbe({
  endpoint,
  sessionId,
  outDir,
  source,
  fixture,
  ownedProfile,
  signal,
  inputBackend = "w3c",
  keyboardEntry = "arrow-down",
  capture,
}) {
  assert.equal(
    process.platform,
    "linux",
    "Native Linux probe only; protocol tests are separate",
  );
  assert.equal(ownedProfile, true, "Disposable caller-owned profile required");
  assert.ok(
    ["w3c", "x11-xtest"].includes(inputBackend),
    "Unsupported native input backend",
  );
  const entryKeys = writer362KeyboardEntryKeys(keyboardEntry);
  assert.ok(capture === undefined || typeof capture === "function");
  for (const field of ["commit", "tree"])
    assert.match(source?.[field] ?? "", /^[a-f0-9]{40}$/);
  for (const field of ["packageSha256", "executableSha256"])
    assert.match(source?.[field] ?? "", /^[a-f0-9]{64}$/);
  const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  assert.equal(source.commit, git("rev-parse", "HEAD"));
  assert.equal(source.tree, git("rev-parse", "HEAD^{tree}"));
  assert.equal(
    git("status", "--porcelain"),
    "",
    "Pinned clean harness/source required",
  );
  assert.equal(hash(await readFile(fixture.path)), fixture.sha256);
  const output = resolve(outDir);
  await mkdir(output, { recursive: true });
  const report = {
    issue: 362,
    source,
    fixture,
    harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    platform: "Linux installed Tauri / WebKitGTK",
    inputBackend,
    keyboardEntry,
    status: "running",
    nativePass: false,
    startedAt: new Date().toISOString(),
    cases: [],
    groupButtonCases: [],
    keyboardEntries: [],
    toolbarNavigation: [],
    screenshotBackend: capture ? "caller-owned X11" : "WebDriver",
    unavailable: [],
    cleanup: [],
    limits: [
      "Caller owns and verifies installed package/source binding",
      "Virtual X11 evidence does not certify physical hardware or Windows/macOS",
      "No synthesized disabled/active attributes and no command mutation",
      "#362 group-trigger acceptance checks vertical clipping only. Raw horizontal and combined clipping remain recorded; the existing narrow horizontal scroll route is outside this issue's scope.",
      "XTest opt-in is distinct native input evidence; any earlier W3C focus-visible failure remains unexplained and is not relabelled as passed.",
      "Optional Tab entry certifies only its recorded native Tab route. Prior ArrowDown :focus-visible failures remain unexplained; no general native-focus verdict is implied.",
    ],
  };
  const runSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(600_000)])
    : AbortSignal.timeout(600_000);
  const request = createWriter362Transport({
    endpoint,
    sessionId,
    signal: runSignal,
  });
  const cleanupRequest = createWriter362Transport({
    endpoint,
    sessionId,
    timeoutMs: 5_000,
  });
  let xtest;
  const inputRequest = async (send, method, suffix, body) => {
    if (
      xtest &&
      method === "POST" &&
      (suffix === "/actions" ||
        suffix === "/window/rect" ||
        suffix.endsWith("/click"))
    )
      await xtest.verify("before W3C " + suffix);
    return send(method, suffix, body);
  };
  const command = (...args) => inputRequest(request, ...args);
  const cleanupCommand = (...args) => inputRequest(cleanupRequest, ...args);
  const evaluate = (fn, ...args) =>
    command("POST", "/execute/sync", {
      script: `return (${fn.toString()})(...arguments)`,
      args,
    });
  const press = (...values) =>
    inputBackend === "x11-xtest"
      ? xtest.press(values)
      : command("POST", "/actions", {
          actions: [
            {
              type: "key",
              id: "writer362-keyboard",
              actions: [
                ...values.map((value) => ({ type: "keyDown", value })),
                ...values
                  .toReversed()
                  .map((value) => ({ type: "keyUp", value })),
              ],
            },
          ],
        });
  const find = async (selector) =>
    (
      await command("POST", "/element", {
        using: "css selector",
        value: selector,
      })
    )[elementKey];
  const click = async (selector) =>
    command("POST", `/element/${await find(selector)}/click`);
  const waitFor = async (fn, description) => {
    const end = Date.now() + 10_000;
    while (Date.now() < end) {
      runSignal.throwIfAborted();
      if (await fn()) return;
      await delay(80, undefined, { signal: runSignal });
    }
    throw new Error(description);
  };
  const screenshot = async (name) => {
    const path = join(output, `${name}.png`);
    if (capture) {
      const receipt = await capture(path);
      (report.screenshots ??= []).push({ name, ...receipt });
    } else {
      await writeFile(
        path,
        Buffer.from(await command("GET", "/screenshot"), "base64"),
      );
    }
  };
  let original, rect;
  try {
    original = await evaluate(() => ({
      native: typeof window.__TAURI_INTERNALS__?.invoke === "function",
      bridge: Boolean(
        window.__writerApis || window.__writerWarmup || window.__writerSpelling,
      ),
      theme: document.querySelector(".office")?.dataset.officeThema,
      tab: document.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent,
      preference: localStorage.getItem("openaec-office-instellingen"),
      ua: navigator.userAgent,
    }));
    assert.ok(
      original.native && !original.bridge,
      "Actual production Tauri webview without diagnostic editor bridge",
    );
    assert.ok(["light", "forge"].includes(original.theme));
    report.runtime = original;
    rect = await command("GET", "/window/rect");
    if (inputBackend === "x11-xtest") {
      xtest = createWriter362XTestInput({
        source,
        ownedProfile,
        display: process.env.DISPLAY,
        signal: runSignal,
        observe: () =>
          cleanupRequest("POST", "/execute/sync", {
            script: `return (${writer362DocumentFocus.toString()})()`,
            args: [],
          }),
      });
      report.x11Input = xtest.evidence;
      await xtest.initialize();
    }
    const setTheme = async (theme) => {
      if (
        (await evaluate(
          () => document.querySelector(".office")?.dataset.officeThema,
        )) !== theme
      )
        await click(".office-themaknop");
      await waitFor(
        () =>
          evaluate(
            (value) =>
              document.querySelector(".office")?.dataset.officeThema === value,
            theme,
          ),
        "Theme did not update",
      );
    };
    const selectTab = async (name) => {
      const target = await evaluate(writer362NativeTabPoint, name);
      assert.ok(target, `No unobscured native pointer point on tab: ${name}`);
      (report.tabPointerTargets ??= []).push({ name, ...target });
      await command(
        "POST",
        "/actions",
        writer362NativeCanvasActions(target.point),
      );
      await waitFor(
        () =>
          evaluate(
            (id) =>
              document.getElementById(id)?.getAttribute("aria-selected") ===
              "true",
            target.id,
          ),
        `Native pointer did not select tab: ${name}`,
      );
    };
    // Select the top table with the exact native pointer recipe used by #361,
    // rather than element/click's center of the entire document canvas.
    try {
      let target;
      await waitFor(
        async () =>
          Boolean(
            (target = await evaluate(writer362SelectedCanvasPoint, 145, 110)),
          ),
        "Selected document canvas unavailable",
      );
      report.pointerTargets = [
        { at: new Date().toISOString(), offset: { x: 145, y: 110 }, ...target },
      ];
      await command(
        "POST",
        "/actions",
        writer362NativeCanvasActions(target.point),
      );
      await press(keys.control, keys.home);
      await waitFor(
        () =>
          evaluate(() =>
            [...document.querySelectorAll('[role="tab"]')].some(
              (e) => e.textContent === "Table Design",
            ),
          ),
        "Fixture table context unavailable",
      );
    } catch (error) {
      report.fixtureContextFailure = {
        error: String(error),
        anatomy: await evaluate(writer362NativeAnatomy).catch((e) => ({
          readError: String(e),
        })),
      };
      await writeFile(
        join(output, "fixture-context-anatomy.json"),
        JSON.stringify(report.fixtureContextFailure, null, 2),
      );
      await screenshot("fixture-context-gate-failure").catch(() => {});
      throw error;
    }
    for (const theme of ["light", "forge"]) {
      await setTheme(theme);
      for (const width of [1600, 923, 800]) {
        await command("POST", "/window/rect", { width, height: 1000 });
        await delay(150, undefined, { signal: runSignal });
        const viewport = await evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        }));
        if (width <= 923 && viewport.width > 1000) {
          report.unavailable.push({
            theme,
            requestedWidth: width,
            reason: "Native window did not enter narrow route",
            viewport,
          });
          continue;
        }
        for (const tab of ["Insert", "Table Design"]) {
          await selectTab(tab);
          for (const groupName of tab === "Insert"
            ? ["Text"]
            : ["Alignment", "Data", "Delete"]) {
            const selector = `.ribbon-groep[aria-label=${JSON.stringify(groupName)}]`;
            const collapsed = await evaluate(
              (s) => document.querySelector(s)?.dataset.niveau === "2",
              selector,
            );
            await selectTab(tab);
            const entry = {
              theme,
              requestedWidth: width,
              tab,
              group: groupName,
              inputBackend,
              keyboardEntry,
              keys: entryKeys.map((k) =>
                k === keys.tab ? "Tab" : "ArrowDown",
              ),
              pre: await evaluate(writer362DocumentFocus),
              traversalRightKeys: 0,
            };
            report.keyboardEntries.push(entry);
            for (const key of entryKeys) await press(key);
            await waitFor(
              () =>
                evaluate(() =>
                  Boolean(document.activeElement?.closest(".ribbon-baan")),
                ),
              "Selected tab did not finish moving focus into the toolbar",
            );
            entry.post = await evaluate(writer362DocumentFocus);
            if (keyboardEntry === "tab")
              assert.equal(
                entry.post.activeElement.focusVisible,
                true,
                "Tab entry: keyboard focus visible",
              );
            if (groupName === "Text" || groupName === "Alignment") {
              const order = await evaluate(() =>
                [
                  ...document.querySelectorAll(
                    ".ribbon-baan button, .ribbon-baan input, .ribbon-baan select",
                  ),
                ]
                  .filter(
                    (e) =>
                      !e.disabled &&
                      e.tabIndex >= 0 &&
                      e.getClientRects().length &&
                      !e.closest("[inert],[aria-hidden=true]"),
                  )
                  .map(
                    (e) => e.getAttribute("aria-label") || e.textContent.trim(),
                  ),
              );
              assert.ok(order.length);
              for (const [key, expected] of [
                [keys.home, order[0]],
                [keys.end, order.at(-1)],
                [keys.home, order[0]],
              ]) {
                await press(key);
                const actual = await evaluate(() => {
                  const e = document.activeElement,
                    s = getComputedStyle(e);
                  return {
                    name: e.getAttribute("aria-label") || e.textContent.trim(),
                    focusVisible: e.matches(":focus-visible"),
                    ring:
                      parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset),
                  };
                });
                report.toolbarNavigation.push({
                  theme,
                  requestedWidth: width,
                  tab,
                  key: key === keys.home ? "Home" : "End",
                  expected,
                  ...actual,
                });
                assert.equal(
                  actual.name,
                  expected,
                  "Real Home/End selects the toolbar boundary",
                );
                assert.equal(
                  actual.focusVisible,
                  true,
                  "Real Home/End keeps visible keyboard focus",
                );
                assert.equal(
                  actual.ring,
                  4,
                  "Real Home/End keeps the full 4px outline extent",
                );
              }
            }
            if (collapsed && groupName === "Delete") await press(keys.end);
            let reached = false;
            for (let step = 0; step < 100; step++) {
              reached = await evaluate(
                (s, collapsed) => {
                  const g = document.querySelector(s);
                  return collapsed
                    ? document.activeElement ===
                        g?.querySelector(":scope > .ribbon-groep-knop")
                    : g?.contains(document.activeElement);
                },
                selector,
                collapsed,
              );
              if (reached) break;
              await press(keys.right);
              entry.traversalRightKeys++;
            }
            assert.ok(reached, `${groupName}: keyboard route`);
            const measureGroupTrigger = async (phase) => {
              const data = await evaluate(
                writer362GroupTriggerGeometry,
                groupName,
              );
              assert.ok(data, `${groupName}: collapsed group trigger exists`);
              report.groupButtonCases.push({
                theme,
                requestedWidth: width,
                tab,
                group: groupName,
                phase,
                keyboardEntry,
                navigation:
                  groupName === "Delete"
                    ? `${entry.keys.join(" → ")} → End`
                    : `${entry.keys.join(" → ")} → ArrowRight`,
                ...data,
              });
              await screenshot(`${theme}-${width}-${groupName}-${phase}`);
              assert.ok(
                data.focused && data.focusVisible,
                `${groupName}: actual keyboard focus`,
              );
              assert.equal(
                data.ring,
                4,
                `${groupName}: full outline plus offset`,
              );
              assert.ok(
                data.clippingAncestors.some((a) =>
                  String(a.className).includes("ribbon-baan"),
                ),
                "Actual clipping track measured",
              );
              assert.equal(
                data.clippedY,
                false,
                `${groupName}: group trigger focus must fit vertically inside all clipping ancestors`,
              );
            };
            if (collapsed) {
              await measureGroupTrigger("keyboard-group-focus");
              await press(keys.enter);
            }
            await waitFor(
              () => evaluate(geometry, groupName),
              `${groupName}: content unavailable`,
            );
            const measure = async (phase) => {
              const data = await evaluate(geometry, groupName);
              assert.ok(data);
              report.cases.push({
                theme,
                requestedWidth: width,
                tab,
                group: groupName,
                phase,
                ...data,
              });
              assert.deepEqual(
                data.buttons.map((b) => b.name).sort(),
                [...groups[groupName]].sort(),
              );
              assert.deepEqual(
                data.buttons.filter((b) => b.clipped || !b.iconFits),
                [],
                `${groupName}: controls/icons must fit`,
              );
              if (!collapsed)
                assert.ok(
                  data.bounds.bottom <= data.caption.top + 0.5,
                  `${groupName}: caption remains outside content`,
                );
              if (groupName === "Delete")
                for (const name of ["Delete Row", "Delete Column"])
                  assert.ok(
                    data.buttons.find((b) => b.name === name)?.labelFits,
                    `${name}: full label without tooltip`,
                  );
              return data;
            };
            const normal = await measure("normal");
            await screenshot(`${theme}-${width}-${groupName}-normal`);
            if (groupName === "Alignment" || groupName === "Data") {
              const name =
                groupName === "Alignment" ? "Bottom" : "Repeat Header Rows";
              if (normal.buttons.find((b) => b.name === name)?.active) {
                await measure("imported-active");
                await screenshot(`${theme}-${width}-${groupName}-active`);
              } else
                report.unavailable.push({
                  theme,
                  width,
                  group: groupName,
                  state: "active",
                  reason: `${name} not active after native import`,
                });
            }
            const enabled = normal.buttons
                .filter((b) => !b.disabled)
                .map((b) => b.name),
              visited = new Set();
            for (
              let step = 0;
              step < 100 && !enabled.every((name) => visited.has(name));
              step++
            ) {
              const active = await evaluate(() => ({
                name: document.activeElement?.getAttribute("aria-label"),
                focused: document.activeElement?.matches(":focus-visible"),
              }));
              if (enabled.includes(active.name)) {
                report.firstKeyboardFocus ??= {
                  theme,
                  width,
                  group: groupName,
                  inputBackend,
                  keyboardEntry,
                  ...active,
                  document: await evaluate(writer362DocumentFocus),
                };
                assert.ok(
                  active.focused,
                  `${active.name}: keyboard focus visible`,
                );
                visited.add(active.name);
                const focused = await measure("keyboard-focus");
                assert.equal(
                  focused.buttons.find((b) => b.name === active.name)?.ring,
                  4,
                  `${active.name}: full 4px focus outline`,
                );
              }
              if (!enabled.every((name) => visited.has(name)))
                await press(keys.right);
            }
            assert.ok(
              enabled.every((name) => visited.has(name)),
              `${groupName}: all enabled commands keyboard reachable`,
            );
            report.cases.at(-1).keyboardVisited = [...visited];
            await screenshot(`${theme}-${width}-${groupName}-focus`);
            for (const name of enabled) {
              const target = await find(
                `${selector} button.ribbon-actie[aria-label=${JSON.stringify(name)}]`,
              );
              await command("POST", "/actions", {
                actions: [
                  {
                    type: "pointer",
                    id: "writer362-pointer",
                    parameters: { pointerType: "mouse" },
                    actions: [
                      {
                        type: "pointerMove",
                        duration: 0,
                        origin: { [elementKey]: target },
                        x: 0,
                        y: 0,
                      },
                    ],
                  },
                ],
              });
              const hovered = await measure("hover");
              assert.ok(
                hovered.buttons.find((b) => b.name === name)?.hovered,
                `${name}: actual pointer hover`,
              );
            }
            if (normal.buttons.some((b) => b.disabled))
              await measure("engine-disabled");
            if (
              groupName === "Delete" &&
              !normal.buttons
                .filter((b) => ["Delete Row", "Delete Column"].includes(b.name))
                .every((b) => b.disabled)
            )
              report.unavailable.push({
                theme,
                width,
                group: groupName,
                state: "disabled",
                reason:
                  "Real imported table exposes enabled Delete commands; no supported Writer readonly mode was invoked",
              });
            await screenshot(`${theme}-${width}-${groupName}`);
            if (collapsed) {
              await press(keys.escape);
              assert.ok(
                await evaluate(
                  (s) =>
                    document.activeElement ===
                    document
                      .querySelector(s)
                      ?.querySelector(":scope > .ribbon-groep-knop"),
                  selector,
                ),
                "Escape restores group-button focus",
              );
              await measureGroupTrigger("keyboard-group-after-escape");
            }
          }
        }
      }
    }
    report.status = report.unavailable.length ? "partial" : "passed";
    report.nativePass = report.status === "passed";
  } catch (error) {
    report.status = "failed";
    report.error = String(error.stack ?? error);
    report.failureAnatomy = await cleanupRequest("POST", "/execute/sync", {
      script: `return (${writer362NativeAnatomy.toString()})()`,
      args: [],
    }).catch((e) => ({ readError: String(e) }));
    await writeFile(
      join(output, "failure-anatomy.json"),
      JSON.stringify(report.failureAnatomy, null, 2),
    );
    await (
      capture
        ? capture(join(output, "failure.png"))
        : cleanupRequest("GET", "/screenshot").then((data) =>
            writeFile(join(output, "failure.png"), Buffer.from(data, "base64")),
          )
    ).catch((e) => {
      report.failureScreenshotError = String(e);
    });
    throw error;
  } finally {
    const clean = async (label, task) => {
      try {
        await task();
        report.cleanup.push({ label, status: "fulfilled" });
      } catch (error) {
        report.cleanup.push({
          label,
          status: "rejected",
          error: String(error),
        });
        report.nativePass = false;
        if (report.status !== "failed") report.status = "cleanup-failed";
      }
    };
    await clean("release own input actions", () =>
      cleanupCommand("DELETE", "/actions"),
    );
    if (original)
      await clean("restore original theme and tab", async () => {
        const current = await cleanupCommand("POST", "/execute/sync", {
          script:
            "return document.querySelector('.office')?.dataset.officeThema",
          args: [],
        });
        if (current !== original.theme) {
          const e = await cleanupCommand("POST", "/element", {
            using: "css selector",
            value: ".office-themaknop",
          });
          await cleanupCommand("POST", `/element/${e[elementKey]}/click`);
        }
        const tab = await cleanupCommand("POST", "/execute/sync", {
          script:
            "return [...document.querySelectorAll('[role=tab]')].find(e=>e.textContent===arguments[0])",
          args: [original.tab],
        });
        if (tab?.[elementKey])
          await cleanupCommand("POST", `/element/${tab[elementKey]}/click`);
      });
    if (rect)
      await clean("restore window rectangle", () =>
        cleanupCommand("POST", "/window/rect", {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }),
      );
    await clean("fixture remains byte-identical", async () =>
      assert.equal(hash(await readFile(fixture.path)), fixture.sha256),
    );
    report.completedAt = new Date().toISOString();
    await writeFile(
      join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
  }
  return report;
}
