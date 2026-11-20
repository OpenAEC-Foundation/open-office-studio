import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { herstelAlineaNavigatie } from "./tekstnavigatie-compatibiliteit";

const bron = readFileSync(
  "node_modules/@betteroffice/docx-react/dist/index.mjs",
  "utf8",
);
const begin = 'h.key==="ArrowUp"||h.key==="ArrowDown"?';
const einde = ':(h.key==="Home"||h.key==="End")';

// Execute the transformed SDK branch itself, including its existing Apple
// platform predicate, rather than a duplicate implementation of the mapping.
function navigatie(platform: string, toets: Record<string, unknown>) {
  const aangepast = herstelAlineaNavigatie(bron);
  const start = aangepast.indexOf(begin);
  const stop = aangepast.indexOf(einde, start);
  expect(start).toBeGreaterThan(0);
  expect(stop).toBeGreaterThan(start);
  const appleBron = /function iv\(\)\{[^}]+\}/.exec(bron)?.[0];
  expect(appleBron).toBeDefined();
  const apple = new Function("navigator", `return (${appleBron})();`).bind(
    null,
    { platform },
  );
  const verplaats = vi.fn();
  const preventDefault = vi.fn();
  new Function("h", "Ct", "iv", `${aangepast.slice(start, stop)}:undefined;`)(
    {
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      ...toets,
      preventDefault,
    },
    verplaats,
    apple,
  );
  expect(preventDefault).toHaveBeenCalledOnce();
  return verplaats;
}

describe("#358 native macOS documentnavigatie", () => {
  it.each([
    ["ArrowUp", "home"],
    ["ArrowDown", "end"],
  ])(
    "Command+%s bereikt document%s met behoud van Shiftselectie",
    (key, richting) => {
      for (const shiftKey of [false, true]) {
        expect(
          navigatie("MacIntel", { key, metaKey: true, shiftKey }),
        ).toHaveBeenCalledExactlyOnceWith(richting, shiftKey, true);
      }
    },
  );

  it.each(["MacIntel", "Win32", "Linux x86_64"])(
    "behoudt gewone en Control/Alt verticale navigatie op %s",
    (platform) => {
      for (const [key, richting] of [
        ["ArrowUp", "up"],
        ["ArrowDown", "down"],
      ])
        for (const shiftKey of [false, true])
          for (const modifiers of [{}, { ctrlKey: true }, { altKey: true }])
            expect(
              navigatie(platform, { key, shiftKey, ...modifiers }),
            ).toHaveBeenCalledExactlyOnceWith(richting, shiftKey, false);
    },
  );

  it.each(["Win32", "Linux x86_64"])(
    "verandert Meta+Up/Down niet op %s",
    (platform) => {
      for (const [key, richting] of [
        ["ArrowUp", "up"],
        ["ArrowDown", "down"],
      ])
        expect(
          navigatie(platform, { key, metaKey: true }),
        ).toHaveBeenCalledExactlyOnceWith(richting, false, false);
    },
  );

  it("kaapt extra Control/Option-modifiers op macOS niet", () => {
    for (const modifiers of [{ ctrlKey: true }, { altKey: true }])
      expect(
        navigatie("MacIntel", {
          key: "ArrowDown",
          metaKey: true,
          ...modifiers,
        }),
      ).toHaveBeenCalledExactlyOnceWith("down", false, false);
  });

  it("weigert onbekende/dubbele keymapping en gewijzigde platformdetectie", () => {
    expect(() =>
      herstelAlineaNavigatie(bron.replace(begin, 'h.key==="Other"?')),
    ).toThrow("macOS-documentnavigatie");
    const fragment = bron.slice(
      bron.indexOf(begin),
      bron.indexOf(einde, bron.indexOf(begin)),
    );
    expect(() => herstelAlineaNavigatie(bron + fragment)).toThrow(
      "macOS-documentnavigatie",
    );
    expect(() =>
      herstelAlineaNavigatie(
        bron.replace("function iv()", "function changed()"),
      ),
    ).toThrow("macOS-documentnavigatie");
  });
});
