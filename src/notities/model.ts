export type BlokSoort = "tekst" | "kop" | "subkop" | "opsomming" | "taak";
export type Blok = {
  id: string;
  soort: BlokSoort;
  tekst: string;
  vet: boolean;
  cursief: boolean;
  klaar: boolean;
};
export type Tekstvak = {
  id: string;
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  blokken: Blok[];
};
export type VakPlaats = Pick<Tekstvak, "x" | "y" | "breedte" | "hoogte">;
export const VAK_GRENZEN = {
  x: 10000,
  y: 20000,
  minBreedte: 200,
  maxBreedte: 2000,
  minHoogte: 80,
  maxHoogte: 5000,
};
export function begrensVak(plaats: VakPlaats): VakPlaats {
  const begrens = (v: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, Number.isFinite(v) ? v : min)));
  return {
    x: begrens(plaats.x, 0, VAK_GRENZEN.x),
    y: begrens(plaats.y, 0, VAK_GRENZEN.y),
    breedte: begrens(
      plaats.breedte,
      VAK_GRENZEN.minBreedte,
      VAK_GRENZEN.maxBreedte,
    ),
    hoogte: begrens(
      plaats.hoogte,
      VAK_GRENZEN.minHoogte,
      VAK_GRENZEN.maxHoogte,
    ),
  };
}
export function nieuwTekstvak(
  blokken: Blok[] = [nieuwBlok()],
  x = 40,
  y = 32,
): Tekstvak {
  return {
    id: nieuwId(),
    ...begrensVak({ x, y, breedte: 560, hoogte: 80 }),
    blokken,
  };
}
export type Pagina = {
  id: string;
  titel: string;
  bijgewerkt: string;
  vastgezet: boolean;
  verwijderd: boolean;
  vakken: Tekstvak[];
  markdown: string;
};
export type SectieSoort = "canvas" | "markdown";
export type Sectie = {
  id: string;
  naam: string;
  soort: SectieSoort;
  paginas: Pagina[];
};
export type Notitieboek = { id: string; naam: string; secties: Sectie[] };
export type Notities = {
  formaat: "openaec-notities";
  versie: 3;
  boeken: Notitieboek[];
};
export const OPSLAGSLEUTEL = "openaec-notities-v1";
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const MAX_MARKDOWN_TEKENS = 500000;
export const nieuwId = () => crypto.randomUUID();
export class NotitieBewaring {
  private verwacht: string | null = null;
  private geladen = false;
  constructor(private opslag: Pick<Storage, "getItem" | "setItem">) {}
  lees(): Notities {
    const ruw = this.opslag.getItem(OPSLAGSLEUTEL);
    const data = ruw === null ? nieuweNotities() : leesNotities(ruw);
    this.verwacht = ruw;
    this.geladen = true;
    return data;
  }
  schrijf(data: Notities) {
    if (!this.geladen)
      throw new Error(
        "De bestaande notities konden niet worden gelezen en zijn niet overschreven.",
      );
    if (this.opslag.getItem(OPSLAGSLEUTEL) !== this.verwacht)
      throw new Error(
        "De notities zijn in een ander venster gewijzigd. Maak een back-up van je huidige werk voordat je de lokale versie opnieuw opent.",
      );
    const tekst = JSON.stringify(data);
    leesNotities(tekst);
    this.opslag.setItem(OPSLAGSLEUTEL, tekst);
    this.verwacht = tekst;
  }
}
export function nieuwBlok(tekst = "", soort: BlokSoort = "tekst"): Blok {
  return {
    id: nieuwId(),
    soort,
    tekst,
    vet: false,
    cursief: false,
    klaar: false,
  };
}
export function nieuwePagina(
  titel = "Naamloze pagina",
  soort: SectieSoort = "canvas",
): Pagina {
  return {
    id: nieuwId(),
    titel,
    bijgewerkt: new Date().toISOString(),
    vastgezet: false,
    verwijderd: false,
    vakken: soort === "canvas" ? [nieuwTekstvak()] : [],
    markdown: "",
  };
}
export function nieuweNotities(): Notities {
  return {
    formaat: "openaec-notities",
    versie: 3,
    boeken: [
      {
        id: nieuwId(),
        naam: "Mijn notitieboek",
        secties: [
          {
            id: nieuwId(),
            naam: "Ideeën",
            soort: "canvas",
            paginas: [
              {
                ...nieuwePagina("Ruimte voor je ideeën"),
                vakken: [
                  nieuwTekstvak([
                    nieuwBlok(
                      "Een plek voor alles wat je wilt onthouden.",
                      "subkop",
                    ),
                    nieuwBlok(
                      "Verzamel je ideeën, maak een takenlijst of werk je overleg uit. Deel je notitieboek in met secties en pagina’s.",
                    ),
                    nieuwBlok("Vandaag", "kop"),
                    nieuwBlok("Een eerste idee vastleggen", "taak"),
                    nieuwBlok("Een eigen sectie aanmaken", "taak"),
                    nieuwBlok(
                      "Je notities blijven lokaal op deze computer. Maak regelmatig een back-up om ze mee te nemen naar een andere computer.",
                    ),
                  ]),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Accepteert uitsluitend tekstvelden en bekende bloktypen; invoer wordt nooit HTML. */
export function leesNotities(tekst: string): Notities {
  if (new TextEncoder().encode(tekst).length > MAX_BACKUP_BYTES)
    throw new Error("Kies een notitieback-up van maximaal 10 MB.");
  const data: unknown = JSON.parse(tekst);
  const ids = new Set<string>();
  let aantalPaginas = 0,
    aantalBlokken = 0;
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new Error("Ongeldige notitiestructuur.");
    return v as Record<string, unknown>;
  };
  const tekstveld = (v: unknown, max: number) => {
    if (typeof v !== "string" || v.length > max)
      throw new Error("Een tekstveld ontbreekt of is te lang.");
    return v;
  };
  const id = (v: unknown) => {
    const waarde = tekstveld(v, 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(waarde) || ids.has(waarde))
      throw new Error(
        "Een onderdeel heeft een ontbrekende of dubbele identificatie.",
      );
    ids.add(waarde);
    return waarde;
  };
  const lijst = (v: unknown, max: number, magLeeg = false): unknown[] => {
    if (!Array.isArray(v) || (!v.length && !magLeeg) || v.length > max)
      throw new Error("Een lijst is leeg of te groot.");
    return v;
  };
  const jaNee = (v: unknown) => {
    if (typeof v !== "boolean") throw new Error("Ongeldige markering.");
    return v;
  };
  const hoofd = object(data);
  if (
    hoofd.formaat !== "openaec-notities" ||
    ![1, 2, 3].includes(Number(hoofd.versie)) ||
    typeof hoofd.versie !== "number"
  )
    throw new Error("Dit is geen ondersteunde OpenAEC-notitieback-up.");
  const getal = (v: unknown, min: number, max: number) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      throw new Error("Ongeldige positie of afmeting van een tekstvak.");
    return v;
  };
  function leesBlokken(invoer: unknown): Blok[] {
    return lijst(invoer, 2000).map((invoer): Blok => {
      if (++aantalBlokken > 30000)
        throw new Error("De back-up bevat te veel tekstblokken.");
      const blok = object(invoer);
      if (
        !["tekst", "kop", "subkop", "opsomming", "taak"].includes(
          String(blok.soort),
        )
      )
        throw new Error("Onbekend tekstblok.");
      return {
        id: id(blok.id),
        soort: blok.soort as BlokSoort,
        tekst: tekstveld(blok.tekst, 100000),
        vet: jaNee(blok.vet),
        cursief: jaNee(blok.cursief),
        klaar: jaNee(blok.klaar),
      };
    });
  }
  const boeken = lijst(hoofd.boeken, 100).map((invoer) => {
    const boek = object(invoer);
    return {
      id: id(boek.id),
      naam: tekstveld(boek.naam, 200),
      secties: lijst(boek.secties, 200).map((invoer): Sectie => {
        const sectie = object(invoer);
        const soort = hoofd.versie === 3 ? sectie.soort : "canvas";
        if (soort !== "canvas" && soort !== "markdown")
          throw new Error("Onbekend sectietype.");
        return {
          id: id(sectie.id),
          naam: tekstveld(sectie.naam, 200),
          soort,
          paginas: lijst(sectie.paginas, 2000).map((invoer) => {
            if (++aantalPaginas > 5000)
              throw new Error("De back-up bevat te veel pagina’s.");
            const pagina = object(invoer);
            const bijgewerkt = tekstveld(pagina.bijgewerkt, 40);
            if (!Number.isFinite(Date.parse(bijgewerkt)))
              throw new Error("Ongeldige wijzigingsdatum.");
            const paginaId = id(pagina.id);
            const vakken: Tekstvak[] =
              hoofd.versie === 1
                ? [nieuwTekstvak(leesBlokken(pagina.blokken))]
                : lijst(pagina.vakken, 2000, true).map((invoer): Tekstvak => {
                    const vak = object(invoer);
                    return {
                      id: id(vak.id),
                      x: getal(vak.x, 0, VAK_GRENZEN.x),
                      y: getal(vak.y, 0, VAK_GRENZEN.y),
                      breedte: getal(
                        vak.breedte,
                        VAK_GRENZEN.minBreedte,
                        VAK_GRENZEN.maxBreedte,
                      ),
                      hoogte: getal(
                        vak.hoogte,
                        VAK_GRENZEN.minHoogte,
                        VAK_GRENZEN.maxHoogte,
                      ),
                      blokken: leesBlokken(vak.blokken),
                    };
                  });
            if (vakken.reduce((a, v) => a + v.blokken.length, 0) > 2000)
              throw new Error("De pagina bevat te veel tekstblokken.");
            if (hoofd.versie === 1) {
              while (ids.has(vakken[0].id)) vakken[0].id = nieuwId();
              ids.add(vakken[0].id);
            }
            return {
              id: paginaId,
              titel: tekstveld(pagina.titel, 300),
              bijgewerkt,
              vastgezet: jaNee(pagina.vastgezet),
              verwijderd: jaNee(pagina.verwijderd),
              vakken,
              markdown:
                hoofd.versie === 3
                  ? tekstveld(pagina.markdown, MAX_MARKDOWN_TEKENS)
                  : "",
            };
          }),
        };
      }),
    };
  });
  return { formaat: "openaec-notities", versie: 3, boeken };
}

/** Import voegt toe met nieuwe identificaties; bestaande notities blijven behouden. */
export function voegBackupToe(huidig: Notities, backup: Notities): Notities {
  const namen = new Set(
    huidig.boeken.map((b) => b.naam.toLocaleLowerCase("nl")),
  );
  function uniekeNaam(naam: string) {
    const basis = naam || "Naamloos notitieboek";
    let resultaat = basis;
    let teller = 1;
    while (namen.has(resultaat.toLocaleLowerCase("nl")))
      resultaat = `${basis.slice(0, 185)} (${++teller})`;
    namen.add(resultaat.toLocaleLowerCase("nl"));
    return resultaat;
  }
  return {
    ...huidig,
    boeken: [
      ...huidig.boeken,
      ...backup.boeken.map((boek) => ({
        ...boek,
        naam: uniekeNaam(boek.naam),
        id: nieuwId(),
        secties: boek.secties.map((sectie) => ({
          ...sectie,
          id: nieuwId(),
          paginas: sectie.paginas.map((pagina) => ({
            ...pagina,
            id: nieuwId(),
            vakken: pagina.vakken.map((vak) => ({
              ...vak,
              id: nieuwId(),
              blokken: vak.blokken.map((blok) => ({ ...blok, id: nieuwId() })),
            })),
          })),
        })),
      })),
    ],
  };
}
export function allePaginas(data: Notities) {
  return data.boeken.flatMap((boek) =>
    boek.secties.flatMap((sectie) =>
      sectie.paginas.map((pagina) => ({ boek, sectie, pagina })),
    ),
  );
}
export function paginaBlokken(pagina: Pagina): Blok[] {
  return [...pagina.vakken]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .flatMap((vak) => vak.blokken);
}
export function zoekPaginas(
  data: Notities,
  zoekterm: string,
  prullenbak = false,
) {
  const woorden = zoekterm
    .toLocaleLowerCase("nl")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return allePaginas(data)
    .filter(({ boek, sectie, pagina }) => {
      if (pagina.verwijderd !== prullenbak) return false;
      if (!woorden.length) return true;
      const tekst = [
        boek.naam,
        sectie.naam,
        pagina.titel,
        paginaTekst(pagina, sectie.soort),
      ]
        .join(" ")
        .toLocaleLowerCase("nl");
      return woorden.every((woord) => tekst.includes(woord));
    })
    .sort(
      (a, b) =>
        Number(b.pagina.vastgezet) - Number(a.pagina.vastgezet) ||
        b.pagina.bijgewerkt.localeCompare(a.pagina.bijgewerkt),
    );
}
export function paginaTekst(pagina: Pagina, soort: SectieSoort) {
  return soort === "markdown"
    ? pagina.markdown
    : paginaBlokken(pagina)
        .map((b) => b.tekst)
        .join("\n");
}
export function paginaAlsMarkdown(
  pagina: Pagina,
  soort: SectieSoort = "canvas",
) {
  if (soort === "markdown") return pagina.markdown;
  return `# ${ontsnapMarkdown(pagina.titel || "Naamloze pagina")}\n\n${canvasAlsMarkdown(pagina)}`;
}
const ontsnapMarkdown = (tekst: string) =>
  tekst.replace(/([\\`*_[\]<>])/g, "\\$1");
export function canvasAlsMarkdown(pagina: Pagina) {
  return (
    paginaBlokken(pagina)
      .map((blok) => {
        let tekst = ontsnapMarkdown(blok.tekst);
        if (blok.vet) tekst = `**${tekst}**`;
        if (blok.cursief) tekst = `*${tekst}*`;
        const prefix =
          blok.soort === "kop"
            ? "## "
            : blok.soort === "subkop"
              ? "### "
              : blok.soort === "opsomming"
                ? "- "
                : blok.soort === "taak"
                  ? `- [${blok.klaar ? "x" : " "}] `
                  : "";
        return prefix + tekst.replace(/\n/g, prefix ? "\n  " : "\n");
      })
      .join("\n\n") + "\n"
  );
}

/** Een ander sectietype krijgt eigen pagina’s; de bron blijft geheel intact. */
export function kopieerSectie(sectie: Sectie, soort: SectieSoort): Sectie {
  if (soort === sectie.soort) throw new Error("Kies een ander sectietype.");
  function tekstBlokken(tekst: string) {
    const blokken: Blok[] = [];
    while (tekst.length > 100000) {
      let einde = 100000;
      if (/[\uD800-\uDBFF]/.test(tekst[einde - 1])) einde--;
      blokken.push(nieuwBlok(tekst.slice(0, einde)));
      tekst = tekst.slice(einde);
    }
    blokken.push(nieuwBlok(tekst));
    return blokken;
  }
  return {
    id: nieuwId(),
    naam: `${sectie.naam.slice(0, 180)} (${soort === "markdown" ? "Markdown" : "Canvas"})`,
    soort,
    paginas: sectie.paginas.map((pagina) => {
      const markdown = soort === "markdown" ? canvasAlsMarkdown(pagina) : "";
      if (markdown.length > MAX_MARKDOWN_TEKENS)
        throw new Error(
          "Een pagina is te groot voor een Markdown-kopie (maximaal 500.000 tekens).",
        );
      return {
        ...pagina,
        id: nieuwId(),
        markdown,
        vakken:
          soort === "canvas"
            ? [nieuwTekstvak(tekstBlokken(pagina.markdown))]
            : [],
      };
    }),
  };
}
