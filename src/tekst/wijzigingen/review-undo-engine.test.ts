import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import {
  createYrsSession,
  saveYrsDocx,
  type YrsSession,
} from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { attr, kind, leesXml, tekstVan, zoekAlle } from "../../grafieken/xml";
import { besluit } from "./opdrachten";

const datum = "2026-11-10T10:00:00Z";
const run = (tekst: string, kleur = "") =>
  `<w:r>${kleur ? `<w:rPr><w:color w:val="${kleur}"/></w:rPr>` : ""}<w:t>${tekst}</w:t></w:r>`;
function paar(
  id: number,
  auteur: string,
  oud = "kat",
  nieuw = "hond",
  kleur = false,
) {
  return (
    `<w:del w:id="${id}" w:author="${auteur}" w:date="${datum}">${run(oud, kleur ? "FF0000" : "").replaceAll("w:t", "w:delText")}</w:del>` +
    `<w:ins w:id="${id + 1}" w:author="${auteur}" w:date="${datum}">${run(nieuw, kleur ? "0000FF" : "")}</w:ins>`
  );
}
function doc(body: string) {
  const z = new Pakket(readFileSync("public/templates/nieuw.docx"));
  z.schrijf(
    "word/document.xml",
    z
      .lees("word/document.xml")
      .replace(
        /<w:body>[\s\S]*<\/w:body>/,
        `<w:body>${body}<w:sectPr/></w:body>`,
      ),
  );
  return z.inpakken();
}
function api(sessie: YrsSession) {
  const sync = vi.fn();
  return {
    ref: {
      getEditorRef: () => ({
        getYrsSession: () => sessie,
        syncYrsInputState: sync,
      }),
    } as unknown as DocxEditorRef,
    sync,
  };
}
function inhoud(bytes: Uint8Array) {
  const root = leesXml(new Pakket(bytes).lees("word/document.xml"));
  return zoekAlle(root, "r").flatMap((r) =>
    [...tekstVan(kind(r, "t") ?? kind(r, "delText"))].map((t) => ({
      t,
      kleur: attr(kind(kind(r, "rPr"), "color"), "val"),
    })),
  );
}
async function echo(hoofd: YrsSession, worker: YrsSession, bewaren: boolean) {
  worker.applyUpdate(hoofd.encodeStateAsUpdate(worker.encodeStateVector()));
  if (bewaren) await saveYrsDocx(worker);
  hoofd.applyUpdate(worker.encodeStateAsUpdate(hoofd.encodeStateVector()));
}

describe("review-Undo na worker-synchronisatie (#313)", () => {
  it.each(["accepteren", "weigeren"] as const)(
    "houdt één revisie over twee alinea's begrensd bij %s",
    async (wat) => {
      const bytes = doc(
        `<w:p>${paar(0, "Anna", "een", "twee", true)}</w:p><w:p>${paar(0, "Anna", "drie", "vier", true)}</w:p>`,
      );
      const s = await createYrsSession(),
        worker = await createYrsSession();
      try {
        const host = s.openDocx(bytes, true),
          voor = s.listRevisions(),
          segmenten = s.storySegments("body");
        worker.bootstrapPeer(
          s.encodeState(),
          s.encodePeerMetadata(),
          bytes,
          host,
        );
        expect(
          await besluit(api(s).ref, wat, {
            ids: [wat === "accepteren" ? "0" : "1"],
          }),
        ).toBe(1);
        await echo(s, worker, true);
        expect(s.undo()).toBe(true);
        expect(s.listRevisions()).toEqual(voor);
        expect(s.storySegments("body")).toEqual(segmenten);
      } finally {
        s.destroy();
        worker.destroy();
      }
    },
  );
  it.each([
    ["accepteren", "0"],
    ["accepteren", "1"],
    ["weigeren", "0"],
    ["weigeren", "1"],
  ] as const)(
    "behoudt het exacte bereik bij één revisie %s/%s",
    async (wat, id) => {
      const bytes = doc(
        `<w:p>${paar(0, "Anna", "De kat.", "De kat.", true)}</w:p>`,
      );
      const s = await createYrsSession(),
        worker = await createYrsSession();
      try {
        const host = s.openDocx(bytes, true),
          voor = s.listRevisions(),
          segmenten = s.storySegments("body");
        worker.bootstrapPeer(
          s.encodeState(),
          s.encodePeerMetadata(),
          bytes,
          host,
        );
        expect(await besluit(api(s).ref, wat, { ids: [id] })).toBe(1);
        await echo(s, worker, true);
        expect(s.undo()).toBe(true);
        expect(s.listRevisions()).toEqual(voor);
        expect(s.storySegments("body")).toEqual(segmenten);
        expect(s.redo()).toBe(true);
      } finally {
        s.destroy();
        worker.destroy();
      }
    },
  );
  for (const wat of ["accepteren", "weigeren"] as const) {
    for (const bewaren of [false, true]) {
      it(`${wat}, workeropslag=${bewaren}: bewaart leidende revisies, kleuren en eerdere geschiedenis`, async () => {
        const bytes = doc(
          `<w:p>${paar(0, "Anna", "De kat.", "De kat.", true)}</w:p><w:p>${run("Einde")}</w:p>`,
        );
        const s = await createYrsSession(),
          worker = await createYrsSession();
        try {
          const host = s.openDocx(bytes, true);
          worker.bootstrapPeer(
            s.encodeState(),
            s.encodePeerMetadata(),
            bytes,
            host,
          );
          const paraId = s.paragraphs("body")[1].paraId;
          s.insertText({ story: "body", paraId, offset: 5 }, "!");
          s.addUndoBoundary();
          const voor = s.listRevisions(),
            segmenten = s.storySegments("body"),
            a = api(s);
          expect(await besluit(a.ref, wat)).toBe(2);
          expect(s.listRevisions()).toHaveLength(0);
          expect(a.sync).toHaveBeenCalledWith(true, ["body"]);
          await echo(s, worker, bewaren);
          expect(s.undo()).toBe(true);
          expect(s.listRevisions()).toEqual(voor);
          expect(s.storySegments("body")).toEqual(segmenten);
          const heropend = await createYrsSession();
          try {
            heropend.openDocx((await saveYrsDocx(s)).bytes, true);
            expect(
              heropend
                .listRevisions()
                .map((r) => [r.kind, r.author, r.date, r.preview]),
            ).toEqual(voor.map((r) => [r.kind, r.author, r.date, r.preview]));
          } finally {
            heropend.destroy();
          }
          await echo(s, worker, bewaren);
          expect(s.redo()).toBe(true);
          expect(s.listRevisions()).toHaveLength(0);
          const gekozen = inhoud((await saveYrsDocx(s)).bytes);
          expect(
            gekozen
              .slice(0, 7)
              .map((c) => c.t)
              .join(""),
          ).toBe("De kat.");
          expect(
            gekozen
              .slice(0, 7)
              .every(
                (c) => c.kleur === (wat === "accepteren" ? "0000FF" : "FF0000"),
              ),
          ).toBe(true);
          await echo(s, worker, bewaren);
          expect(s.undo()).toBe(true);
          expect(s.listRevisions()).toEqual(voor);
          expect(s.undo()).toBe(true);
          expect(s.paragraphs("body")[1].text).toBe("Einde");
          if (
            process.env.OOS_REVIEW_UNDO_FIXTURES &&
            wat === "accepteren" &&
            bewaren
          ) {
            mkdirSync(process.env.OOS_REVIEW_UNDO_FIXTURES, {
              recursive: true,
            });
            writeFileSync(
              join(
                process.env.OOS_REVIEW_UNDO_FIXTURES,
                "leading-revisions.docx",
              ),
              bytes,
            );
          }
        } finally {
          s.destroy();
          worker.destroy();
        }
      });
    }
    it(`${wat}: handelt gewone tekst en alineaopmaak af zonder native kernelwijziging`, async () => {
      for (const body of [
        `<w:p>${paar(1, "Anna")}</w:p>`,
        `<w:p><w:pPr><w:jc w:val="center"/><w:pPrChange w:id="9" w:author="Anna" w:date="${datum}"><w:pPr><w:jc w:val="left"/></w:pPr></w:pPrChange></w:pPr>${run("Alinea")}</w:p>`,
      ]) {
        const bytes = doc(body),
          s = await createYrsSession(),
          worker = await createYrsSession();
        try {
          const host = s.openDocx(bytes, true),
            voor = s.listRevisions(),
            segmenten = s.storySegments("body");
          expect(voor.length).toBeGreaterThan(0);
          worker.bootstrapPeer(
            s.encodeState(),
            s.encodePeerMetadata(),
            bytes,
            host,
          );
          expect(await besluit(api(s).ref, wat)).toBe(voor.length);
          await echo(s, worker, true);
          expect(s.undo()).toBe(true);
          expect(s.listRevisions()).toEqual(voor);
          expect(s.storySegments("body")).toEqual(segmenten);
        } finally {
          s.destroy();
          worker.destroy();
        }
      }
    });
  }
  it.each(["auteur", "ids", "selectie"])(
    "behoudt de reikwijdte %s en ongemoeide revisies",
    async (soort) => {
      const s = await createYrsSession();
      try {
        s.openDocx(
          doc(`<w:p>${paar(1, "Anna")}${run(" / ")}${paar(3, "Bram")}</w:p>`),
          true,
        );
        const voor = s.listRevisions(),
          eerste = voor.filter((r) => r.author === "Anna");
        s.setSelection(
          { ...eerste[0].range.start, story: "body" },
          { ...eerste[1].range.end, story: "body" },
        );
        const scope =
          soort === "auteur"
            ? { verborgen: new Set(["Bram"]) }
            : soort === "ids"
              ? { ids: eerste.map((r) => r.revisionId) }
              : { selectie: true };
        expect(await besluit(api(s).ref, "accepteren", scope)).toBe(2);
        const metadata = (r: (typeof voor)[number]) => [
          r.revisionId,
          r.kind,
          r.author,
          r.date,
          r.preview,
          r.story,
        ];
        expect(s.listRevisions().map(metadata)).toEqual(
          voor.filter((r) => r.author === "Bram").map(metadata),
        );
        expect(s.undo()).toBe(true);
        expect(s.listRevisions()).toEqual(voor);
      } finally {
        s.destroy();
      }
    },
  );
  it("maakt geen geschiedenis of weergavewijziging zonder passende revisies", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(doc(`<w:p>${paar(1, "Anna")}</w:p>`), true);
      const a = api(s),
        versie = s.version();
      expect(await besluit(a.ref, "accepteren", { ids: ["onbekend"] })).toBe(0);
      expect(s.version()).toBe(versie);
      expect(s.canUndo()).toBe(false);
      expect(a.sync).not.toHaveBeenCalled();
    } finally {
      s.destroy();
    }
  });
  it.each(["bewerkt", "vervangen"])(
    "weigert een intussen %s document zonder het te overschrijven",
    async (soort) => {
      const s = await createYrsSession(),
        ander = await createYrsSession();
      try {
        const bytes = doc(`<w:p>${paar(1, "Anna")}</w:p>`);
        s.openDocx(bytes, true);
        ander.openDocx(bytes, true);
        let huidig = s;
        const ref = {
          getEditorRef: () => ({
            getYrsSession: () => huidig,
            syncYrsInputState: vi.fn(),
          }),
        } as unknown as DocxEditorRef;
        const klaar = besluit(ref, "accepteren");
        if (soort === "bewerkt")
          s.insertText(
            {
              story: "body",
              paraId: s.paragraphs("body")[0].paraId,
              offset: 6,
            },
            "!",
          );
        else huidig = ander;
        const staat = s.encodeState(),
          revisies = s.listRevisions();
        await expect(klaar).rejects.toThrow("tijdens het beoordelen gewijzigd");
        expect(s.encodeState()).toEqual(staat);
        expect(s.listRevisions()).toEqual(revisies);
        expect(ander.canUndo()).toBe(false);
      } finally {
        s.destroy();
        ander.destroy();
      }
    },
  );
  it("bereidt hoofdtekst en tabelcel samen voor en houdt beide verhalen ongedaan maakbaar", async () => {
    const bytes = doc(
      `<w:p>${paar(1, "Anna")}</w:p><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2200"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p>${paar(3, "Bram")}</w:p></w:tc></w:tr></w:tbl>`,
    );
    const s = await createYrsSession(),
      worker = await createYrsSession();
    try {
      const host = s.openDocx(bytes, true),
        voor = s.listRevisions(),
        a = api(s);
      expect(voor).toHaveLength(4);
      const verhalen = [...new Set(voor.map((r) => r.story))];
      expect(verhalen).toHaveLength(2);
      const segmenten = verhalen.map((story) => s.storySegments(story));
      worker.bootstrapPeer(
        s.encodeState(),
        s.encodePeerMetadata(),
        bytes,
        host,
      );
      expect(await besluit(a.ref, "accepteren")).toBe(4);
      expect(a.sync).toHaveBeenCalledWith(true, verhalen);
      await echo(s, worker, true);
      expect(s.undo()).toBe(true);
      expect(s.listRevisions()).toEqual(voor);
      expect(verhalen.map((story) => s.storySegments(story))).toEqual(
        segmenten,
      );
    } finally {
      s.destroy();
      worker.destroy();
    }
  });
  it("laat de bron en geschiedenis ongemoeid als een later voorbereidingsbesluit faalt", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(doc(`<w:p>${paar(1, "Anna")}</w:p>`), true);
      const a = api(s),
        staat = s.encodeState(),
        voor = s.listRevisions();
      const lijst = vi
        .spyOn(s, "listRevisions")
        .mockReturnValue([...voor, { ...voor[0], revisionId: "verdwenen" }]);
      await expect(besluit(a.ref, "accepteren")).rejects.toThrow();
      lijst.mockRestore();
      expect(s.encodeState()).toEqual(staat);
      expect(s.listRevisions()).toEqual(voor);
      expect(s.canUndo()).toBe(false);
      expect(a.sync).not.toHaveBeenCalled();
    } finally {
      s.destroy();
    }
  });
});
