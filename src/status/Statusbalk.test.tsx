import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "../i18n/config";
import { Statusbalk } from "./Statusbalk";
import { publiceerStatus } from "./statusinfo";
import { selectieStatistiek } from "./berekening";

const eigenaar = {};
afterEach(() => publiceerStatus(eigenaar, null));
function status(waarden: { kind: string; value?: number | string }[]) {
  publiceerStatus(eigenaar, { soort: "rekenblad", cellen: waarden.length, statistiek: selectieStatistiek([waarden]) });
  return renderToStaticMarkup(<Statusbalk soort="xlsx" moduleNaam="Spreadsheet"
    document={{ gereed: true, gewijzigd: false, zoom: null }} databaseGewijzigd={null}
    emailOngelezen={null} aantalGewijzigd={0} versieLabel="proef" />);
}

describe("status van een gedeeltelijk lege selectie (#28)", () => {
  it("toont de statistieken van één getal binnen een grotere selectie", () => {
    const html = status([{ kind: "number", value: 7 }, { kind: "empty" }]);
    expect(html).toContain(i18next.t("statusbar:spreadsheet.sum", { value: "7" }));
    expect(html).toContain(i18next.t("statusbar:spreadsheet.count", { value: "1" }));
    expect(html).toContain(i18next.t("statusbar:spreadsheet.average", { value: "7" }));
  });
  it("toont het aantal van één tekstcel zonder numerieke statistieken", () => {
    const html = status([{ kind: "text", value: "proef" }, { kind: "empty" }]);
    expect(html).toContain(i18next.t("statusbar:spreadsheet.count", { value: "1" }));
    expect(html).not.toContain(i18next.t("statusbar:spreadsheet.sum", { value: "0" }));
  });
  it("houdt een volledig lege selectie leeg", () => {
    expect(status([{ kind: "empty" }, { kind: "empty" }])).not.toContain('class="statusbalk-module"');
  });
});
