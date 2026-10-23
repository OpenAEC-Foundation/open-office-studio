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
    const inhoud = gekozen || "tekst";
    vervanging = rand + inhoud + rand;
    selectieStart = start + rand.length;
    selectieEinde = selectieStart + inhoud.length;
  } else if (opdracht === "link") {
    vervanging = `[${gekozen || "link"}](https://)`;
    selectieStart = start + (gekozen || "link").length + 3;
    selectieEinde = selectieStart + 8;
  } else {
    vervanging =
      opdracht === "code"
        ? `\n\`\`\`\n${gekozen || "code"}\n\`\`\`\n`
        : opdracht === "tabel"
          ? "\n| Onderdeel | Notitie |\n| --- | --- |\n| | |\n"
          : new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(
              new Date(),
            );
    selectieStart = start + vervanging.length;
    selectieEinde = selectieStart;
  }
  return {
    tekst: tekst.slice(0, start) + vervanging + tekst.slice(einde),
    start: selectieStart,
    einde: selectieEinde,
  };
}
