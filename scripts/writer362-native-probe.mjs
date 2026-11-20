/** #362 checks in a caller-owned, installed Linux Tauri session. No app lifecycle. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
};

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
    clippingAncestors.push({
      className: parent.className,
      clip,
      clipX,
      clipY,
      clipped:
        (clipY &&
          (outline.top < clip.top - 0.5 ||
            outline.bottom > clip.bottom + 0.5)) ||
        (clipX &&
          (outline.left < clip.left - 0.5 || outline.right > clip.right + 0.5)),
    });
  }
  return {
    focused: document.activeElement === button,
    focusVisible,
    ring,
    outline,
    clippingAncestors,
    clipped: clippingAncestors.some((a) => a.clipped),
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
}) {
  assert.equal(
    process.platform,
    "linux",
    "Native Linux probe only; protocol tests are separate",
  );
  assert.equal(ownedProfile, true, "Disposable caller-owned profile required");
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
    status: "running",
    nativePass: false,
    startedAt: new Date().toISOString(),
    cases: [],
    groupButtonCases: [],
    unavailable: [],
    cleanup: [],
    limits: [
      "Caller owns and verifies installed package/source binding",
      "Virtual X11 evidence does not certify physical hardware or Windows/macOS",
      "No synthesized disabled/active attributes and no command mutation",
    ],
  };
  const runSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(180_000)])
    : AbortSignal.timeout(180_000);
  const command = createWriter362Transport({
    endpoint,
    sessionId,
    signal: runSignal,
  });
  const cleanupCommand = createWriter362Transport({
    endpoint,
    sessionId,
    timeoutMs: 5_000,
  });
  const evaluate = (fn, ...args) =>
    command("POST", "/execute/sync", {
      script: `return (${fn.toString()})(...arguments)`,
      args,
    });
  const press = (...values) =>
    command("POST", "/actions", {
      actions: [
        {
          type: "key",
          id: "writer362-keyboard",
          actions: [
            ...values.map((value) => ({ type: "keyDown", value })),
            ...values.toReversed().map((value) => ({ type: "keyUp", value })),
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
  const screenshot = async (name) =>
    writeFile(
      join(output, `${name}.png`),
      Buffer.from(await command("GET", "/screenshot"), "base64"),
    );
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
      const selector = await evaluate((name) => {
        const tab = [...document.querySelectorAll('[role="tab"]')].find(
          (e) => e.textContent === name,
        );
        return tab?.id ? `[id=${JSON.stringify(tab.id)}]` : null;
      }, name);
      assert.ok(selector, `Missing English tab: ${name}`);
      await click(selector);
      return selector;
    };
    // Move the real caret into the first table, without engine/editor API access.
    await click(".canvas-page canvas");
    await evaluate(() =>
      [...document.querySelectorAll('[data-testid="yrs-input"]')]
        .find((e) => e.getClientRects().length)
        ?.focus(),
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
          const tabSelector = await selectTab(tab);
          for (const groupName of tab === "Insert"
            ? ["Text"]
            : ["Alignment", "Data", "Delete"]) {
            const selector = `.ribbon-groep[aria-label=${JSON.stringify(groupName)}]`;
            const collapsed = await evaluate(
              (s) => document.querySelector(s)?.dataset.niveau === "2",
              selector,
            );
            await click(tabSelector);
            await press(keys.down);
            await waitFor(
              () =>
                evaluate(() =>
                  Boolean(document.activeElement?.closest(".ribbon-baan")),
                ),
              "Selected tab did not finish moving focus into the toolbar",
            );
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
                navigation:
                  groupName === "Delete"
                    ? "ArrowDown → End"
                    : "ArrowDown → ArrowRight",
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
                data.clipped,
                false,
                `${groupName}: group trigger focus must fit all clipping ancestors`,
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
    await screenshot("failure").catch(() => {});
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
