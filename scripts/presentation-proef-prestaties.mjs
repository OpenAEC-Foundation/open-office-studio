import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

async function engine() {
  const pptx = await import("@betteroffice/pptx");
  await pptx.initWasm(
    fs.readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  );
  return pptx;
}

export async function maakPresentatie(bestand = ".local/performance.pptx") {
  const { openPresentation } = await engine();
  const h = openPresentation(fs.readFileSync("public/templates/nieuw.pptx"));
  try {
    const eerste = h.snapshot().slides[0].id;
    for (let i = 0; i < 100; i++) {
      const id = i === 0 ? eerste : h.insertSlide(i).slideId;
      for (let j = 0; j < 12; j++)
        h.addTextBox(id, {
          name: `Perf ${i} ${j}`,
          rect: {
            x: (j % 4) * 2000000,
            y: Math.floor(j / 4) * 1300000,
            width: 1800000,
            height: 1000000,
          },
          text: `Slide ${i + 1}, box ${j + 1}. Fixed performance sample with editable text.`,
          style: { fontFamily: "Arial", fontSize: 14 },
        });
    }
    fs.mkdirSync(".local", { recursive: true });
    fs.writeFileSync(bestand, h.save());
  } finally {
    h.dispose();
  }
}

export async function controleerPresentatie(bestand, verwacht) {
  const { openPresentation } = await engine();
  const h = openPresentation(fs.readFileSync(bestand));
  try {
    const d = h.snapshot();
    const teksten = d.slides.map((s) =>
      s.shapes.map((x) =>
        x.textStories.map((t) =>
          t.paragraphs
            .map((p) => p.runs.map((r) => r.text).join(""))
            .join("\n"),
        ),
      ),
    );
    if (JSON.stringify(teksten) !== JSON.stringify(verwacht))
      throw Error("Presentation text changed after saving/reopening");
    if (d.slides.length !== 100)
      throw Error("Slide count changed after reopening");
    return {
      slides: d.slides.length,
      shapes: d.slides.reduce((n, s) => n + s.shapes.length, 0),
    };
  } finally {
    h.dispose();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await maakPresentatie();
  console.log("Created .local/performance.pptx (100 slides, 1.202 shapes)");
}
