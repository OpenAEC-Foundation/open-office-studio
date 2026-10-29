/**
 * Eenvoudige, eigen RTF-lezer (RTF 1.x) voor openen zonder runtime.
 *
 * Wel: tekst met codepagina’s en Unicode (\uN), vet, cursief, onderstreept,
 * doorgehaald, super- en subschrift, lettergrootte, tekstkleur, uitlijning,
 * koppen (via \outlinelevel of stijlnamen "heading N"/"Kop N"), regeleinden,
 * tabs, pagina-einden, eenvoudige tabellen (\trowd … \cell … \row),
 * hyperlinks (HYPERLINK-velden) en PNG/JPEG-afbeeldingen (\pict).
 *
 * Niet: kop- en voetteksten, voet- en eindnoten, opmerkingen, objecten
 * (\object), WMF/EMF-afbeeldingen, tekstvakken, geneste tabellen,
 * celsamenvoegingen en exacte lijstnummering (de zichtbare
 * opsommingstekst uit \listtext/\pntext blijft staan). Die worden geteld
 * en in het rapport genoemd.
 */
import i18next from "../i18n/config";
import type {
  Blok,
  Inline,
  Tekstdocument,
  Tekstopmaak,
  Uitlijning,
} from "./tekstmodel";
import { afbeeldingstype, veiligeLink } from "./tekstmodel";

export interface RtfImport {
  document: Tekstdocument;
  /** Overgeslagen onderdelen, per soort geteld. */
  overgeslagen: Record<string, number>;
}

interface Toestand extends Tekstopmaak {
  /** Aantal bytes/tekens na \uN over te slaan. */
  uc: number;
  font: number;
  overslaan: boolean;
}

interface Alineastaat {
  uitlijning?: Uitlijning;
  stijl: number;
  overzichtsniveau?: number;
  inTabel: boolean;
}

const CHARSET_CODEPAGINA: Record<number, number> = {
  0: 1252,
  1: 1252,
  2: 1252,
  77: 10000,
  128: 932,
  129: 949,
  134: 936,
  136: 950,
  161: 1253,
  162: 1254,
  163: 1258,
  177: 1255,
  178: 1256,
  186: 1257,
  204: 1251,
  222: 874,
  238: 1250,
};

const decoders = new Map<number, TextDecoder>();
function decoder(codepagina: number) {
  let d = decoders.get(codepagina);
  if (!d) {
    const label =
      codepagina === 65001
        ? "utf-8"
        : codepagina === 10000
          ? "macintosh"
          : codepagina === 932
            ? "shift_jis"
            : codepagina === 936
              ? "gbk"
              : codepagina === 949
                ? "euc-kr"
                : codepagina === 950
                  ? "big5"
                  : codepagina === 874
                    ? "windows-874"
                    : `windows-${codepagina}`;
    try {
      d = new TextDecoder(label);
    } catch {
      d = new TextDecoder("windows-1252");
    }
    decoders.set(codepagina, d);
  }
  return d;
}

/** Bestemmingen waarvan de inhoud niet in de hoofdtekst hoort. */
const OVERSLAAN: Record<string, string | null> = {
  fonttbl: null,
  colortbl: null,
  stylesheet: null,
  info: null,
  listtable: null,
  listoverridetable: null,
  revtbl: null,
  rsidtbl: null,
  generator: null,
  xmlnstbl: null,
  mmathPr: null,
  themedata: null,
  colorschememapping: null,
  latentstyles: null,
  datastore: null,
  pgdsctbl: null,
  filetbl: null,
  header: "kop- en voetteksten",
  headerl: "kop- en voetteksten",
  headerr: "kop- en voetteksten",
  headerf: "kop- en voetteksten",
  footer: "kop- en voetteksten",
  footerl: "kop- en voetteksten",
  footerr: "kop- en voetteksten",
  footerf: "kop- en voetteksten",
  footnote: "voet- of eindnoten",
  annotation: "opmerkingen",
  atnid: null,
  atnauthor: null,
  object: "ingesloten objecten",
  shp: "vormen of tekstvakken",
  shpinst: "vormen of tekstvakken",
  nonshppict: null,
  bkmkstart: null,
  bkmkend: null,
  pn: null,
  pnseclvl: null,
  xe: null,
  tc: null,
  template: null,
  docvar: null,
  userprops: null,
  wgrffmtfilter: null,
  background: null,
  ftnsep: null,
  ftnsepc: null,
  aftnsep: null,
  aftnsepc: null,
  comment: null,
  title: null,
  operator: null,
};

const UITLIJNING: Record<string, Uitlijning> = {
  ql: "links",
  qc: "midden",
  qr: "rechts",
  qj: "uitvullen",
};

export function isRtf(bytes: Uint8Array) {
  return (
    bytes[0] === 0x7b &&
    bytes[1] === 0x5c &&
    bytes[2] === 0x72 &&
    bytes[3] === 0x74 &&
    bytes[4] === 0x66
  );
}

export function rtfNaarModel(bytes: Uint8Array): RtfImport {
  if (!isRtf(bytes))
    throw new Error(i18next.t("import:errors.notRtf"));
  const overgeslagen: Record<string, number> = {};
  const tel = (wat: string) =>
    (overgeslagen[wat] = (overgeslagen[wat] ?? 0) + 1);

  let codepagina = 1252;
  const fontCodepagina = new Map<number, number>();
  const kleuren: (string | undefined)[] = [];
  const stijlnamen = new Map<number, string>();

  const blokken: Blok[] = [];
  let alinea: Inline[] = [];
  let alineastaat: Alineastaat = { stijl: 0, inTabel: false };
  // Tabel in opbouw
  let tabelRijen: Blok[][][] | null = null;
  let rijCellen: Blok[][] = [];
  let celBlokken: Blok[] = [];

  let staat: Toestand = { uc: 1, font: -1, overslaan: false };
  const stapel: Toestand[] = [];
  /** Bijzondere bestemming per groepsdiepte: wat er met de tekst gebeurt. */
  type Bestemming =
    | { soort: "fonttbl"; huidig: number; charset?: number }
    | { soort: "colortbl"; r: number; g: number; b: number }
    | { soort: "stylesheet"; nummer: number; tekst: string }
    | { soort: "fldinst"; tekst: string }
    | { soort: "fldrslt" }
    | {
        soort: "pict";
        type?: "png" | "jpeg";
        hex: string[];
        breedte?: number;
        hoogte?: number;
        schaalX: number;
        schaalY: number;
      }
    | { soort: "field"; link?: string };
  const bestemmingen: (Bestemming | null)[] = [null];
  const bestemming = () => bestemmingen[bestemmingen.length - 1];
  let huidigeLink: string | undefined;
  let tekenbuffer: number[] = [];

  const huidigeCodepagina = () =>
    staat.font >= 0 && fontCodepagina.has(staat.font)
      ? fontCodepagina.get(staat.font)!
      : codepagina;

  const voegTekstToe = (tekst: string) => {
    if (!tekst) return;
    const b = bestemming();
    if (b?.soort === "fonttbl" || b?.soort === "colortbl") return;
    if (b?.soort === "stylesheet") {
      b.tekst += tekst;
      return;
    }
    if (b?.soort === "fldinst") {
      b.tekst += tekst;
      return;
    }
    if (staat.overslaan || b?.soort === "pict") return;
    const vorige = alinea.at(-1);
    const opmaak: Tekstopmaak = {
      vet: staat.vet || undefined,
      cursief: staat.cursief || undefined,
      onderstreept: staat.onderstreept || undefined,
      doorgehaald: staat.doorgehaald || undefined,
      superschrift: staat.superschrift || undefined,
      subschrift: staat.subschrift || undefined,
      grootte: staat.grootte,
      kleur: staat.kleur,
    };
    const link = huidigeLink;
    if (
      vorige?.soort === "tekst" &&
      vorige.link === link &&
      (
        [
          "vet",
          "cursief",
          "onderstreept",
          "doorgehaald",
          "superschrift",
          "subschrift",
          "grootte",
          "kleur",
        ] as const
      ).every((k) => vorige[k] === opmaak[k])
    ) {
      vorige.tekst += tekst;
      return;
    }
    alinea.push({
      soort: "tekst",
      tekst,
      ...opmaak,
      ...(link ? { link } : {}),
    });
  };

  const spoelTekens = () => {
    if (!tekenbuffer.length) return;
    voegTekstToe(
      decoder(huidigeCodepagina()).decode(new Uint8Array(tekenbuffer)),
    );
    tekenbuffer = [];
  };

  const sluitAlinea = (eindeCel = false) => {
    spoelTekens();
    const inhoud = alinea;
    alinea = [];
    const niveau =
      alineastaat.overzichtsniveau ??
      kopniveauVanStijl(stijlnamen.get(alineastaat.stijl));
    let blok: Blok;
    if (niveau !== undefined && niveau >= 0 && niveau < 6 && inhoud.length)
      blok = { soort: "kop", niveau: (niveau + 1) as 1, inhoud };
    else
      blok = {
        soort: "alinea",
        inhoud,
        ...(alineastaat.uitlijning && alineastaat.uitlijning !== "links"
          ? { uitlijning: alineastaat.uitlijning }
          : {}),
      };
    if (alineastaat.inTabel || eindeCel) {
      celBlokken.push(blok);
      return;
    }
    if (tabelRijen) sluitTabel();
    blokken.push(blok);
  };

  const sluitTabel = () => {
    if (!tabelRijen) return;
    if (rijCellen.length || celBlokken.length) {
      if (celBlokken.length) rijCellen.push(celBlokken);
      tabelRijen.push(rijCellen);
    }
    if (tabelRijen.length)
      blokken.push({ soort: "tabel", kop: false, rijen: tabelRijen });
    tabelRijen = null;
    rijCellen = [];
    celBlokken = [];
  };

  const besturingswoord = (
    woord: string,
    param: number | null,
    heeftParam: boolean,
  ) => {
    const b = bestemming();
    // Tabellen met lettertypen, kleuren en stijlen.
    if (b?.soort === "fonttbl") {
      if (woord === "f" && param !== null) b.huidig = param;
      else if (woord === "fcharset" && param !== null) {
        const cp = CHARSET_CODEPAGINA[param];
        if (cp) fontCodepagina.set(b.huidig, cp);
      } else if (woord === "cpg" && param !== null)
        fontCodepagina.set(b.huidig, param);
      return;
    }
    if (b?.soort === "colortbl") {
      if (woord === "red") b.r = param ?? 0;
      else if (woord === "green") b.g = param ?? 0;
      else if (woord === "blue") b.b = param ?? 0;
      return;
    }
    if (b?.soort === "stylesheet") {
      if (woord === "s" && param !== null) b.nummer = param;
      return;
    }
    if (b?.soort === "pict") {
      if (woord === "pngblip") b.type = "png";
      else if (woord === "jpegblip") b.type = "jpeg";
      else if (woord === "picwgoal" && param) b.breedte = param;
      else if (woord === "pichgoal" && param) b.hoogte = param;
      else if (woord === "picscalex" && param) b.schaalX = param;
      else if (woord === "picscaley" && param) b.schaalY = param;
      else if (woord === "bin") tel("binaire afbeeldingen");
      return;
    }
    switch (woord) {
      case "ansicpg":
        if (param) codepagina = param;
        return;
      case "mac":
        codepagina = 10000;
        return;
      case "pc":
        codepagina = 437;
        return;
      case "pca":
        codepagina = 850;
        return;
      case "uc":
        staat.uc = Math.max(0, param ?? 1);
        return;
      case "u": {
        spoelTekens();
        let code = param ?? 0;
        if (code < 0) code += 65536;
        voegTekstToe(String.fromCharCode(code));
        overslaanTekens = staat.uc;
        return;
      }
      case "par":
        if (alineastaat.inTabel) {
          spoelTekens();
          // Een alinea binnen een cel.
          const inhoud = alinea;
          alinea = [];
          celBlokken.push({ soort: "alinea", inhoud });
        } else sluitAlinea();
        return;
      case "sect":
        sluitAlinea();
        return;
      case "page":
        spoelTekens();
        if (alinea.length) sluitAlinea();
        blokken.push({ soort: "pagina-einde" });
        return;
      case "line":
        spoelTekens();
        alinea.push({ soort: "regeleinde" });
        return;
      case "tab":
        spoelTekens();
        voegTekstToe("\t");
        return;
      case "emdash":
        voegTekenToe("—");
        return;
      case "endash":
        voegTekenToe("–");
        return;
      case "bullet":
        voegTekenToe("•");
        return;
      case "lquote":
        voegTekenToe("‘");
        return;
      case "rquote":
        voegTekenToe("’");
        return;
      case "ldblquote":
        voegTekenToe("“");
        return;
      case "rdblquote":
        voegTekenToe("”");
        return;
      case "emspace":
      case "enspace":
      case "qmspace":
        voegTekenToe(" ");
        return;
      case "pard":
        spoelTekens();
        alineastaat = { stijl: 0, inTabel: false };
        return;
      case "intbl":
        alineastaat.inTabel = true;
        if (!tabelRijen) tabelRijen = [];
        return;
      case "trowd":
        if (!tabelRijen) tabelRijen = [];
        return;
      case "cell":
        spoelTekens();
        if (alinea.length || !celBlokken.length)
          celBlokken.push({ soort: "alinea", inhoud: alinea });
        alinea = [];
        rijCellen.push(celBlokken);
        celBlokken = [];
        if (!tabelRijen) tabelRijen = [];
        return;
      case "nestcell":
      case "nestrow":
        tel("geneste tabellen");
        return;
      case "row":
        spoelTekens();
        if (!tabelRijen) tabelRijen = [];
        tabelRijen.push(rijCellen);
        rijCellen = [];
        celBlokken = [];
        alinea = [];
        return;
      case "clmgf":
      case "clvmgf":
        tel("samengevoegde tabelcellen");
        return;
      case "s":
        alineastaat.stijl = param ?? 0;
        return;
      case "outlinelevel":
        alineastaat.overzichtsniveau = param ?? undefined;
        return;
      case "ql":
      case "qc":
      case "qr":
      case "qj":
        alineastaat.uitlijning = UITLIJNING[woord];
        return;
    }
    // Tekenopmaak
    spoelTekens();
    const aan = !heeftParam || param !== 0;
    switch (woord) {
      case "plain":
        staat = { uc: staat.uc, font: staat.font, overslaan: staat.overslaan };
        return;
      case "b":
        staat.vet = aan;
        return;
      case "i":
        staat.cursief = aan;
        return;
      case "ul":
      case "uld":
      case "uldb":
      case "ulw":
      case "uldash":
      case "ulwave":
      case "ulth":
        staat.onderstreept = aan;
        return;
      case "ulnone":
        staat.onderstreept = false;
        return;
      case "strike":
      case "striked":
        staat.doorgehaald = aan;
        return;
      case "super":
        staat.superschrift = aan;
        staat.subschrift = false;
        return;
      case "sub":
        staat.subschrift = aan;
        staat.superschrift = false;
        return;
      case "nosupersub":
        staat.superschrift = false;
        staat.subschrift = false;
        return;
      case "fs":
        staat.grootte = param ? param / 2 : undefined;
        return;
      case "cf":
        staat.kleur = param ? kleuren[param] : undefined;
        return;
      case "f":
        staat.font = param ?? -1;
        return;
    }
  };

  let overslaanTekens = 0;
  const voegTekenToe = (teken: string) => {
    spoelTekens();
    voegTekstToe(teken);
  };

  const n = bytes.length;
  let i = 0;
  let wachtOpBestemming = false;
  while (i < n) {
    const c = bytes[i];
    if (c === 0x7b) {
      // {
      spoelTekens();
      stapel.push({ ...staat });
      // Erf de bestemming van de ouder voor tabellen, velden en afbeeldingen;
      // elke stijl in de stijlentabel krijgt een eigen groep.
      const ouder = bestemming();
      bestemmingen.push(
        ouder?.soort === "stylesheet"
          ? { soort: "stylesheet", nummer: 0, tekst: "" }
          : ouder &&
              (ouder.soort === "fonttbl" ||
                ouder.soort === "colortbl" ||
                ouder.soort === "fldinst" ||
                ouder.soort === "pict")
            ? ouder
            : null,
      );
      i++;
      wachtOpBestemming = true;
      continue;
    }
    if (c === 0x7d) {
      // }
      spoelTekens();
      const b = bestemmingen.pop() ?? null;
      const ouder = bestemming();
      if (b && b !== ouder) {
        if (b.soort === "stylesheet") {
          stijlnamen.set(b.nummer, b.tekst.replace(/;\s*$/, "").trim());
        } else if (b.soort === "colortbl") {
          // Laatste kleur (zonder afsluitende ;) toevoegen.
        } else if (b.soort === "fldinst") {
          const m =
            /HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/i.exec(b.tekst) ??
            /HYPERLINK\s+(\S+)/i.exec(b.tekst);
          const link = veiligeLink(m?.[1]);
          if (ouder?.soort === "field") ouder.link = link;
          if (/^\s*(PAGE|NUMPAGES|TOC|DATE|TIME)\b/i.test(b.tekst))
            tel("velden (alleen het resultaat)");
        } else if (b.soort === "fldrslt") {
          huidigeLink = undefined;
        } else if (b.soort === "field") {
          huidigeLink = undefined;
        } else if (b.soort === "pict") {
          const hex = b.hex.join("").replace(/[^0-9a-fA-F]/g, "");
          if (b.type && hex.length >= 16) {
            const data = new Uint8Array(hex.length >> 1);
            for (let k = 0; k < data.length; k++)
              data[k] = parseInt(hex.substr(k * 2, 2), 16);
            const type = afbeeldingstype(data);
            if (type) {
              // picwgoal is in twips; 15 twips = 1 pixel bij 96 dpi.
              const breedte = b.breedte
                ? Math.round(((b.breedte / 15) * b.schaalX) / 100)
                : undefined;
              const hoogte = b.hoogte
                ? Math.round(((b.hoogte / 15) * b.schaalY) / 100)
                : undefined;
              const vorigeStaat = stapel[stapel.length - 1];
              if (!vorigeStaat?.overslaan)
                alinea.push({
                  soort: "afbeelding",
                  data,
                  type,
                  breedte,
                  hoogte,
                });
            } else tel("afbeeldingen in een niet-ondersteund formaat");
          } else tel("afbeeldingen in een niet-ondersteund formaat (WMF/EMF)");
        }
      }
      staat = stapel.pop() ?? staat;
      i++;
      wachtOpBestemming = false;
      continue;
    }
    if (c === 0x5c) {
      // \
      const volgende = bytes[i + 1];
      if (volgende === undefined) break;
      // Symbolen
      if (volgende === 0x27) {
        // \'hh
        const hex = String.fromCharCode(bytes[i + 2] ?? 0, bytes[i + 3] ?? 0);
        i += 4;
        if (overslaanTekens > 0) {
          overslaanTekens--;
          continue;
        }
        const waarde = parseInt(hex, 16);
        if (Number.isFinite(waarde)) {
          const b = bestemming();
          if (b?.soort === "stylesheet" || b?.soort === "fldinst")
            voegTekstToe(String.fromCharCode(waarde));
          else tekenbuffer.push(waarde);
        }
        wachtOpBestemming = false;
        continue;
      }
      if (volgende === 0x2a) {
        // \* : onbekende bestemming overslaan, tenzij we hem kennen.
        i += 2;
        const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(
          new TextDecoder("latin1").decode(bytes.subarray(i, i + 40)),
        );
        const woord = m?.[1] ?? "";
        if (woord === "fldinst") {
          bestemmingen[bestemmingen.length - 1] = {
            soort: "fldinst",
            tekst: "",
          };
          i += m![0].length;
        } else if (woord === "shppict") {
          // shppict bevat de gewone \pict.
          i += m![0].length;
        } else {
          if (woord && OVERSLAAN[woord]) tel(OVERSLAAN[woord]!);
          if (woord === "footnote") tel("voet- of eindnoten");
          staat.overslaan = true;
          // Rest van de groep overslaan.
          i = sluitGroep(bytes, i);
          staat = stapel.pop() ?? staat;
          bestemmingen.pop();
        }
        wachtOpBestemming = false;
        continue;
      }
      if (
        !(
          (volgende >= 0x41 && volgende <= 0x5a) ||
          (volgende >= 0x61 && volgende <= 0x7a)
        )
      ) {
        i += 2;
        if (volgende === 0x7e) voegTekenToe("\u00a0");
        else if (volgende === 0x5f) voegTekenToe("\u2011");
        else if (volgende === 0x2d) {
          /* zacht afbreekstreepje */
        } else if (volgende === 0x0a || volgende === 0x0d)
          besturingswoord("par", null, false);
        else if (volgende === 0x5c || volgende === 0x7b || volgende === 0x7d) {
          if (overslaanTekens > 0) overslaanTekens--;
          else tekenbuffer.push(volgende);
        }
        wachtOpBestemming = false;
        continue;
      }
      let j = i + 1;
      while (
        j < n &&
        ((bytes[j] >= 0x41 && bytes[j] <= 0x5a) ||
          (bytes[j] >= 0x61 && bytes[j] <= 0x7a))
      )
        j++;
      const woord = String.fromCharCode(...bytes.subarray(i + 1, j));
      let k = j;
      if (bytes[k] === 0x2d) k++;
      while (k < n && bytes[k] >= 0x30 && bytes[k] <= 0x39) k++;
      const heeftParam = k > j && !(k === j + 1 && bytes[j] === 0x2d);
      const param = heeftParam
        ? parseInt(String.fromCharCode(...bytes.subarray(j, k)), 10)
        : null;
      if (bytes[k] === 0x20) k++;
      i = k;
      // Bestemmingen aan het begin van een groep.
      if (wachtOpBestemming) {
        wachtOpBestemming = false;
        if (woord === "fonttbl") {
          bestemmingen[bestemmingen.length - 1] = {
            soort: "fonttbl",
            huidig: 0,
          };
          continue;
        }
        if (woord === "colortbl") {
          bestemmingen[bestemmingen.length - 1] = {
            soort: "colortbl",
            r: -1,
            g: -1,
            b: -1,
          };
          continue;
        }
        if (woord === "stylesheet") {
          bestemmingen[bestemmingen.length - 1] = {
            soort: "stylesheet",
            nummer: 0,
            tekst: "",
          };
          continue;
        }
        if (woord === "field") {
          bestemmingen[bestemmingen.length - 1] = { soort: "field" };
          continue;
        }
        if (woord === "fldrslt") {
          const veld = bestemmingen[bestemmingen.length - 2];
          if (veld?.soort === "field") huidigeLink = veld.link;
          bestemmingen[bestemmingen.length - 1] = { soort: "fldrslt" };
          continue;
        }
        if (woord === "pict") {
          bestemmingen[bestemmingen.length - 1] = {
            soort: "pict",
            hex: [],
            schaalX: 100,
            schaalY: 100,
          };
          continue;
        }
        if (woord === "fldinst") {
          bestemmingen[bestemmingen.length - 1] = {
            soort: "fldinst",
            tekst: "",
          };
          continue;
        }
        if (woord === "listtext" || woord === "pntext") {
          // Zichtbare opsommingstekst: overnemen als gewone tekst.
          continue;
        }
        if (woord in OVERSLAAN && bestemming()?.soort !== "stylesheet") {
          const wat = OVERSLAAN[woord];
          if (wat) tel(wat);
          i = sluitGroep(bytes, i);
          staat = stapel.pop() ?? staat;
          bestemmingen.pop();
          continue;
        }
      }
      besturingswoord(woord, param, heeftParam);
      continue;
    }
    // Gewone tekens
    wachtOpBestemming = false;
    if (c === 0x0d || c === 0x0a) {
      i++;
      continue;
    }
    const b = bestemming();
    if (b?.soort === "pict") {
      let j = i;
      while (
        j < n &&
        bytes[j] !== 0x5c &&
        bytes[j] !== 0x7b &&
        bytes[j] !== 0x7d
      )
        j++;
      b.hex.push(
        String.fromCharCode(...bytes.subarray(i, Math.min(j, i + 65536))),
      );
      if (j - i > 65536) {
        for (let p = i + 65536; p < j; p += 65536)
          b.hex.push(
            String.fromCharCode(...bytes.subarray(p, Math.min(j, p + 65536))),
          );
      }
      i = j;
      continue;
    }
    if (b?.soort === "colortbl") {
      if (c === 0x3b) {
        kleuren.push(
          b.r < 0
            ? undefined
            : [b.r, b.g, b.b]
                .map((v) => Math.max(0, v).toString(16).padStart(2, "0"))
                .join("")
                .toUpperCase(),
        );
        b.r = b.g = b.b = -1;
      }
      i++;
      continue;
    }
    if (overslaanTekens > 0) {
      overslaanTekens--;
      i++;
      continue;
    }
    if (b?.soort === "stylesheet" || b?.soort === "fldinst") {
      voegTekstToe(String.fromCharCode(c));
      i++;
      continue;
    }
    tekenbuffer.push(c);
    i++;
  }
  spoelTekens();
  if (alinea.length) sluitAlinea();
  sluitTabel();
  // Een afsluitende lege alinea na \par aan het eind weglaten.
  while (blokken.length > 1) {
    const laatste = blokken.at(-1)!;
    if (laatste.soort === "alinea" && !laatste.inhoud.length) blokken.pop();
    else break;
  }
  return { document: { blokken }, overgeslagen };
}

/** Index direct na de } die de groep sluit waarin `start` ligt. */
function sluitGroep(bytes: Uint8Array, start: number) {
  let diepte = 1;
  let i = start;
  while (i < bytes.length && diepte > 0) {
    const c = bytes[i];
    if (c === 0x5c) {
      i += 2;
      continue;
    }
    if (c === 0x7b) diepte++;
    else if (c === 0x7d) diepte--;
    i++;
  }
  // i staat ná de sluitende }; de aanroeper heeft de groep al afgesloten.
  return i;
}

function kopniveauVanStijl(naam: string | undefined) {
  if (!naam) return undefined;
  const m = /^(?:heading|kop)\s*(\d)$/i.exec(naam.trim());
  return m ? Number(m[1]) - 1 : undefined;
}
