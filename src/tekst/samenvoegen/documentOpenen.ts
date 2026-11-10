import { useEffect, useRef } from "react";
const GEBEURTENIS = "office:nieuw-writer-document";
interface Verzoek { bytes: Uint8Array; naam: string; klaar: () => void; fout: (error: unknown) => void }
export function openSamenvoegDocument(bytes: Uint8Array, naam: string) {
  return new Promise<void>((klaar, fout) => window.dispatchEvent(new CustomEvent<Verzoek>(GEBEURTENIS, { detail: { bytes, naam, klaar, fout } })));
}
export function useNieuweWriterDocumenten(open: (naam: string, bytes: Uint8Array) => unknown) {
  const recent = useRef(open); recent.current = open;
  useEffect(() => {
    const lees = (event: Event) => {
      const r = (event as CustomEvent<Verzoek>).detail;
      try { recent.current(r.naam, r.bytes); r.klaar(); } catch (e) { r.fout(e); }
    };
    window.addEventListener(GEBEURTENIS, lees);
    return () => window.removeEventListener(GEBEURTENIS, lees);
  }, []);
}
