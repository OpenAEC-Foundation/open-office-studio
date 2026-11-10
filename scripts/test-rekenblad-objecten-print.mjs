/** Real canvas/PDF check for a worksheet containing only drawings. */
import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
// Match the normal build's bundled font assets without downloading extra fonts.
await mkdir("public/fonts", { recursive: true });
await cp("node_modules/@betteroffice/fonts/assets", "public/fonts", {
  recursive: true,
});
const server = await createServer({
  cacheDir: ".local/vite-cache-object-print",
  plugins: [
    {
      name: "object-print-probe",
      configureServer(s) {
        s.middlewares.use("/__object_print", (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end("<!doctype html><title>Worksheet object print test</title>");
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
    hmr: false,
    watch: null,
    open: false,
  },
});
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
const out = ".local/proef-rekenblad-objecten-print";
await mkdir(out, { recursive: true });
try {
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/__object_print`,
  );
  const source = Array.from(await readFile("public/templates/nieuw.xlsx"));
  const measured = await page.evaluate(async (source) => {
    const { initWasm, openWorkbook } = await import(
      "/node_modules/@betteroffice/xlsx/dist/index.js"
    );
    const { voegTekenobjectToe } = await import(
      "/src/rekenblad/tekenobjecten.ts"
    );
    const { laadTekenobjecten } = await import("/src/rekenblad/tekenAnkers.ts");
    const { rekenbladPaginas } = await import(
      "/src/afdrukken/bronRekenblad.ts"
    );
    const { standaardBladInstellingen } = await import(
      "/src/afdrukken/rekenbladInstellingen.ts"
    );
    const { maakPdf } = await import("/src/export/pdf/index.ts");
    await initWasm(
      await (
        await fetch("/vendor/rekenbladengine/xlsx_wasm_bg.wasm")
      ).arrayBuffer(),
    );
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgcPkPAAGLAURM0jfCAAAAAElFTkSuQmCC",
      ),
      (c) => c.charCodeAt(0),
    );
    let bytes = voegTekenobjectToe(new Uint8Array(source), 0, {
      naam: "Blue image",
      afbeelding: png,
      plek: { row: 2, col: 2, x: 0, y: 0, breedte: 100, hoogte: 60 },
    });
    bytes = voegTekenobjectToe(bytes, 0, {
      naam: "Orange shape",
      tekst: "Printed shape",
      vorm: "roundRect",
      vulling: "#FF8800",
      plek: { row: 8, col: 2, x: 0, y: 0, breedte: 180, hoogte: 90 },
    });
    const h = openWorkbook(bytes);
    laadTekenobjecten(h, bytes);
    try {
      const doc = await rekenbladPaginas(
        {
          api: { handle: h },
          bytes,
          titel: "Object print",
          bestandsnaam: "Objects.xlsx",
          selectie: null,
        },
        {
          omvang: "blad",
          instellingen: [standaardBladInstellingen()],
          negeerAfdrukbereik: true,
        },
      );
      const { canvas, tekst } = await doc.paginas[0].teken(96);
      document.body.append(canvas);
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let blauw = 0,
        oranje = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          pixels[i] < 20 &&
          pixels[i + 1] > 45 &&
          pixels[i + 1] < 95 &&
          pixels[i + 2] > 230
        )
          blauw++;
        if (
          pixels[i] > 240 &&
          pixels[i + 1] > 115 &&
          pixels[i + 1] < 155 &&
          pixels[i + 2] < 20
        )
          oranje++;
      }
      const terugval = [];
      const pdf = await maakPdf(doc, {
        kwaliteit: "klein",
        vector: true,
        terugval: (_pagina, reden) => terugval.push(reden),
      });
      return {
        pages: doc.paginas.length,
        blauw,
        oranje,
        text: tekst.map((t) => t.tekst).join(""),
        pdf: Array.from(pdf),
        terugval,
      };
    } finally {
      h.dispose();
    }
  }, source);
  const groups = await page.evaluate(async (source) => {
    const { openWorkbook } = await import(
      "/node_modules/@betteroffice/xlsx/dist/index.js"
    );
    const { groepFixture } = await import("/src/rekenblad/testdata/groep.ts");
    const { laadTekenobjecten } = await import("/src/rekenblad/tekenAnkers.ts");
    const { rekenbladPaginas } = await import(
      "/src/afdrukken/bronRekenblad.ts"
    );
    const { standaardBladInstellingen } = await import(
      "/src/afdrukken/rekenbladInstellingen.ts"
    );
    const { maakPdf } = await import("/src/export/pdf/index.ts");
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgcPkPAAGLAURM0jfCAAAAAElFTkSuQmCC",
      ),
      (c) => c.charCodeAt(0),
    );
    const reports = [];
    for (const [name, options] of [
      ["group", {}],
      ["group-flipped", { flipX: true, rotatie: 30 }],
    ]) {
      const bytes = groepFixture(new Uint8Array(source), png, options).bytes,
        h = openWorkbook(bytes);
      laadTekenobjecten(h, bytes);
      try {
        const doc = await rekenbladPaginas(
          {
            api: { handle: h },
            bytes,
            titel: name,
            bestandsnaam: `${name}.xlsx`,
            selectie: null,
          },
          {
            omvang: "blad",
            instellingen: [standaardBladInstellingen()],
            negeerAfdrukbereik: true,
          },
        );
        const { canvas, tekst } = await doc.paginas[0].teken(96);
        document.body.append(canvas);
        const data = canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height).data;
        const blue = { n: 0, x: 0, y: 0 },
          orange = { n: 0, x: 0, y: 0 };
        for (let i = 0; i < data.length; i += 4) {
          const x = (i / 4) % canvas.width,
            y = Math.floor(i / 4 / canvas.width);
          const color =
            data[i] < 20 &&
            data[i + 1] > 45 &&
            data[i + 1] < 95 &&
            data[i + 2] > 230
              ? blue
              : data[i] > 240 &&
                  data[i + 1] > 115 &&
                  data[i + 1] < 155 &&
                  data[i + 2] < 20
                ? orange
                : null;
          if (color) {
            color.n++;
            color.x += x;
            color.y += y;
          }
        }
        const terugval = [];
        const pdf = await maakPdf(doc, {
          kwaliteit: "klein",
          vector: true,
          terugval: (_p, reden) => terugval.push(reden),
        });
        reports.push({
          name,
          pages: doc.paginas.length,
          blue: blue.n,
          orange: orange.n,
          delta: {
            x: orange.x / orange.n - blue.x / blue.n,
            y: orange.y / orange.n - blue.y / blue.n,
          },
          text: tekst.map((t) => t.tekst).join(""),
          terugval,
          pdf: Array.from(pdf),
        });
      } finally {
        h.dispose();
      }
    }
    return reports;
  }, source);
  for (const g of groups) {
    assert.equal(g.pages, 1);
    assert(
      g.blue > 4500 && g.orange > 1800,
      `Group colors: ${JSON.stringify({ ...g, pdf: undefined })}`,
    );
    // Rotated text is deliberately omitted from the fallback text recorder;
    // the independent PDF-reader check verifies the vector text below.
    assert.deepEqual(g.terugval, []);
    const expected =
      g.name === "group"
        ? { x: 120, y: 130 }
        : {
            x: -120 * Math.cos(Math.PI / 6) - 130 * Math.sin(Math.PI / 6),
            y: -120 * Math.sin(Math.PI / 6) + 130 * Math.cos(Math.PI / 6),
          };
    assert(
      Math.abs(g.delta.x - expected.x) < 5 &&
        Math.abs(g.delta.y - expected.y) < 5,
      `Group transform: ${g.name} ${JSON.stringify(g.delta)}`,
    );
    await writeFile(`${out}/${g.name}.pdf`, Buffer.from(g.pdf));
    delete g.pdf;
  }
  measured.groups = groups;
  assert.equal(measured.pages, 1);
  assert(measured.blauw > 4000, `Blue image pixels: ${measured.blauw}`);
  assert(measured.oranje > 10000, `Orange shape pixels: ${measured.oranje}`);
  assert(measured.text.includes("Printed shape"));
  assert.deepEqual(measured.terugval, []);
  const pdf = Buffer.from(measured.pdf);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  await writeFile(`${out}/objects.pdf`, pdf);
  await page.screenshot({ path: `${out}/print.png`, fullPage: true });
  delete measured.pdf;
  await writeFile(`${out}/report.json`, JSON.stringify(measured, null, 2));
  console.log(JSON.stringify(measured));
} finally {
  await browser.close();
  await server.close();
}
