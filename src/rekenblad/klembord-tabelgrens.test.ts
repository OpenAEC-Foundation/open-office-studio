import { describe, expect, it } from "vitest";
import { leesHtmlTabel } from "./klembordLogica";

describe("één klembordtabel per plakbewerking (#20)", () => {
  it("plakt geen tweede tabel onder de eerste en leest daarvan geen ruwe getallen", () => {
    const getallen: unknown[] = [];
    const html =
      '<table><tr><td x:num="2">2</td><td>Eerste</td></tr></table>' +
      '<p>Tussenstuk</p><table><tr><td x:num="99">99</td><td>Tweede</td></tr></table>';
    expect(leesHtmlTabel(html, (...cel) => getallen.push(cel))).toEqual([
      ["2", "Eerste"],
    ]);
    expect(getallen).toEqual([[0, 0, 2]]);
  });
  it("begrenst ook een sluit-tag met witruimte en hoofdletters", () => {
    expect(
      leesHtmlTabel(
        "<TABLE><TR><TD>Eerste</TD></TR></TABLE >" +
          "<TABLE><TR><TD>Tweede</TD></TR></TABLE>",
      ),
    ).toEqual([["Eerste"]]);
  });
});

it("negeert tabelvoorbeelden in commentaar en attribuutwaarden bij het bepalen van de grens", () => {
  expect(
    leesHtmlTabel(
      "<!-- <table><tr><td>voorbeeld</td></tr></table> -->" +
        '<div title="<table>"></div><table><tr><td>Echte waarde</td></tr></table>' +
        "<table><tr><td>Tweede</td></tr></table>",
    ),
  ).toEqual([["Echte waarde"]]);
});
