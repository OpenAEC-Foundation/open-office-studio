/** OS fixture preflight only. No Office app, accounts, suite or installer. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true");
const home = await mkdtemp(
  join(tmpdir(), "standalone-secret-service-fixture-"),
);
const out = resolve(".local/standalone-linux-host");
await mkdir(out, { recursive: true });
const env = {
  PATH: process.env.PATH,
  HOME: home,
  XDG_DATA_HOME: join(home, "data"),
  XDG_CONFIG_HOME: join(home, "config"),
  XDG_RUNTIME_DIR: join(home, "runtime"),
  DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
};
for (const path of [
  env.XDG_DATA_HOME,
  env.XDG_CONFIG_HOME,
  env.XDG_RUNTIME_DIR,
])
  await mkdir(path, { recursive: true, mode: 0o700 });
const report = {
  purpose: "OS fixture host preflight; not native app acceptance",
  status: "running",
  checks: [],
};
const command = (file, args, options = {}) =>
  execFileSync(file, args, {
    env,
    encoding: "utf8",
    timeout: 20_000,
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }).trim();
let daemon,
  log = "";
try {
  daemon = spawn(
    "gnome-keyring-daemon",
    ["--foreground", "--unlock", "--components=secrets"],
    { env, stdio: ["pipe", "pipe", "pipe"] },
  );
  daemon.once("error", (error) => (log += String(error)));
  for (const stream of [daemon.stdout, daemon.stderr])
    stream.on("data", (data) => (log += data.toString()));
  daemon.stdin.end("SYNTHETIC-QA-KEYRING\n");
  let owned = false;
  for (let i = 0; i < 100; i++) {
    owned = command("gdbus", [
      "call",
      "--session",
      "--dest",
      "org.freedesktop.DBus",
      "--object-path",
      "/org/freedesktop/DBus",
      "--method",
      "org.freedesktop.DBus.NameHasOwner",
      "org.freedesktop.secrets",
    ]).includes("true");
    if (owned) break;
    await delay(100);
  }
  assert.equal(
    owned,
    true,
    "Own OS Secret Service actually acquired its D-Bus name",
  );
  const attributes = [
    "service",
    "OpenAEC Email Studio",
    "username",
    "standalone-synthetic",
  ];
  command(
    "secret-tool",
    ["store", "--label=Standalone synthetic QA", ...attributes],
    { input: "SYNTHETIC-QA-PASSWORD" },
  );
  const secret = command("secret-tool", ["lookup", ...attributes]);
  assert.equal(secret, "SYNTHETIC-QA-PASSWORD");
  report.lookupSha256 = createHash("sha256").update(secret).digest("hex");
  command("secret-tool", ["clear", ...attributes]);
  report.checks.push(
    "Own empty HOME and Secret Service, exact keyring service/username attributes, store/lookup/clear through real OS service",
  );
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error.stack || error);
} finally {
  daemon?.kill("SIGTERM");
  for (
    let i = 0;
    i < 50 && daemon?.exitCode === null && daemon?.signalCode === null;
    i++
  )
    await delay(100);
  report.ownedDaemonExited =
    !daemon || daemon.exitCode !== null || daemon.signalCode !== null;
  if (report.ownedDaemonExited) {
    await rm(home, { recursive: true, force: true });
    report.ownedHomeRemoved = true;
  }
  await writeFile(join(out, "daemon.log"), log);
  await writeFile(
    join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
assert.ok(
  report.status === "passed" &&
    report.ownedDaemonExited &&
    report.ownedHomeRemoved,
  "Real OS fixture and complete cleanup must pass",
);
