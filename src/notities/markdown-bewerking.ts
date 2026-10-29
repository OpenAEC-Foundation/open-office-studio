import i18next from "../i18n/config";
import { formatDatum } from "../i18n/opmaak";

const t = (sleutel: string) => i18next.t(`notes:insert.${sleutel}`) as string;

export type MarkdownOpdracht =
  | "tekst"
  | "kop"
  | "vet"
  | "cursief"
  | "opsomming"
  | "taak"
  | "code"
  | "link"
  | "tabel"
  | "datum";

export function bewerkMarkdown(
  tekst: string,
  start: number,
  einde: number,
  opdracht: MarkdownOpdracht,
) {
  const gekozen = tekst.slice(start, einde);
  let vervanging: string;
  let selectieStart = start;
  let selectieEinde: number;
  if (["kop", "tekst", "opsomming", "taak"].includes(opdracht)) {
    start = start === 0 ? 0 : tekst.lastIndexOf("\n", start - 1) + 1;
    const grens =
      einde > start && tekst[einde - 1] === "\n" ? einde - 1 : einde;
    const volgende = tekst.indexOf("\n", grens);
    einde = volgende < 0 ? tekst.length : volgende;
    const prefix = { kop: "## ", tekst: "", opsomming: "- ", taak: "- [ ] " }[
      opdracht as "kop" | "tekst" | "opsomming" | "taak"
    ];
    vervanging = tekst
      .slice(start, einde)
      .split("\n")
      .map(
        (regel) =>
          prefix + regel.replace(/^(?:#{1,6} |[-*+] (?:\[[ xX]\] )?)/, ""),
      )
      .join("\n");
    selectieStart = start;
    selectieEinde = start + vervanging.length;
  } else if (opdracht === "vet" || opdracht === "cursief") {
    const rand = opdracht === "vet" ? "**" : "*";
    const inhoud = gekozen || t("text");
    vervanging = rand + inhoud + rand;
    selectieStart = start + rand.length;
    selectieEinde = selectieStart + inhoud.length;
  } else if (opdracht === "link") {
    const label = gekozen || t("link");
    vervanging = `[${label}](https://)`;
    selectieStart = start + label.length + 3;
    selectieEinde = selectieStart + 8;
  } else {
    vervanging =
      opdracht === "code"
        ? `\n\`\`\`\n${gekozen || t("code")}\n\`\`\`\n`
        : opdracht === "tabel"
          ? `\n| ${t("tableItem")} | ${t("tableNote")} |\n| --- | --- |\n| | |\n`
          : formatDatum(new Date(), { dateStyle: "long" });
    selectieStart = start + vervanging.length;
    selectieEinde = selectieStart;
  }
  return {
    tekst: tekst.slice(0, start) + vervanging + tekst.slice(einde),
    start: selectieStart,
    einde: selectieEinde,
  };
}
