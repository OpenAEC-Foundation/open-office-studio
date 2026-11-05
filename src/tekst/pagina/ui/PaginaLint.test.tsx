import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "../../../i18n/config";
import { Lint } from "../../../openaec-lint";
import { kopVoetTab } from "./PaginaLint";
import type { PaginaFuncties } from "./usePagina";

function pagina() {
  const stand = vi.fn(() => ({ titelpagina: false, evenOneven: false }));
  // Deze lintproef voert geen documentopdrachten uit.
  const p = {
    t: i18next.getFixedT("nl", "writer"),
    stand,
    beschikbaar: true,
    bewerkbaar: true,
    kopVoet: false,
  } as unknown as PaginaFuncties;
  return { p, stand };
}

function lint(p: PaginaFuncties, beginTab = "start") {
  return renderToStaticMarkup(
    <Lint
      beginTab={beginTab}
      tabs={[
        { id: "start", naam: "Start", inhoud: <span>Gewone tekst bewerken</span> },
        kopVoetTab(p),
      ]}
    />,
  );
}

describe("kop- en voettekstlint: secties alleen uitlezen voor het actieve tabblad", () => {
  it("leest geen secties voor een niet-actief tabblad", () => {
    const { p, stand } = pagina();
    for (let n = 0; n < 5; n++) lint(p);
    expect(stand).not.toHaveBeenCalled();
  });

  it("leest de huidige opties wanneer het tabblad zichtbaar wordt", () => {
    const { p, stand } = pagina();
    const tab = kopVoetTab(p);
    stand.mockReturnValue({ titelpagina: true, evenOneven: false });
    const html = renderToStaticMarkup(tab.inhoud);
    expect(stand).toHaveBeenCalledTimes(1);
    expect(html).toMatch(/aria-label="Eerste pagina anders" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Even en oneven anders" aria-pressed="false"/);
  });

  it("blijft wijzigingen en beschikbaarheid op het actieve tabblad volgen", () => {
    const { p, stand } = pagina();
    lint(p, "kopvoet");
    stand.mockReturnValue({ titelpagina: false, evenOneven: true });
    const html = lint({ ...p, beschikbaar: false }, "kopvoet");
    expect(stand).toHaveBeenCalledTimes(2);
    expect(html).toMatch(/aria-label="Even en oneven anders" aria-pressed="true"/);
    expect(html).toMatch(/disabled=""[^>]*aria-label="Eerste pagina anders"/);
  });
});
