import { it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, basename, sep, isAbsolute } from "node:path";

const host = vi.hoisted(() => ({ value: "linux" }));
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal()),
  platform: () => host.value,
}));
import { runWriter363NativeLabels } from "./proef-writer-363-native-labels.mjs";

// This is a synthetic W3C protocol server, not a browser or native acceptance run.
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=";
function dom(language = "en", active = "home") {
  const nl = language === "nl",
    style = "Project Body";
  const names = nl
    ? [
        "Stijlenvenster",
        "Nieuwe stijl…",
        `${style} bijwerken`,
        `Stijl wijzigen: ${style}`,
        "Stijlset…",
      ]
    : [
        "Styles pane",
        "New Style…",
        `Update ${style}`,
        `Modify Style: ${style}`,
        "Style Set…",
      ];
  return {
    tauriObject: true,
    tauriInvoke: "function",
    diagnostics: false,
    writerVisible: true,
    language,
    tabs: [
      {
        id: "home",
        name: nl ? "Start" : "Home",
        selected: active === "home",
        visible: true,
      },
      {
        id: "styles",
        name: nl ? "Stijlen" : "Styles",
        selected: active === "styles",
        visible: true,
      },
    ],
    groups: [
      {
        name: nl ? "Stijlen" : "Styles",
        visible: true,
        buttons: names.map((name) => ({
          name,
          title: name,
          text: name,
          visible: true,
          disabled: false,
        })),
      },
    ],
  };
}
async function fixture(run) {
  host.value = "linux";
  const outDir = await mkdtemp(
    join(tmpdir(), "oos-writer363-native-contract-"),
  );
  const state = {
    active: "home",
    language: "en",
    calls: [],
    releaseFails: false,
    restoreFails: false,
    actionFails: false,
    pointBlocked: false,
  };
  const server = createServer(async (req, res) => {
    try {
      let text = "";
      for await (const part of req) text += part;
      const body = text ? JSON.parse(text) : undefined;
      state.calls.push({ method: req.method, path: req.url, body });
      let value;
      if (req.url === "/session/existing/execute/sync") {
        if (body.script.includes("const e=document.getElementById")) {
          if (state.restoreFails && body.args[0] === "home")
            throw new Error("restore failed");
          value = {
            x: body.args[0] === "styles" ? 150 : 50,
            y: 20,
            visible: true,
            inViewport: true,
            hit: !state.pointBlocked,
          };
        } else {
          // The only accepted JS request is the read-only DOM snapshot.
          expect(body.script).not.toMatch(
            /\.click\(|dispatchEvent|localStorage|\.focus\(|__writerApis\./,
          );
          value = dom(state.language, state.active);
          state.mutate?.(value);
        }
      } else if (
        req.url === "/session/existing/actions" &&
        req.method === "POST"
      ) {
        expect(body.actions).toHaveLength(1);
        const pointer = body.actions[0];
        expect(pointer.type).toBe("pointer");
        expect(pointer.actions.map((a) => a.type)).toEqual([
          "pointerMove",
          "pointerDown",
          "pointerUp",
        ]);
        state.active = pointer.actions[0].x === 150 ? "styles" : "home";
        state.onAction?.();
        if (state.actionFails) {
          state.actionFails = false;
          throw new Error("partial action failed");
        }
        value = null;
      } else if (
        req.url === "/session/existing/actions" &&
        req.method === "DELETE"
      ) {
        if (state.releaseFails) throw new Error("release failed");
        value = null;
      } else if (req.url === "/session/existing/screenshot") {
        if (state.screenshotFails) throw new Error("screenshot failed");
        value = png;
      } else throw new Error("Forbidden session/app operation");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ value }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          value: { error: "unknown error", message: error.message },
        }),
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const options = {
    endpoint: `http://127.0.0.1:${server.address().port}`,
    sessionId: "existing",
    outDir,
    ownedProfile: true,
    source: {
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      packageSha256: "c".repeat(64),
      executableSha256: "d".repeat(64),
    },
  };
  try {
    await run({ state, options, server });
  } finally {
    server.closeAllConnections();
    await new Promise((done, reject) =>
      server.close((error) =>
        error && error.code !== "ERR_SERVER_NOT_RUNNING"
          ? reject(error)
          : done(),
      ),
    );
    const rel = relative(resolve(tmpdir()), resolve(outDir));
    expect(
      rel &&
        !isAbsolute(rel) &&
        rel !== ".." &&
        !rel.startsWith(".." + sep) &&
        basename(outDir).startsWith("oos-writer363-native-contract-"),
    ).toBeTruthy();
    await rm(outDir, { recursive: true, force: true });
    host.value = "linux";
  }
}
const reportFile = (options) =>
  join(options.outDir, "writer363-native-labels.json");

for (const language of ["en", "nl"]) {
  it(`reads ${language} labels through the protocol and restores the previous tab`, () =>
    fixture(async ({ state, options }) => {
      state.language = language;
      const report = await runWriter363NativeLabels(options);
      expect(report.status).toBe("passed");
      expect(report.browserOnly).toBe(false);
      expect(report.language).toBe(language);
      expect(report.styleName).toBe("Project Body");
      expect(report.cleanup).toEqual({
        tabRestoreNeeded: true,
        tabRestored: true,
        actionsReleased: true,
      });
      expect(report.delegatedProvenance).toMatchObject({
        ...options.source,
        ownedProfile: true,
      });
      expect(report.delegatedProvenance.verification).toContain(
        "not independently checked",
      );
      expect(state.active).toBe("home");
      expect(
        state.calls.filter(
          (c) => c.method === "POST" && c.path.endsWith("/actions"),
        ),
      ).toHaveLength(2);
      expect(
        state.calls.every((c) => c.path.startsWith("/session/existing/")),
      ).toBe(true);
      expect(JSON.parse(await readFile(reportFile(options), "utf8"))).toEqual(
        report,
      );
      expect(
        await readFile(join(options.outDir, report.screenshot.name)),
      ).toEqual(Buffer.from(png, "base64"));
    }));
}

it("keeps an already selected Styles tab and still uses real pointer actions", () =>
  fixture(async ({ state, options }) => {
    state.active = "styles";
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("passed");
    expect(report.cleanup.tabRestoreNeeded).toBe(false);
    expect(report.cleanup.tabRestored).toBe(true);
    expect(
      state.calls.filter(
        (c) => c.method === "POST" && c.path.endsWith("/actions"),
      ),
    ).toHaveLength(1);
  }));

it("ignores a hidden mounted document's selected ribbon and duplicate group", () =>
  fixture(async ({ state, options }) => {
    state.mutate = (value) => {
      value.tabs.push({
        id: "hidden-home",
        name: "Home",
        selected: true,
        visible: false,
      });
      value.tabs.push({
        id: "hidden-styles",
        name: "Styles",
        selected: false,
        visible: false,
      });
      value.groups.push({
        ...structuredClone(value.groups[0]),
        visible: false,
      });
    };
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("passed");
    expect(report.previousTab.id).toBe("home");
    expect(report.cleanup.tabRestored).toBe(true);
    expect(state.active).toBe("home");
  }));

it("skips unsupported current UI language without changing it or clicking", () =>
  fixture(async ({ state, options }) => {
    state.language = "fr";
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("skipped");
    expect(report.reason).toContain("fr");
    expect(state.calls).toHaveLength(1);
    expect(state.language).toBe("fr");
    expect(report.cleanup.actionsReleased).toBeNull();
  }));

for (const invalid of ["host", "profile", "endpoint", "source"]) {
  it(`fails the ${invalid} gate before contacting the existing session`, () =>
    fixture(async ({ state, options }) => {
      if (invalid === "host") host.value = "win32";
      if (invalid === "profile") options.ownedProfile = false;
      if (invalid === "endpoint")
        options.endpoint = "http://example.invalid:4444";
      if (invalid === "source") options.source.executableSha256 = "";
      const report = await runWriter363NativeLabels(options);
      expect(report.status).toBe("failed");
      expect(report.browserOnly).toBe(true);
      expect(state.calls).toEqual([]);
    }));
}

for (const gate of ["tauriObject", "diagnostics", "writerVisible"]) {
  it(`rejects an unsuitable DOM gate: ${gate}`, () =>
    fixture(async ({ state, options }) => {
      state.mutate = (value) => {
        value[gate] = gate === "diagnostics";
      };
      const report = await runWriter363NativeLabels(options);
      expect(report.status).toBe("failed");
      expect(report.browserOnly).toBe(true);
      expect(state.calls).toHaveLength(1);
    }));
}

it("reports an unreachable native session as failed", () =>
  fixture(async ({ options, server }) => {
    await new Promise((done) => server.close(done));
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("failed");
    expect(report.browserOnly).toBe(true);
    expect(report.existingSessionRead).toBe(false);
  }));

for (const invalid of [
  "raw-key",
  "empty-tooltip",
  "hidden-button",
  "no-interpolation",
]) {
  it(`fails ${invalid} labels and restores the original tab`, () =>
    fixture(async ({ state, options }) => {
      state.mutate = (value) => {
        const buttons = value.groups[0].buttons;
        if (invalid === "raw-key") buttons[2].name = "styles.manage.update";
        if (invalid === "empty-tooltip") buttons[1].title = "";
        if (invalid === "hidden-button") buttons[4].visible = false;
        if (invalid === "no-interpolation") buttons[3].name = "Modify Style";
      };
      const report = await runWriter363NativeLabels(options);
      expect(report.status).toBe("failed");
      expect(report.cleanup).toMatchObject({
        tabRestored: true,
        actionsReleased: true,
      });
      expect(state.active).toBe("home");
    }));
}

it("does not dispatch a pointer into an obstructed target", () =>
  fixture(async ({ state, options }) => {
    state.pointBlocked = true;
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("failed");
    expect(state.calls.some((c) => c.path.endsWith("/actions"))).toBe(false);
    expect(report.cleanup.tabRestored).toBe(true);
  }));

it("releases partial actions and restores the old tab after a protocol failure", () =>
  fixture(async ({ state, options }) => {
    state.actionFails = true;
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("failed");
    expect(report.error.message).toContain("partial action failed");
    expect(report.cleanup).toMatchObject({
      tabRestored: true,
      actionsReleased: true,
    });
    expect(state.active).toBe("home");
  }));

it("makes a restoration failure invalidate otherwise successful labels", () =>
  fixture(async ({ state, options }) => {
    state.restoreFails = true;
    const report = await runWriter363NativeLabels(options);
    expect(report.group.buttons).toHaveLength(5);
    expect(report.status).toBe("failed");
    expect(report.cleanup).toMatchObject({
      tabRestored: false,
      actionsReleased: true,
    });
  }));

it("retains the original label error and release/restoration errors", () =>
  fixture(async ({ state, options }) => {
    state.releaseFails = true;
    state.restoreFails = true;
    state.mutate = (value) => {
      value.groups[0].buttons[1].title = "";
    };
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("failed");
    expect(report.error.name).toBe("AggregateError");
    expect(report.error.errors[0].message).toContain("All five label controls");
    expect(
      report.error.errors.some((e) => e.message.includes("release failed")),
    ).toBe(true);
    expect(
      report.error.errors.some((e) => e.message.includes("restore failed")),
    ).toBe(true);
    expect(report.cleanup).toMatchObject({
      tabRestored: false,
      actionsReleased: false,
    });
  }));

it("reports screenshot failure and still restores the caller's tab", () =>
  fixture(async ({ state, options }) => {
    state.screenshotFails = true;
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("failed");
    expect(report.error.message).toContain("screenshot failed");
    expect(report.cleanup.tabRestored).toBe(true);
  }));

it("uses fresh cleanup deadlines after the caller cancels an action", () =>
  fixture(async ({ state, options }) => {
    const controller = new AbortController();
    options.signal = controller.signal;
    state.onAction = () => controller.abort(new Error("caller cancelled"));
    const report = await runWriter363NativeLabels(options);
    expect(report.status).toBe("failed");
    expect(report.cleanup).toMatchObject({
      tabRestored: true,
      actionsReleased: true,
    });
    expect(state.active).toBe("home");
  }));

it("retains the original failure and cleanup facts if report writing fails", () =>
  fixture(async ({ state, options }) => {
    await mkdir(reportFile(options));
    state.mutate = (value) => {
      value.groups[0].buttons[1].title = "";
    };
    let failure;
    try {
      await runWriter363NativeLabels(options);
    } catch (error) {
      failure = error;
    }
    expect(failure.probeReport.status).toBe("failed");
    expect(failure.probeReport.error.message).toContain(
      "All five label controls",
    );
    expect(failure.probeReport.cleanup).toMatchObject({
      tabRestored: true,
      actionsReleased: true,
    });
    expect(failure.probeReport.outputError).toBeTruthy();
  }));
