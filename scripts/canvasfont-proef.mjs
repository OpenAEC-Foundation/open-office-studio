/** Vergelijk de app-setter met directe native toewijzingen, inclusief echte pixels. */
export async function controleerCanvasFonts(page) {
  return page.evaluate(async () => {
    const resultaten = [];
    const root = document.createElement("div");
    root.style.cssText = "position:fixed;left:-10000px;top:0";
    document.body.append(root);
    const url = new URL("fonts/extra/SourceSerif4-Regular.ttf", location.href)
      .href;
    const face = new FontFace("Source Serif 4", `url("${url}")`);
    await face.load();
    document.fonts.add(face);
    try {
      for (const naam of [
        "CanvasRenderingContext2D",
        "OffscreenCanvasRenderingContext2D",
      ]) {
        const native = window.__nativeFonts[naam];
        if (!native) continue;
        const offscreen = naam.startsWith("Offscreen");
        const maak = () => {
          const canvas = offscreen
            ? new OffscreenCanvas(420, 100)
            : document.createElement("canvas");
          canvas.width = 420;
          canvas.height = 100;
          if (!offscreen) {
            canvas.style.fontSize = "10px";
            root.append(canvas);
          }
          return canvas;
        };
        const canvas = maak(),
          referentie = maak(),
          ctx = canvas.getContext("2d"),
          ref = referentie.getContext("2d");
        const tekst = "Aa ffi 12345 ij WWW Nederland";
        const controle = (proef) => {
          // CSS mag een enkele familienaam als Arial met of zonder quotes serialiseren.
          const fontNaam = (v) => v.replace(/(["'])([A-Za-z][\w-]*)\1/g, "$2");
          if (fontNaam(native.get.call(ctx)) !== fontNaam(native.get.call(ref)))
            throw Error(`${naam}/${proef}: andere font`);
          for (const p of [
            "fontKerning",
            "fontStretch",
            "fontVariantCaps",
            "letterSpacing",
          ])
            if (p in ctx && ctx[p] !== ref[p])
              throw Error(`${naam}/${proef}: andere ${p}`);
          if (
            Math.abs(
              ctx.measureText(tekst).width - ref.measureText(tekst).width,
            ) > 0.001
          )
            throw Error(`${naam}/${proef}: andere breedte`);
          for (const c of [ctx, ref]) {
            c.clearRect(0, 0, 420, 100);
            c.fillStyle = "#000";
            c.fillText(tekst, 2, 40);
          }
          const a = ctx.getImageData(0, 0, 420, 100).data,
            b = ref.getImageData(0, 0, 420, 100).data;
          if (!a.every((v, i) => v === b[i]))
            throw Error(`${naam}/${proef}: andere tekstpixels`);
          resultaten.push(`${naam}/${proef}`);
        };
        const font = (input, verwacht = input) => {
          ctx.font = input;
          native.set.call(ref, verwacht);
        };
        for (let i = 0; i < 100; i++) font("normal 400 14px Arial");
        controle("herhaling-normalisatie");
        ctx.save();
        ref.save();
        font("20px Source Serif 4", '20px "Source Serif 4"');
        controle("familienaam-met-cijfer");
        ctx.restore();
        ref.restore();
        font("20px Source Serif 4", '20px "Source Serif 4"');
        controle("save-restore");
        canvas.width = 420;
        referentie.width = 420;
        font("normal 400 14px Arial");
        controle("canvas-resize");
        if (typeof ctx.reset === "function") {
          ctx.reset();
          ref.reset();
          font("normal 400 14px Arial");
          controle("reset");
        }
        font("1em Arial");
        controle("relatieve-grootte");
        if (!offscreen) {
          canvas.style.fontSize = "25px";
          referentie.style.fontSize = "25px";
          font("1em Arial");
          controle("gewijzigde-css-grootte");
        }
        for (const [property, value] of [
          ["fontKerning", "none"],
          ["fontStretch", "expanded"],
          ["fontVariantCaps", "small-caps"],
          ["letterSpacing", "2px"],
        ]) {
          if (!(property in ctx)) continue;
          ctx[property] = value;
          ref[property] = value;
          font("normal 400 14px Arial");
          controle(property);
        }
        font("20px PerfDynamic");
        const dynamic = new FontFace("PerfDynamic", `url("${url}")`);
        await dynamic.load();
        document.fonts.add(dynamic);
        await document.fonts.ready;
        font("20px PerfDynamic");
        controle("font-na-laden");
        document.fonts.delete(dynamic);
      }
    } finally {
      root.remove();
      document.fonts.delete(face);
    }
    return resultaten;
  });
}
