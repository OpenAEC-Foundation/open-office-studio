import { it, expect } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { withWriter363Resources } from "./writer-363-resources.mjs";

function resources(fail = {}) {
  const calls = [],
    cleanup = {};
  const operation = (name, value) => async () => {
    calls.push(name);
    if (fail[name]) throw fail[name];
    return value;
  };
  const browser = { close: operation("browser.close") };
  const factories = {
    loadFixture: operation("fixture", Buffer.from("verified fixture")),
    startServer: operation("server", { owned: true }),
    launchBrowser: operation("browser", browser),
    exercise: operation("exercise", "result"),
    stopServer: operation("server.close"),
  };
  return {
    calls,
    cleanup,
    run: () => withWriter363Resources(factories, cleanup),
  };
}

it("returns the exercise result only after both resources close", async () => {
  const r = resources();
  expect(await r.run()).toBe("result");
  expect(r.calls).toEqual([
    "fixture",
    "server",
    "browser",
    "exercise",
    "browser.close",
    "server.close",
  ]);
  expect(r.cleanup).toEqual({
    fixtureLoaded: true,
    serverStarted: true,
    browserStarted: true,
    browserClosed: true,
    serverClosed: true,
  });
});

for (const [stage, calls, closed] of [
  ["fixture", ["fixture"], [null, null]],
  ["server", ["fixture", "server"], [null, null]],
  ["browser", ["fixture", "server", "browser", "server.close"], [null, true]],
  [
    "exercise",
    [
      "fixture",
      "server",
      "browser",
      "exercise",
      "browser.close",
      "server.close",
    ],
    [true, true],
  ],
]) {
  it(`preserves the ${stage} error and closes only acquired resources`, async () => {
    const original = new Error(stage),
      r = resources({ [stage]: original });
    await expect(r.run()).rejects.toBe(original);
    expect(r.calls).toEqual(calls);
    expect([r.cleanup.browserClosed, r.cleanup.serverClosed]).toEqual(closed);
  });
}

for (const stage of ["browser.close", "server.close"]) {
  it(`rejects when ${stage} fails after a successful exercise`, async () => {
    const original = new Error(stage),
      r = resources({ [stage]: original });
    await expect(r.run()).rejects.toBe(original);
    expect(r.calls.at(-1)).toBe("server.close");
    expect(
      r.cleanup[stage === "browser.close" ? "browserClosed" : "serverClosed"],
    ).toBe(false);
  });
}

it("retains the exercise and both disposal errors in order", async () => {
  const errors = [
    new Error("exercise"),
    new Error("browser disposal"),
    new Error("server disposal"),
  ];
  const r = resources({
    exercise: errors[0],
    "browser.close": errors[1],
    "server.close": errors[2],
  });
  let failure;
  try {
    await r.run();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure.errors).toEqual(errors);
  expect(r.cleanup.browserClosed).toBe(false);
  expect(r.cleanup.serverClosed).toBe(false);
});

it("releases a real listening socket when browser launch rejects", async () => {
  const server = createServer((_, res) => res.end("owned probe"));
  const cleanup = {},
    original = new Error("launch rejected");
  await expect(
    withWriter363Resources(
      {
        loadFixture: async () => Buffer.from("fixture"),
        startServer: async () => {
          server.listen(0, "127.0.0.1");
          await once(server, "listening");
          return server;
        },
        launchBrowser: async () => {
          throw original;
        },
        stopServer: (owned) =>
          new Promise((done, reject) =>
            owned.close((error) => (error ? reject(error) : done())),
          ),
        exercise: async () => {
          throw new Error("must not run");
        },
      },
      cleanup,
    ),
  ).rejects.toBe(original);
  expect(server.listening).toBe(false);
  expect(cleanup).toMatchObject({
    serverStarted: true,
    browserStarted: false,
    serverClosed: true,
    browserClosed: null,
  });
});
