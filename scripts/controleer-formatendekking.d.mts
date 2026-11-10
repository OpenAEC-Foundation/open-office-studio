import type dekking from "../docs/tests/formatendekking/dekking.json";
import type bronnen from "../docs/tests/formatendekking/bronnen.json";
import type resultaat from "../docs/tests/formatendekking/resultaat-windows.json";

export function controleerFormatendekking(): {
  dekking: typeof dekking;
  bronnen: typeof bronnen;
  resultaat: typeof resultaat;
};
export function dekkingTabel(gegevens: { dekking: typeof dekking }): string;
