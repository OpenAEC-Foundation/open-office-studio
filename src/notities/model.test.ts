import { describe, expect, it } from "vitest";
import {
  allePaginas,
  begrensVak,
  leesNotities,
  nieuweNotities,
  NotitieBewaring,
  nieuwBlok,
  nieuwTekstvak,
  paginaBlokken,
  paginaAlsMarkdown,
  voegBackupToe,
  zoekPaginas,
} from "./model";

describe("Lokale notities", () => {
  it("leest de oude opslag zonder deze te wijzigen en bewaart alle tekst en taken bij de eerste opslag", () => {
    const voorbeeld = nieuweNotities();
    const { vakken, ...pagina } = allePaginas(voorbeeld)[0].pagina;
    vakken[0].blokken[3].klaar = true;
    const oud = {
      ...voorbeeld,
      versie: 1,
      boeken: [
        {
          ...voorbeeld.boeken[0],
          secties: [
            {
              ...voorbeeld.boeken[0].secties[0],
              paginas: [{ ...pagina, blokken: vakken[0].blokken }],
            },
          ],
        },
      ],
    };
    let waarde = JSON.stringify(oud);
    const oorspronkelijk = waarde;
    const bewaring = new NotitieBewaring({
      getItem: () => waarde,
      setItem: (_sleutel, tekst) => {
        waarde = tekst;
      },
    });
    const data = bewaring.lees();
    expect(waarde).toBe(oorspronkelijk);
    expect(data.versie).toBe(3);
    const overgezet = allePaginas(data)[0].pagina;
    expect(overgezet.vakken).toHaveLength(1);
    expect(paginaBlokken(overgezet)).toEqual(vakken[0].blokken);
    overgezet.vakken[0].x = 480;
    bewaring.schrijf(data);
    expect(leesNotities(waarde)).toEqual(data);
    expect(paginaBlokken(allePaginas(leesNotities(waarde))[0].pagina)).toEqual(
      vakken[0].blokken,
    );
  });
  it("bewaart vrije posities, afmetingen en meerdere tekstvakken in de back-up", () => {
    const data = nieuweNotities();
    const p = allePaginas(data)[0].pagina;
    p.vakken[0] = { ...p.vakken[0], x: 640, y: 420, breedte: 420, hoogte: 260 };
    p.vakken.push(
      nieuwTekstvak([nieuwBlok("Een idee op een andere plek")], 40, 32),
    );
    expect(leesNotities(JSON.stringify(data))).toEqual(data);
    expect(zoekPaginas(data, "andere plek")).toHaveLength(1);
    const md = paginaAlsMarkdown(p);
    expect(md.indexOf("Een idee op een andere plek")).toBeLessThan(
      md.indexOf("Een plek voor alles"),
    );
  });
  it.each([
    { x: -1 },
    { y: Infinity },
    { x: 10001 },
    { y: 20001 },
    { breedte: 0 },
    { breedte: 2001 },
    { hoogte: -1 },
    { hoogte: NaN },
  ])("weigert ongeldige canvascoördinaten of afmetingen: %j", (patch) => {
    const data = nieuweNotities();
    Object.assign(allePaginas(data)[0].pagina.vakken[0], patch);
    expect(() => leesNotities(JSON.stringify(data))).toThrow(
      "positie of afmeting",
    );
  });
  it("begrensd slepen en vergroten laat de tekst ongemoeid", () => {
    const vak = nieuwTekstvak([nieuwBlok("Dit blijft staan")]);
    const verplaatst = {
      ...vak,
      ...begrensVak({ x: -30, y: 20200, breedte: 60, hoogte: 9000 }),
    };
    expect(verplaatst).toMatchObject({
      x: 0,
      y: 20000,
      breedte: 200,
      hoogte: 5000,
    });
    expect(verplaatst.blokken).toBe(vak.blokken);
  });
  it("ondersteunt een lege vrije pagina zonder ongeldige back-up of zoekresultaat", () => {
    const data = nieuweNotities();
    const p = allePaginas(data)[0].pagina;
    p.vakken = [];
    expect(leesNotities(JSON.stringify(data))).toEqual(data);
    expect(paginaAlsMarkdown(p)).toBe(`# ${p.titel}\n\n\n`);
    expect(zoekPaginas(data, "uitgangspunten")).toHaveLength(0);
  });
  it("laat een oude schrijver nooit nieuw werk van een ander venster overschrijven", () => {
    let waarde: string | null = null;
    const opslag = {
      getItem: () => waarde,
      setItem: (_sleutel: string, tekst: string) => {
        waarde = tekst;
      },
    };
    const eerste = new NotitieBewaring(opslag),
      tweede = new NotitieBewaring(opslag);
    const a = eerste.lees(),
      b = tweede.lees();
    eerste.schrijf(a);
    expect(() => tweede.schrijf(b)).toThrow("ander venster");
    expect(JSON.parse(waarde!)).toEqual(a);
  });
  it("behoudt de oude gegevens bij volle opslag en laat daarna opnieuw opslaan toe", () => {
    let waarde: string | null = null,
      vol = false;
    const opslag = {
      getItem: () => waarde,
      setItem: (_sleutel: string, tekst: string) => {
        if (vol) throw new Error("Opslag vol");
        waarde = tekst;
      },
    };
    const bewaring = new NotitieBewaring(opslag);
    const data = bewaring.lees();
    bewaring.schrijf(data);
    const bewaard = waarde;
    allePaginas(data)[0].pagina.titel = "Nieuw werk";
    vol = true;
    expect(() => bewaring.schrijf(data)).toThrow("Opslag vol");
    expect(waarde).toBe(bewaard);
    vol = false;
    bewaring.schrijf(data);
    expect(leesNotities(waarde!).boeken[0].secties[0].paginas[0].titel).toBe(
      "Nieuw werk",
    );
  });
  it("overschrijft onleesbare bestaande notities nooit met een leeg notitieboek", () => {
    let waarde = "beschadigde gegevens";
    const bewaring = new NotitieBewaring({
      getItem: () => waarde,
      setItem: (_sleutel, tekst) => {
        waarde = tekst;
      },
    });
    expect(() => bewaring.lees()).toThrow();
    expect(() => bewaring.schrijf(nieuweNotities())).toThrow(
      "niet overschreven",
    );
    expect(waarde).toBe("beschadigde gegevens");
  });
  it("bewaart opmaak, taken en tekst verliesloos in een eigen back-up", () => {
    const data = nieuweNotities();
    const pagina = allePaginas(data)[0].pagina;
    pagina.vakken[0].blokken[3].klaar = true;
    pagina.vakken[0].blokken[1].tekst =
      '<script>alert("voorbeeld")</script> & ideeën';
    pagina.vakken[0].blokken[1].vet = true;
    expect(leesNotities(JSON.stringify(data))).toEqual(data);
    expect(paginaAlsMarkdown(pagina)).toContain(
      "- [x] Een eerste idee vastleggen",
    );
    expect(paginaAlsMarkdown(pagina)).toContain("\\<script\\>");
  });
  it("zoekt over notitieboeken en secties, zonder verwijderde pagina’s", () => {
    const data = nieuweNotities();
    expect(zoekPaginas(data, "Ideeën computer")).toHaveLength(1);
    allePaginas(data)[0].pagina.verwijderd = true;
    expect(zoekPaginas(data, "computer")).toHaveLength(0);
    expect(zoekPaginas(data, "computer", true)).toHaveLength(1);
  });
  it("importeert dezelfde back-up zonder bestaande gegevens of identificaties te overschrijven", () => {
    const data = nieuweNotities();
    const samen = voegBackupToe(data, leesNotities(JSON.stringify(data)));
    expect(samen.boeken[0]).toEqual(data.boeken[0]);
    expect(samen.boeken[1].id).not.toBe(samen.boeken[0].id);
    expect(samen.boeken[1].naam).toBe("Mijn notitieboek (2)");
    expect(leesNotities(JSON.stringify(samen)).boeken).toHaveLength(2);
    expect(allePaginas(samen)[1].pagina.vakken[0].blokken[0].id).not.toBe(
      allePaginas(data)[0].pagina.vakken[0].blokken[0].id,
    );
  });
  it.each(["dubbel", "bloktype", "datum", "markering", "versie", "leeg"])(
    "weigert beschadigde back-ups: %s",
    (fout) => {
      const data = nieuweNotities();
      const pagina = allePaginas(data)[0].pagina;
      if (fout === "dubbel") pagina.id = data.boeken[0].id;
      if (fout === "bloktype")
        (pagina.vakken[0].blokken[0] as unknown as { soort: string }).soort =
          "html";
      if (fout === "datum") pagina.bijgewerkt = "geen datum";
      if (fout === "markering")
        (pagina as unknown as { vastgezet: string }).vastgezet = "ja";
      if (fout === "versie")
        (data as unknown as { versie: number }).versie = 99;
      if (fout === "leeg") pagina.vakken[0].blokken = [];
      expect(() => leesNotities(JSON.stringify(data))).toThrow();
    },
  );
});
