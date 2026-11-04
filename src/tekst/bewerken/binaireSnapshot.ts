/** Zet de volledige snapshot om zonder de JavaScript-encoder als de runtime dat zelf kan. */
import { Buffer } from "buffer";

export function snapshotNaarBase64(bytes: Uint8Array): string {
  // Oudere WebViews behouden dezelfde volledige encoder en standaardpadding.
  const uitgebreid = bytes as Uint8Array & { toBase64?: () => string };
  return typeof uitgebreid.toBase64 === "function"
    ? uitgebreid.toBase64()
    : Buffer.from(bytes).toString("base64");
}
