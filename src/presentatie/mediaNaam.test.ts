import { readFileSync } from "node:fs";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { mediaWeergavenaam } from "./mediaNaam";
const labels = {
  nl: ["Audio", "Video"],
  en: ["Audio", "Video"],
  de: ["Audio", "Video"],
  fr: ["Audio", "Vidéo"],
  es: ["Audio", "Vídeo"],
  it: ["Audio", "Video"],
  "pt-BR": ["Áudio", "Vídeo"],
  "zh-CN": ["音频", "视频"],
  lo: ["ສຽງ", "ວິດີໂອ"],
};
describe("weergavenamen voor naamloze media (#310)", () => {
  it.each(Object.entries(labels))(
    "geeft onderscheidbare terugvalnamen in %s",
    async (locale, [audio, video]) => {
      const resource = JSON.parse(
          readFileSync(`src/i18n/locales/${locale}/presentation.json`, "utf8"),
        ),
        i18n = createInstance();
      await i18n.init({
        lng: locale,
        resources: { [locale]: { presentation: resource } },
        defaultNS: "presentation",
      });
      const t = i18n.getFixedT(locale, "presentation"),
        a = { id: 11, naam: "", soort: "audio" as const },
        v = { id: 12, naam: " \t ", soort: "video" as const };
      expect(mediaWeergavenaam(a, t)).toBe(`${audio} 11`);
      expect(mediaWeergavenaam(v, t)).toBe(`${video} 12`);
      expect(a.naam).toBe("");
      expect(v.naam).toBe(" \t ");
      expect(
        mediaWeergavenaam({ ...a, naam: "  Eigen & <naam> 🎵  " }, t),
      ).toBe("  Eigen & <naam> 🎵  ");
    },
  );
});
