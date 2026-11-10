/** Dezelfde celankers ook op afdrukcanvas/PDF tekenen; onbekende vormen blijven zichtbaar als placeholder. */
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { Tekenobject, ObjectTekst } from "./tekenobjecten";
import { objectGeometrie } from "./objectGeometrie";
import { beeldVoorbeeldToegestaan } from "./beeldAfmetingen";
import { opnameVan } from "../export/pdf/opname";
import i18next from "../i18n/config";
import { groepOnderdelen, objectOmvang } from "./groepGeometrie";

function vorm(
  c: CanvasRenderingContext2D,
  o: Tekenobject,
  w: number,
  h: number,
) {
  c.beginPath();
  if (o.vorm === "ellipse")
    c.ellipse(
      w / 2,
      h / 2,
      Math.max(0.1, w / 2 - 1),
      Math.max(0.1, h / 2 - 1),
      0,
      0,
      2 * Math.PI,
    );
  else if (o.vorm === "roundRect")
    c.roundRect(
      1,
      1,
      Math.max(0, w - 2),
      Math.max(0, h - 2),
      Math.min(w, h) * 0.12,
    );
  else if (o.vorm === "line") {
    c.moveTo(0, 0);
    c.lineTo(w, h);
  } else if (o.vorm === "triangle" || o.vorm === "diamond") {
    c.moveTo(w / 2, 1);
    c.lineTo(w - 1, o.vorm === "diamond" ? h / 2 : h - 1);
    if (o.vorm === "diamond") c.lineTo(w / 2, h - 1);
    c.lineTo(1, o.vorm === "diamond" ? h / 2 : h - 1);
    c.closePath();
  } else c.rect(1, 1, Math.max(0, w - 2), Math.max(0, h - 2));
  if (o.vulling !== "none" && o.vorm !== "line") {
    c.fillStyle = o.vulling;
    c.fill();
  }
  if (o.lijn !== "none") {
    c.strokeStyle = o.lijn;
    c.lineWidth = o.lijndikte;
    c.stroke();
  }
}
type Stuk = ObjectTekst["stukken"][number];
const font = (s: Stuk) =>
  `${s.cursief ? "italic " : ""}${s.vet ? "bold " : ""}${s.grootte}px ${s.lettertype ? JSON.stringify(s.lettertype) : "sans-serif"}`;
function placeholder(
  c: CanvasRenderingContext2D,
  o: Tekenobject,
  breedte: number,
  hoogte: number,
) {
  c.save();
  c.beginPath();
  c.rect(0, 0, breedte, hoogte);
  c.clip();
  c.fillStyle = "#eef0f3";
  c.fillRect(0, 0, breedte, hoogte);
  c.strokeStyle = "#697181";
  c.strokeRect(0, 0, breedte, hoogte);
  c.fillStyle = "#303640";
  c.font = "12px sans-serif";
  c.fillText(o.naam, 6, 16, Math.max(1, breedte - 12));
  c.fillText(
    i18next.t("spreadsheet:objects.previewLimited"),
    6,
    32,
    Math.max(1, breedte - 12),
  );
  c.restore();
}
function tekst(
  c: CanvasRenderingContext2D,
  o: Tekenobject,
  w: number,
  h: number,
) {
  const breed = Math.max(1, w - 16),
    regels: {
      stukken: { s: Stuk; tekst: string; breedte: number }[];
      breedte: number;
      hoogte: number;
      uitlijning: string;
    }[] = [];
  for (const p of o.tekstOpmaak) {
    let regel = {
      stukken: [] as { s: Stuk; tekst: string; breedte: number }[],
      breedte: 0,
      hoogte: 14.666 * 1.2,
      uitlijning: p.uitlijning,
    };
    const nieuw = () => {
      regels.push(regel);
      regel = { ...regel, stukken: [], breedte: 0 };
    };
    for (const s of p.stukken) {
      c.font = font(s);
      for (const deel of s.tekst.split(/(\n|[ \t]+)/)) {
        if (deel === "\n") {
          nieuw();
          continue;
        }
        if (!deel) continue;
        const b = c.measureText(deel).width;
        if (
          regel.breedte + b > breed &&
          regel.stukken.length &&
          !/^\s+$/.test(deel)
        )
          nieuw();
        regel.stukken.push({ s, tekst: deel, breedte: b });
        regel.breedte += b;
        regel.hoogte = Math.max(regel.hoogte, s.grootte * 1.2);
      }
    }
    nieuw();
  }
  const totaal = regels.reduce((n, r) => n + r.hoogte, 0);
  let y =
    o.verticaal === "center"
      ? Math.max(8, (h - totaal) / 2)
      : o.verticaal === "flex-end"
        ? Math.max(8, h - 8 - totaal)
        : 8;
  c.save();
  c.beginPath();
  // DOM overflow clips to the shape frame, including its padding area.
  c.rect(0, 0, w, h);
  c.clip();
  c.textBaseline = "alphabetic";
  for (const r of regels) {
    let x =
      r.uitlijning === "center"
        ? Math.max(8, (w - r.breedte) / 2)
        : r.uitlijning === "right"
          ? Math.max(8, w - 8 - r.breedte)
          : 8;
    const basis = y + r.hoogte * 0.8;
    for (const deel of r.stukken) {
      c.font = font(deel.s);
      c.fillStyle = deel.s.kleur;
      c.fillText(deel.tekst, x, basis);
      if (deel.s.onderstreept) {
        c.beginPath();
        c.strokeStyle = deel.s.kleur;
        c.lineWidth = Math.max(0.5, deel.s.grootte / 16);
        c.moveTo(x, basis + deel.s.grootte * 0.1);
        c.lineTo(x + deel.breedte, basis + deel.s.grootte * 0.1);
        c.stroke();
      }
      x += deel.breedte;
    }
    y += r.hoogte;
  }
  c.restore();
}
async function tekenInhoud(
  c: CanvasRenderingContext2D,
  o: Tekenobject,
  w: number,
  h: number,
) {
  if (o.soort === "groep" && o.groep) {
    const onderdelen = groepOnderdelen(o.groep, w, h, o.spiegelX, o.spiegelY);
    if (!onderdelen) {
      placeholder(c, o, w, h);
      return;
    }
    c.save();
    try {
      for (const { object: kind, matrix } of onderdelen) {
        const p = kind.plek;
        c.save();
        try {
          c.transform(...matrix);
          await tekenInhoud(c, kind, p.breedte, p.hoogte);
        } finally {
          c.restore();
        }
      }
    } finally {
      c.restore();
    }
  } else if (
    o.soort === "afbeelding" &&
    o.media &&
    o.mime &&
    beeldVoorbeeldToegestaan(o.media)
  ) {
    let beeld: ImageBitmap;
    try {
      beeld = await createImageBitmap(
        new Blob([new Uint8Array(o.media)], { type: o.mime }),
      );
    } catch {
      placeholder(c, o, w, h);
      return;
    }
    c.save();
    try {
      c.beginPath();
      c.rect(0, 0, w, h);
      c.clip();
      if (o.spiegelX) {
        c.translate(w, 0);
        c.scale(-1, 1);
      }
      if (o.spiegelY) {
        c.translate(0, h);
        c.scale(1, -1);
      }
      const crop = o.uitsnede ?? { links: 0, rechts: 0, boven: 0, onder: 0 };
      const cw = Math.max(0.001, 1 - crop.links - crop.rechts),
        ch = Math.max(0.001, 1 - crop.boven - crop.onder);
      c.drawImage(
        beeld,
        (-crop.links * w) / cw,
        (-crop.boven * h) / ch,
        w / cw,
        h / ch,
      );
    } finally {
      c.restore();
      if (!opnameVan(c.canvas)) beeld.close();
    }
  } else if (o.soort === "vorm") {
    c.save();
    if (o.spiegelX) {
      c.translate(w, 0);
      c.scale(-1, 1);
    }
    if (o.spiegelY) {
      c.translate(0, h);
      c.scale(1, -1);
    }
    vorm(c, o, w, h);
    c.restore();
    tekst(c, o, w, h);
  } else placeholder(c, o, w, h);
}
export async function tekenObjectenOpCanvas(
  c: CanvasRenderingContext2D,
  h: Pick<WorkbookHandle, "cellPosition">,
  objecten: Tekenobject[],
  blok: { rij1: number; kol1: number },
  breedte: number,
  hoogte: number,
  x: number,
  y: number,
  factor: number,
) {
  if (!objecten.length) return;
  const oorsprong = h.cellPosition(
    objecten[0]?.blad ?? 0,
    blok.rij1,
    blok.kol1,
  );
  for (const o of objecten) {
    const p = objectGeometrie(h, o),
      px = p.x - oorsprong.x,
      py = p.y - oorsprong.y;
    const b = objectOmvang(o, p.breedte, p.hoogte);
    if (
      px + b.rechts < 0 ||
      py + b.onder < 0 ||
      px + b.links > breedte ||
      py + b.boven > hoogte
    )
      continue;
    c.save();
    try {
      c.setTransform(factor, 0, 0, factor, x, y);
      c.beginPath();
      c.rect(0, 0, breedte, hoogte);
      c.clip();
      c.translate(px + p.breedte / 2, py + p.hoogte / 2);
      c.rotate((o.rotatie * Math.PI) / 180);
      c.translate(-p.breedte / 2, -p.hoogte / 2);
      await tekenInhoud(c, o, p.breedte, p.hoogte);
    } finally {
      c.restore();
    }
  }
}
