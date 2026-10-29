/**
 * Pagina's van een presentatie: dia's, hand-outs (1, 2, 3, 4, 6 of 9 per
 * pagina) en notitiepagina's. Dia's worden getekend met dezelfde routine als
 * de editor (`paintSlide`), op de resolutie die het doel vraagt.
 */
import i18next from "../i18n/config";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { SlideDisplayList } from "@betteroffice/pptx";
import {
  papierMaat,
  type AfdrukDocument,
  type AfdrukPagina,
  type TekstStuk,
} from "./model";
import {
  BAND,
  PAGINARAND,
  handoutIndeling,
  inhoudsvlak,
  notitieIndeling,
  verdeelRegels,
  type PresentatieInstellingen,
  type Rechthoek,
} from "./indeling";
import { metTekstopname, naarPunten } from "./tekstopname";
import {
  breekAf,
  datumTekst,
  meter,
  paginaCanvas,
  schrijf,
} from "./tekenhulp";

export { standaardPresentatie } from "./indeling";
export type { PresentatieIndeling, PresentatieInstellingen } from "./indeling";

const PX_NAAR_PT = 0.75;
const NOTITIEGROOTTE = 12;
const REGELHOOGTE = NOTITIEGROOTTE * 1.35;

interface Dia {
  lijst: SlideDisplayList;
  notities: string;
}

/** Tekent één dia op een eigen canvas en neemt de tekst op. */
async function tekenDia(
  api: PptxEditorApi,
  dia: Dia,
  doelBreedtePt: number,
  dpi: number,
) {
  const { paintSlide, decodePresentationImage } = await import(
    "@betteroffice/pptx"
  );
  const pxBreedte = dia.lijst.width;
  const schaal = Math.max(
    0.1,
    (doelBreedtePt * dpi) / 72 / Math.max(1, pxBreedte),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(dia.lijst.width * schaal));
  canvas.height = Math.max(1, Math.round(dia.lijst.height * schaal));
  const ctx = canvas.getContext("2d")!;
  const cache = new Map<string, Promise<CanvasImageSource | null>>();
  const { tekstVan } = await metTekstopname(() =>
    paintSlide(ctx, dia.lijst, 1, schaal, {
      resolveImage: (id) => {
        if (!cache.has(id)) {
          let bytes: Uint8Array | null = null;
          try {
            bytes = api.handle.mediaBytes(id);
          } catch {
            bytes = null;
          }
          cache.set(
            id,
            bytes
              ? decodePresentationImage(
                  bytes,
                  i18next.t("print:errors.imageUnreadable"),
                ).catch(() => null)
              : Promise.resolve(null),
          );
        }
        return cache.get(id)!;
      },
    }),
  );
  return { canvas, tekst: tekstVan(canvas) };
}

/** Zet een dia-canvas in een vak van de pagina; geeft de tekst in paginapunten. */
async function plaatsDia(
  api: PptxEditorApi,
  ctx: CanvasRenderingContext2D,
  dia: Dia,
  vak: Rechthoek,
  dpi: number,
  kader: boolean,
): Promise<TekstStuk[]> {
  const getekend = await tekenDia(api, dia, vak.breedte, dpi);
  ctx.drawImage(getekend.canvas, vak.x, vak.y, vak.breedte, vak.hoogte);
  if (kader) {
    ctx.save();
    ctx.strokeStyle = "#8a8f98";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(vak.x, vak.y, vak.breedte, vak.hoogte);
    ctx.restore();
  }
  return naarPunten(
    getekend.tekst,
    vak.breedte / getekend.canvas.width,
    vak.x,
    vak.y,
  );
}

function kopEnVoet(
  ctx: CanvasRenderingContext2D,
  breedte: number,
  hoogte: number,
  titel: string,
  pagina: number,
  totaal: number,
) {
  const stukken = [
    schrijf(ctx, titel, PAGINARAND, PAGINARAND + 12, 9, { kleur: "#555" }),
    schrijf(ctx, datumTekst(), breedte - PAGINARAND, PAGINARAND + 12, 9, {
      uitlijning: "rechts",
      kleur: "#555",
    }),
    schrijf(
      ctx,
      i18next.t("print:pages.pageNumberOfTotal", { page: pagina, total: totaal }),
      breedte / 2,
      hoogte - PAGINARAND - BAND + 14,
      9,
      { uitlijning: "midden", kleur: "#555" },
    ),
  ];
  return stukken.filter((s): s is TekstStuk => !!s);
}

function maat(
  instellingen: PresentatieInstellingen,
  dia: SlideDisplayList | undefined,
) {
  if (instellingen.papier === "dia" && dia)
    return {
      breedte: dia.width * PX_NAAR_PT,
      hoogte: dia.height * PX_NAAR_PT,
    };
  return papierMaat(
    instellingen.papier === "dia" ? "A4" : instellingen.papier,
    instellingen.stand,
  );
}

/** Alle pagina's voor de gekozen indeling. */
export async function presentatiePaginas(
  api: PptxEditorApi,
  titel: string,
  instellingen: PresentatieInstellingen,
): Promise<AfdrukDocument> {
  await api.flushPendingInput();
  const snapshot = api.handle.snapshot();
  const dias: Dia[] = snapshot.slides.map((slide, index) => ({
    lijst: api.handle.layoutSlide(index),
    notities: slide.notes ?? "",
  }));
  if (!dias.length) throw new Error(i18next.t("print:errors.noSlides"));
  const verhouding = dias[0].lijst.width / dias[0].lijst.height;
  const { breedte, hoogte } = maat(instellingen, dias[0].lijst);
  const paginas: AfdrukPagina[] = [];
  const bladwijzers: AfdrukDocument["bladwijzers"] = [];
  const diaTitel = (index: number) => {
    const eerste = snapshot.slides[index]?.shapes
      .flatMap((s) => s.textStories)
      .flatMap((v) => v.paragraphs)
      .map((p) => p.runs.map((r) => r.text).join(""))
      .find((t) => t.trim());
    return eerste
      ? i18next.t("presentation:print.slideWithTitle", {
          number: index + 1,
          title: eerste.trim().slice(0, 80),
        })
      : i18next.t("presentation:print.slide", { number: index + 1 });
  };

  if (instellingen.indeling === "dias") {
    dias.forEach((dia, index) => {
      bladwijzers.push({ titel: diaTitel(index), pagina: paginas.length });
      paginas.push({
        breedte,
        hoogte,
        label: i18next.t("print:pages.slide", { number: index + 1 }),
        teken: async (dpi) => {
          const { canvas, ctx } = paginaCanvas(breedte, hoogte, dpi);
          const vak =
            instellingen.papier === "dia"
              ? { x: 0, y: 0, breedte, hoogte }
              : pasInPagina(breedte, hoogte, verhouding);
          const tekst = await plaatsDia(
            api,
            ctx,
            dia,
            vak,
            dpi,
            instellingen.kader && instellingen.papier !== "dia",
          );
          return { canvas, tekst };
        },
      });
    });
  } else if (instellingen.indeling === "handout") {
    const vakken = handoutIndeling(
      instellingen.perPagina,
      breedte,
      hoogte,
      verhouding,
    );
    const totaal = Math.ceil(dias.length / vakken.length);
    for (let p = 0; p < totaal; p++) {
      const eerste = p * vakken.length;
      const groep = dias.slice(eerste, eerste + vakken.length);
      groep.forEach((_, i) =>
        bladwijzers.push({
          titel: diaTitel(eerste + i),
          pagina: paginas.length,
          y: vakken[i].dia.y,
        }),
      );
      paginas.push({
        breedte,
        hoogte,
        label: i18next.t("print:pages.handout", {
          page: p + 1,
          first: eerste + 1,
          last: eerste + groep.length,
        }),
        teken: async (dpi) => {
          const { canvas, ctx } = paginaCanvas(breedte, hoogte, dpi);
          const tekst: TekstStuk[] = kopEnVoet(
            ctx,
            breedte,
            hoogte,
            titel,
            p + 1,
            totaal,
          );
          for (let i = 0; i < groep.length; i++) {
            const vak = vakken[i];
            tekst.push(
              ...(await plaatsDia(api, ctx, groep[i], vak.dia, dpi, true)),
            );
            if (vak.regels) {
              ctx.save();
              ctx.strokeStyle = "#b8bcc4";
              ctx.lineWidth = 0.5;
              const aantal = Math.max(3, Math.floor(vak.regels.hoogte / 22));
              for (let r = 1; r <= aantal; r++) {
                const y = vak.regels.y + (r * vak.regels.hoogte) / aantal;
                ctx.beginPath();
                ctx.moveTo(vak.regels.x, y);
                ctx.lineTo(vak.regels.x + vak.regels.breedte, y);
                ctx.stroke();
              }
              ctx.restore();
            }
          }
          return { canvas, tekst };
        },
      });
    }
  } else {
    // Notitiepagina's: dia boven, notities eronder; lange notities lopen door.
    const indeling = notitieIndeling(breedte, hoogte, verhouding);
    const meet = meter(NOTITIEGROOTTE);
    const perDia = dias.map((dia) => {
      const regels = breekAf(meet, dia.notities, indeling.notities.breedte);
      const leeg = !dia.notities.trim();
      return verdeelRegels(
        leeg ? [] : regels,
        Math.floor(indeling.notities.hoogte / REGELHOOGTE),
        Math.floor(indeling.vervolg.hoogte / REGELHOOGTE),
      );
    });
    const totaal = perDia.reduce((n, delen) => n + delen.length, 0);
    let nummer = 0;
    perDia.forEach((delen, index) => {
      delen.forEach((regels, deel) => {
        const paginaNummer = ++nummer;
        if (deel === 0)
          bladwijzers.push({ titel: diaTitel(index), pagina: paginas.length });
        paginas.push({
          breedte,
          hoogte,
          label:
            deel === 0
              ? i18next.t("print:pages.notes", { number: index + 1 })
              : i18next.t("print:pages.notesContinued", { number: index + 1 }),
          teken: async (dpi) => {
            const { canvas, ctx } = paginaCanvas(breedte, hoogte, dpi);
            const tekst = kopEnVoet(
              ctx,
              breedte,
              hoogte,
              titel,
              paginaNummer,
              totaal,
            );
            let y: number;
            if (deel === 0) {
              tekst.push(
                ...(await plaatsDia(
                  api,
                  ctx,
                  dias[index],
                  indeling.dia,
                  dpi,
                  true,
                )),
              );
              y = indeling.notities.y + NOTITIEGROOTTE;
            } else {
              const kop = schrijf(
                ctx,
                i18next.t("presentation:print.slideContinued", {
                  number: index + 1,
                }),
                indeling.vervolg.x,
                indeling.vervolg.y + 10,
                10,
                { vet: true, kleur: "#555" },
              );
              if (kop) tekst.push(kop);
              y = indeling.vervolg.y + 10 + REGELHOOGTE + NOTITIEGROOTTE;
            }
            for (const regel of regels) {
              const stuk = schrijf(
                ctx,
                regel,
                indeling.notities.x,
                y,
                NOTITIEGROOTTE,
              );
              if (stuk) tekst.push(stuk);
              y += REGELHOOGTE;
            }
            return { canvas, tekst };
          },
        });
      });
    });
  }
  return { titel, paginas, bladwijzers };
}

function pasInPagina(breedte: number, hoogte: number, verhouding: number) {
  const vlak = inhoudsvlak(breedte, hoogte);
  // Dia's op papier: zonder kop- en voetband, wel met de gewone rand.
  const vak = {
    x: PAGINARAND,
    y: PAGINARAND,
    breedte: vlak.breedte,
    hoogte: hoogte - 2 * PAGINARAND,
  };
  let b = vak.breedte;
  let h = b / verhouding;
  if (h > vak.hoogte) {
    h = vak.hoogte;
    b = h * verhouding;
  }
  return {
    x: vak.x + (vak.breedte - b) / 2,
    y: vak.y + (vak.hoogte - h) / 2,
    breedte: b,
    hoogte: h,
  };
}
