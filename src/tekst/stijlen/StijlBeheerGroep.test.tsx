import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next, { zetTaal } from "../../i18n/config";
import { INTERFACETALEN } from "../../i18n/talen";
import { StijlBeheerGroep } from "./StijlGalerij";

const proef = vi.hoisted(() => ({ huidigeStijl: true, kanHerladen: true }));
vi.mock("./StijlenBeheer", () => ({
  useStijlen: () => ({
    alineastijl: proef.huidigeStijl ? "ProjectBody" : undefined,
    stijlen: {
      styles: proef.huidigeStijl
        ? [{ styleId: "ProjectBody", name: "Project Body", type: "paragraph" }]
        : [],
    },
    kanHerladen: proef.kanHerladen,
    open: vi.fn(),
    werkBij: vi.fn(),
    fout: vi.fn(),
  }),
  bevestigingOverslaan: () => false,
}));

const tekst = (waarde: string) =>
  renderToStaticMarkup(<span>{waarde}</span>).replace(/^<span>|<\/span>$/g, "");

afterEach(async () => {
  await zetTaal("nl");
  vi.restoreAllMocks();
});

describe("#363 gerenderde stijlbeheerlabels", () => {
  const toestanden = [
    {
      huidigeStijl: true,
      kanHerladen: true,
      disabled: [false, false, false, false, false],
    },
    {
      huidigeStijl: false,
      kanHerladen: true,
      disabled: [false, false, true, true, false],
    },
    {
      huidigeStijl: true,
      kanHerladen: false,
      disabled: [false, true, true, true, true],
    },
    {
      huidigeStijl: false,
      kanHerladen: false,
      disabled: [false, true, true, true, true],
    },
  ];
  it.each(
    INTERFACETALEN.flatMap((taal) =>
      toestanden.map((staat) => ({ taal, ...staat })),
    ),
  )(
    "$taal: stijl=$huidigeStijl, bewerkbaar=$kanHerladen",
    async ({ taal, huidigeStijl, kanHerladen, disabled }) => {
      await zetTaal(taal);
      Object.assign(proef, { huidigeStijl, kanHerladen });
      const html = renderToStaticMarkup(<StijlBeheerGroep />);
      expect(html).not.toMatch(/styles\.[\w.]|\{\{|writer:/);
      for (const sleutel of [
        "styles.gallery.group",
        "styles.shortcutPane",
        "styles.pane.newStyle",
        "styles.pane.styleSet",
      ])
        expect(html).toContain(tekst(i18next.t(`writer:${sleutel}`)));
      const name = "Project Body";
      expect(html).toContain(
        tekst(
          i18next.t(
            huidigeStijl
              ? "writer:styles.editor.modifyTitle"
              : "writer:styles.editor.modify",
            { name },
          ),
        ),
      );
      expect(html).toContain(
        tekst(
          i18next.t(
            huidigeStijl
              ? "writer:styles.update.title"
              : "writer:styles.update.confirm",
            { name },
          ),
        ),
      );
      const knoppen =
        html.match(/<button\b[^>]*class="ribbon-actie [^>]*>/g) ?? [];
      expect(knoppen).toHaveLength(5);
      for (const knop of knoppen) {
        expect(knop).toMatch(/\baria-label="[^"]+"/);
        expect(knop).toMatch(/\btitle="[^"]+"/);
      }
      // Pane/new/update/modify/set, independently of whether a style exists.
      expect(knoppen.map((knop) => /\bdisabled=""/.test(knop))).toEqual(
        disabled,
      );
    },
  );
});
