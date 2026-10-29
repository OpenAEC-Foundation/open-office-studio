/**
 * Spellingcontrole in Open Tekst Studio: één aanroep in de editor.
 *
 *   const spelling = useTekstSpelling(() => docx.current, zichtbaar);
 *   <DocxEditor plugins={spelling.plugins} pluginGrants={spelling.grants} … />
 *   {spelling.element}
 *
 * Regelt de plug-in (golflijnen), het rechtermuismenu, F7 (deelvenster),
 * de autocorrectie en de melding aan de statusbalk.
 */
import type { DocxEditorRef, DocxPluginError } from "@betteroffice/docx-react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import i18next from "../../i18n/config";
import { formatGetal } from "../../i18n/opmaak";
import { leesInstellingen, volgInstellingen } from "../../instellingen";
import { SCHEIDING } from "../autocorrectie";
import { spellingControleur } from "../dienst";
import { registreerTaalAansluiting } from "../../tekst/info/winkel";
import { genegeerd, persoonlijk } from "../woordenlijst";
import { meldMenubronAan } from "../../tekst/menu/bronnen";
import { heeftExternMenu, koppelSpellingMenu, registreerSessie } from "./menu";
import { maakSpellingPlugin, SPELLING_PLUGIN, spellingGrant } from "./plugin";
import { SpellingSessie } from "./sessie";
import { SpellingMenu } from "./SpellingMenu";
import { SpellingVenster } from "./SpellingVenster";

const INVOER = ".paged-editor__yrs-input";

/** Korte spellingstatus voor de statusbalk, of null als de controle uit staat. */
export function spellingStatus(sessie: { aan: boolean; aantal: number | null; probleem: string | null }): string | null {
  if (!sessie.aan) return null;
  if (sessie.probleem) return i18next.t("spelling:status.unavailable");
  if (sessie.aantal === null) return i18next.t("spelling:status.checking");
  if (sessie.aantal === 0) return i18next.t("spelling:status.noErrors");
  return i18next.t("spelling:status.errors", { count: sessie.aantal, errors: formatGetal(sessie.aantal) });
}

/** Een plug-infout van de engine (de plug-in staat dan uit): melden in de console. */
function pluginFout(fout: DocxPluginError) {
  if (fout.pluginId === SPELLING_PLUGIN) console.warn("Spellingcontrole-plug-in gestopt:", fout);
}

export function useTekstSpelling(
  editor: () => DocxEditorRef | null,
  zichtbaar: boolean,
  /** De bytes van het geopende DOCX, voor de taal per alinea (w:lang). */
  bytes: () => Uint8Array | null = () => null,
) {
  const sessie = useMemo(() => new SpellingSessie(editor, spellingControleur, bytes), []);
  const plugins = useMemo(() => [maakSpellingPlugin(sessie)], [sessie]);
  const grants = useMemo(() => ({ [SPELLING_PLUGIN]: spellingGrant }), []);
  const stand = useSyncExternalStore(sessie.volg, sessie.leesStand);
  const zichtbaarRef = useRef(zichtbaar);
  zichtbaarRef.current = zichtbaar;

  useEffect(() => {
    sessie.start();
    const losMenu = registreerSessie(sessie, () => zichtbaarRef.current);
    // Suggesties bovenaan het algemene rechtermuismenu (src/tekst/menu).
    const losBron = koppelSpellingMenu((bron) => meldMenubronAan("spelling", bron));
    // Woordenlijst of instellingen gewijzigd: opnieuw tekenen of controleren.
    let vorige = JSON.stringify(leesInstellingen().spelling);
    const stopInstellingen = volgInstellingen(() => {
      const nu = JSON.stringify(leesInstellingen().spelling);
      if (nu !== vorige) {
        vorige = nu;
        sessie.herbegin();
      }
    });
    const stopLijst1 = persoonlijk.volg(() => sessie.herbegin());
    const stopLijst2 = genegeerd.volg(() => sessie.herbegin());
    return () => {
      losMenu();
      losBron();
      stopInstellingen();
      stopLijst1();
      stopLijst2();
      sessie.stop();
    };
  }, [sessie]);

  // Rechtermuisknop, F7 en autocorrectie: alleen voor het zichtbare document.
  useEffect(() => {
    if (!zichtbaar) {
      sessie.sluitMenu();
      return;
    }
    const inDocument = (doel: EventTarget | null) =>
      doel instanceof Element && !!doel.closest(".office-tekst .docx-editor__viewport, .office-tekst .paged-editor");
    const rechtsklik = (e: MouseEvent) => {
      if (heeftExternMenu() || !sessie.aan || !inDocument(e.target)) return;
      const doel = sessie.foutOnderPunt(e.clientX, e.clientY);
      if (!doel) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void sessie.openMenu(e.clientX, e.clientY, doel.alinea, doel.fout);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "F7" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        sessie.vensterOpen = !sessie.vensterOpen;
        sessie.meld();
        return;
      }
      if (!(e.target instanceof Element) || !e.target.matches(INVOER)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.key.length !== 1) return;
      const volgnummer = ++sessie.toetsen;
      if (!leesInstellingen().spelling.autocorrectie || !SCHEIDING.test(e.key)) return;
      // Na de verwerking van het teken door de engine (zie sessie.autocorrigeer).
      const teken = e.key;
      window.setTimeout(() => sessie.autocorrigeer(teken, volgnummer), 0);
    };
    window.addEventListener("contextmenu", rechtsklik, true);
    window.addEventListener("keydown", toets, true);
    return () => {
      window.removeEventListener("contextmenu", rechtsklik, true);
      window.removeEventListener("keydown", toets, true);
    };
  }, [sessie, zichtbaar]);

  // De statusbalk (taalitem van src/tekst/info): het aantal spelfouten naast
  // de taal. De taal zelf kiest het taalvenster daar; dat schrijft w:lang in
  // het document, en na het herladen controleren we in die taal.
  const aansluiting = useRef<ReturnType<typeof registreerTaalAansluiting> | null>(null);
  useEffect(() => {
    if (!zichtbaar) return;
    const a = registreerTaalAansluiting({ status: () => spellingStatus(sessie) });
    aansluiting.current = a;
    return () => {
      a.stop();
      aansluiting.current = null;
    };
  }, [sessie, zichtbaar]);
  useEffect(() => aansluiting.current?.meld(), [stand]);

  const element = zichtbaar ? (
    <>
      {sessie.menu && <SpellingMenu sessie={sessie} stand={sessie.menu} />}
      {sessie.vensterOpen && <SpellingVenster sessie={sessie} stand={stand} />}
    </>
  ) : null;

  return { plugins, grants, element, sessie, pluginFout };
}
