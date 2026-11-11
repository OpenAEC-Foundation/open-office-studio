import { unzipSync } from "fflate";

type Bron = { bytes: Uint8Array; mimeType: string };
const weergaven = new WeakMap<ArrayBuffer, Uint8Array>();
const onderdelen = new WeakMap<
  Uint8Array,
  { naam: string; grootte: number }[]
>();
const types: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
};

/**
 * SDK 0.5.1: media:n verwijst naar het n-de word/media/-deel in archiefvolgorde.
 * De hybride editor kan die verwijzing tekenen terwijl zijn native mediacache
 * leeg is. Lees dan alleen het gevraagde rasterdeel uit de eigen bron; de
 * gewone native route blijft verantwoordelijk voor transcodes en nieuwe media.
 */
export function bronAfbeelding(
  pakket: Uint8Array | ArrayBuffer | null | undefined,
  token: string,
): Bron | null {
  const match = /^media:(0|[1-9]\d*)$/.exec(token);
  if (!pakket || !match) return null;
  try {
    let bron: Uint8Array;
    if (pakket instanceof Uint8Array) bron = pakket;
    else {
      bron = weergaven.get(pakket) ?? new Uint8Array(pakket);
      weergaven.set(pakket, bron);
    }
    let delen = onderdelen.get(bron);
    if (!delen) {
      delen = [];
      unzipSync(bron, {
        filter: (deel) => {
          if (
            deel.name.toLowerCase().startsWith("word/media/") &&
            !deel.name.endsWith("/")
          )
            delen!.push({ naam: deel.name, grootte: deel.originalSize });
          return false;
        },
      });
      onderdelen.set(bron, delen);
    }
    const deel = delen[Number(match[1])];
    const extensie = deel?.naam.split(".").at(-1)!.toLowerCase();
    const mimeType = extensie && Object.hasOwn(types, extensie) ? types[extensie] : undefined;
    if (!deel || !mimeType || deel.grootte > 64 * 1024 * 1024) return null;
    const bytes = unzipSync(bron, { filter: (x) => x.name === deel.naam })[
      deel.naam
    ];
    return bytes ? { bytes, mimeType } : null;
  } catch {
    return null;
  }
}
