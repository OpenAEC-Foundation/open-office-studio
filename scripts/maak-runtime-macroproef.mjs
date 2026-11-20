import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { fileURLToPath } from "node:url";

/** A self-contained, harmless on-load macro: only writes this probe's own marker. */
export async function maakMacroproef(map) {
  map = resolve(map);
  await mkdir(map, { recursive: true });
  const marker = join(map, "macro-was-executed.txt");
  const module = `Sub Main\nOpen "${marker.replaceAll('"', '""')}" For Output As #1\nPrint #1, "unexpected macro execution"\nClose #1\nEnd Sub`;
  const fixture = join(map, "macro-guard.odt");
  const xml = {
    mimetype: "application/vnd.oasis.opendocument.text",
    "content.xml": `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:script="urn:oasis:names:tc:opendocument:xmlns:script:1.0" xmlns:dom="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.3"><office:scripts><office:event-listeners><script:event-listener script:language="ooo:script" script:event-name="dom:load" xlink:href="vnd.sun.star.script:Standard.Module1.Main?language=Basic&amp;location=document" xlink:type="simple" xmlns:ooo="http://openoffice.org/2004/office"/></office:event-listeners></office:scripts><office:body><office:text><text:p>Harmless macro guard fixture.</text:p></office:text></office:body></office:document-content>`,
    "Basic/script-lc.xml": `<library:libraries xmlns:library="http://openoffice.org/2000/library"><library:library library:name="Standard" library:link="false"/></library:libraries>`,
    "Basic/Standard/script-lb.xml": `<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" library:readonly="false" library:passwordprotected="false"><library:element library:name="Module1"/></library:library>`,
    "Basic/Standard/Module1.xml": `<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic"><![CDATA[${module}]]></script:module>`,
  };
  xml["META-INF/manifest.xml"] =
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>${Object.keys(
      xml,
    )
      .filter((k) => k !== "mimetype")
      .map(
        (k) =>
          `<manifest:file-entry manifest:full-path="${k}" manifest:media-type="text/xml"/>`,
      )
      .join("")}</manifest:manifest>`;
  await writeFile(
    fixture,
    zipSync(
      Object.fromEntries(Object.entries(xml).map(([k, v]) => [k, strToU8(v)])),
      { level: 0 },
    ),
  );
  return { fixture, marker };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    JSON.stringify(
      await maakMacroproef(process.argv[2] || ".local/runtime-macro"),
    ),
  );
