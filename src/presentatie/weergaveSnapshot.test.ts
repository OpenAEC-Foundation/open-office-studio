import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import {
  beginPresentatieTekst,
  leesPresentatieSnapshot,
  type PresentatieWeergave,
} from "./weergaveSnapshot";

beforeAll(async () => {
  await initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  );
});

function document() {
  const h = openPresentation(readFileSync("public/templates/nieuw.pptx"));
  const eerste = h.snapshot().slides[0];
  const storyId = eerste.shapes.find((s) => s.textStories.length)!
    .textStories[0].id;
  h.insertText(storyId, 0, "abc");
  const andere = h.insertSlide(1).slideId;
  h.addTextBox(andere, {
    name: "Andere dia",
    rect: { x: 0, y: 0, width: 100000, height: 100000 },
    text: "Niet gewijzigd",
    style: {},
  });
  const bron = {
    version: h.version.bind(h),
    snapshot: vi.fn(h.snapshot.bind(h)),
    readCommandContent: vi.fn(h.readCommandContent.bind(h)),
    onUpdate: h.onUpdate.bind(h),
  };
  const weergave: PresentatieWeergave = {
    openaecOwner: bron,
    version: h.version(),
    snapshot: h.snapshot(),
    slideIndex: 0,
  };
  return { h, bron, weergave, storyId, andere };
}

describe("gerichte snapshots voor de presentatie-invoer", () => {
  it("hergebruikt dezelfde versie bij navigatie, met een eigen handle als grens", () => {
    const d = document();
    try {
      for (let i = 0; i < 20; i++)
        expect(leesPresentatieSnapshot(d.bron, d.weergave)).toBe(
          d.weergave.snapshot,
        );
      expect(d.bron.snapshot).not.toHaveBeenCalled();
      const andereBron = { ...d.bron };
      expect(leesPresentatieSnapshot(andereBron, d.weergave)).toEqual(
        d.h.snapshot(),
      );
      expect(d.bron.snapshot).toHaveBeenCalledTimes(1);
    } finally {
      d.h.dispose();
    }
  });

  it.each(["invoegen", "vervangen", "wissen", "alinea"])(
    "behoudt de volledige native documentbetekenis bij %s",
    (soort) => {
      const d = document();
      try {
        const selectie = {
          storyId: d.storyId,
          anchor: 0,
          focus: soort === "vervangen" || soort === "wissen" ? 2 : 0,
        };
        const toets =
          soort === "wissen" ? "Delete" : soort === "alinea" ? "Enter" : "x";
        const beurt = beginPresentatieTekst(
          d.bron,
          d.weergave,
          selectie,
          toets,
        );
        expect(beurt).not.toBeNull();
        if (soort === "vervangen" || soort === "wissen")
          d.h.deleteText(d.storyId, 0, 2);
        if (soort === "alinea") d.h.insertParagraphBreak(d.storyId, 0);
        else if (soort !== "wissen") d.h.insertText(d.storyId, 0, "x");
        const uit = leesPresentatieSnapshot(d.bron, d.weergave, beurt);
        expect(uit).toEqual(d.h.snapshot());
        expect(uit.slides[1]).toBe(d.weergave.snapshot.slides[1]);
        expect(d.bron.snapshot).not.toHaveBeenCalled();
        expect(d.bron.readCommandContent).toHaveBeenCalledWith({
          slideIds: [d.weergave.snapshot.slides[0].id],
        });
      } finally {
        d.h.dispose();
      }
    },
  );

  it("bewaart ook nog niet opgeslagen beeldbytes op de bewerkte dia", () => {
    const d = document();
    try {
      d.h.addPicture(d.weergave.snapshot.slides[0].id, {
        name: "Pixel",
        rect: { x: 0, y: 0, width: 100000, height: 100000 },
        contentType: "image/png",
        mediaBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      });
      d.weergave.snapshot = d.h.snapshot();
      d.weergave.version = d.h.version();
      const beurt = beginPresentatieTekst(
        d.bron,
        d.weergave,
        { storyId: d.storyId, anchor: 0, focus: 0 },
        "x",
      );
      d.h.insertText(d.storyId, 0, "x");
      expect(leesPresentatieSnapshot(d.bron, d.weergave, beurt)).toEqual(
        d.h.snapshot(),
      );
      expect(d.bron.snapshot).not.toHaveBeenCalled();
    } finally {
      d.h.dispose();
    }
  });

  it("leest alles na een wijziging die nog niet in de huidige weergave stond", () => {
    const d = document();
    try {
      d.h.setSlideNotes(d.andere, "Extern gewijzigd");
      const beurt = beginPresentatieTekst(
        d.bron,
        d.weergave,
        { storyId: d.storyId, anchor: 0, focus: 0 },
        "x",
      );
      expect(beurt).toBeNull();
      d.h.insertText(d.storyId, 0, "x");
      expect(leesPresentatieSnapshot(d.bron, d.weergave, beurt)).toEqual(
        d.h.snapshot(),
      );
      expect(d.bron.readCommandContent).not.toHaveBeenCalled();
    } finally {
      d.h.dispose();
    }
  });

  it("valt terug bij een extra, herintredende wijziging op een andere dia", () => {
    const d = document();
    try {
      let gewijzigd = false;
      d.h.onUpdate(() => {
        if (!gewijzigd) {
          gewijzigd = true;
          d.h.setSlideNotes(d.andere, "Tijdens invoer gewijzigd");
        }
      });
      const beurt = beginPresentatieTekst(
        d.bron,
        d.weergave,
        { storyId: d.storyId, anchor: 0, focus: 0 },
        "x",
      );
      d.h.insertText(d.storyId, 0, "x");
      expect(leesPresentatieSnapshot(d.bron, d.weergave, beurt)).toEqual(
        d.h.snapshot(),
      );
      expect(d.bron.readCommandContent).not.toHaveBeenCalled();
    } finally {
      d.h.dispose();
    }
  });

  it("accepteert geen gerichte lezing zonder bevestigde mutatie of bij een andere selectie", () => {
    const d = document();
    try {
      expect(
        beginPresentatieTekst(
          d.bron,
          d.weergave,
          { storyId: "onbekend", anchor: 0, focus: 0 },
          "x",
        ),
      ).toBeNull();
      const beurt = beginPresentatieTekst(
        d.bron,
        d.weergave,
        { storyId: d.storyId, anchor: 0, focus: 0 },
        "x",
      );
      d.h.insertText(d.storyId, 0, "x");
      d.h.insertSlide(2);
      expect(leesPresentatieSnapshot(d.bron, d.weergave, beurt)).toEqual(
        d.h.snapshot(),
      );
      expect(d.bron.readCommandContent).not.toHaveBeenCalled();
    } finally {
      d.h.dispose();
    }
  });

  it("houdt de volledige terugvalroute bij een geweigerde gerichte lezing", () => {
    const d = document();
    try {
      const beurt = beginPresentatieTekst(
        d.bron,
        d.weergave,
        { storyId: d.storyId, anchor: 0, focus: 0 },
        "x",
      );
      d.h.insertText(d.storyId, 0, "x");
      d.bron.readCommandContent.mockImplementationOnce(() => {
        throw Error("Weigering");
      });
      expect(leesPresentatieSnapshot(d.bron, d.weergave, beurt)).toEqual(
        d.h.snapshot(),
      );
      expect(d.bron.snapshot).toHaveBeenCalledTimes(1);
    } finally {
      d.h.dispose();
    }
  });
});
