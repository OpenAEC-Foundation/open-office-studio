import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Lint, LintActie, LintGroep } from "./Lint";

const Icoon = () => <svg />;

function html(beginTab?: string) {
  return renderToStaticMarkup(
    <Lint
      bestand={() => {}}
      beginTab={beginTab}
      tabs={[
        {
          id: "start",
          naam: "Start",
          inhoud: (
            <>
              <LintGroep naam="Klembord">
                <LintActie icoon={Icoon} naam="Plakken" groot />
                <LintActie icoon={Icoon} naam="Vet" actief />
              </LintGroep>
              <LintGroep naam="Delete">
                <LintActie icoon={Icoon} naam="Delete Row" groot />
                <LintActie icoon={Icoon} naam="Delete Column" groot />
              </LintGroep>
            </>
          ),
        },
        { id: "invoegen", naam: "Invoegen", inhoud: null },
      ]}
    />,
  );
}

describe("lint: begintab", () => {
  it("begint op de gevraagde tab (bijvoorbeeld na opnieuw mounten)", () => {
    expect(html("invoegen")).toMatch(/aria-selected="true"[^>]*>Invoegen</);
  });
  it("valt terug op de eerste tab als die tab er niet (meer) is", () => {
    expect(html("tabel")).toMatch(/aria-selected="true"[^>]*>Start</);
  });
});

describe("lint: ARIA-structuur", () => {
  const markup = html();
  const doc = new DOMParserLite(markup);

  it("is een tablist met één geselecteerde, tabbare tab", () => {
    expect(doc.alle('role="tab"')).toHaveLength(2);
    expect(markup).toMatch(/role="tablist" aria-label="Lint"/);
    expect(doc.alle('aria-selected="true"')).toHaveLength(1);
    expect(markup).toMatch(/aria-selected="true"[^>]*tabindex="0"/);
    expect(markup).toMatch(/aria-selected="false"[^>]*tabindex="-1"/);
  });

  it("koppelt tab, tabpanel en toolbar", () => {
    const paneel = /role="tabpanel" id="([^"]+)" aria-labelledby="([^"]+)"/.exec(markup)!;
    expect(markup).toContain(`aria-controls="${paneel[1]}"`);
    expect(markup).toContain(`id="${paneel[2]}"`);
    expect(markup).toMatch(/role="toolbar" aria-label="Start"/);
  });

  it("geeft groepen en knoppen een toegankelijke naam", () => {
    expect(markup).toMatch(/role="group" aria-label="Klembord"/);
    expect(markup).toContain('aria-label="Plakken"');
    expect(markup).toMatch(/aria-label="Vet" aria-pressed="true"/);
    expect(markup).toMatch(/class="ribbon-actie ribbon-groot[^"]*" aria-label="Delete Row"/);
    expect(markup).toContain("<span>Delete Row</span>");
    expect(markup).toMatch(/class="ribbon-actie ribbon-groot[^"]*" aria-label="Delete Column"/);
    expect(markup).toContain("<span>Delete Column</span>");
    // De ingeklapte groepsknop meldt of zijn paneel open is.
    expect(markup).toMatch(/class="ribbon-groep-knop" aria-expanded="false" aria-controls="[^"]+"/);
  });

  it("verbergt decoratie en scrollknoppen voor schermlezers", () => {
    expect(markup).toMatch(/class="ribbon-scroll ribbon-scroll-links" hidden="" tabindex="-1" aria-hidden="true"/);
    expect(markup).toMatch(/class="ribbon-groep-naam" aria-hidden="true"/);
  });
});

/** Kleine teller op ruwe markup; genoeg voor attribuutcontroles. */
class DOMParserLite {
  constructor(private markup: string) {}
  alle(attribuut: string) {
    return this.markup.split(attribuut).slice(1);
  }
}
