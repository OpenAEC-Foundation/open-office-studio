import assert from "node:assert/strict";

/** Publish only X11/session configuration; never serialize arbitrary process secrets. */
export function safeNativeEnvironment(bytes) {
  const values = Object.fromEntries(
    bytes
      .toString()
      .split("\0")
      .filter(Boolean)
      .map((value) => {
        const index = value.indexOf("=");
        return [value.slice(0, index), value.slice(index + 1)];
      }),
  );
  return Object.fromEntries(
    [
      "DISPLAY",
      "HOME",
      "XAUTHORITY",
      "GDK_BACKEND",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
    ].map((name) => [name, values[name] ?? null]),
  );
}

/** One real native key at a time, with ownership/RPC acknowledgement on each side. */
export async function typeVerifiedNativeText({ text, verify, run, record }) {
  assert.match(
    text,
    /^[A-Za-z0-9 _]+$/,
    "Only this probe's bounded synthetic text",
  );
  for (const character of text) {
    const key =
      character === " "
        ? "space"
        : character === "_"
          ? "underscore"
          : character;
    await verify("before native character " + key);
    const action = {
      character,
      command: ["xdotool", "key", "--clearmodifiers", key],
      at: new Date().toISOString(),
    };
    record(action);
    await run(action.command.slice(1));
    action.post = await verify("after native character " + key);
  }
}
