import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RibbonFout } from "../../Ribbon";
import { useEditorApi, useEditorZichtbaar } from "../../lint/editorApi";
import { engine } from "../gedeeld/engine";
import { alineas, bladwijzers, gaNaar } from "./document";
import { code } from "./velden";
import { registreerVeldBijwerker } from "../veldenDocument/opdrachten";
import { werkVerwijzingenBij } from "./opdrachten";

let registraties = 0, stopBijwerker: (() => void) | undefined;

/** Follow native REF/PAGEREF/NOTEREF hyperlinks without changing their field structure. */
export function VerwijsNavigatie() {
  const api = useEditorApi().tekst, zichtbaar = useEditorZichtbaar(), fout = useContext(RibbonFout), { t } = useTranslation("writer");
  useEffect(() => {
    if (registraties++ === 0) stopBijwerker = registreerVeldBijwerker(werkVerwijzingenBij);
    return () => { if (--registraties === 0) { stopBijwerker?.(); stopBijwerker = undefined; } };
  }, []);
  useEffect(() => {
    if (!zichtbaar) return;
    const klik = (ev: MouseEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      if (!(ev.target instanceof Element) || !ev.target.closest(".office-tekst .docx-editor__viewport") || ev.target.closest("[hidden], [inert]")) return;
      const ref = api(); if (!ref) return;
      const { weergave, sessie } = engine(ref), hit = weergave.getPositionAtPoint(ev.clientX, ev.clientY);
      if (!hit) return;
      const loc = weergave.displayPositionToYrsLoc(hit); if (!loc) return;
      const p = alineas(sessie).find(p => p.story === loc.story && p.paraId === loc.paraId);
      const d = p?.delen.find(d => d.embedKind === "field" && (d.offset === loc.offset || d.offset + 1 === loc.offset));
      if (!d) return;
      const c = code(d); if (!["REF", "PAGEREF", "NOTEREF"].includes(c[0]?.toUpperCase()) || !c.includes("\\h")) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      const doel = bladwijzers(sessie).find(b => b.naam === c[1]);
      if (doel) gaNaar(ref, doel.start); else fout(t("references.missing"));
    };
    document.addEventListener("click", klik, true);
    return () => document.removeEventListener("click", klik, true);
  }, [api, zichtbaar, fout, t]);
  return null;
}
