/**
 * Venster ‘Datum en tijd’: Nederlandse notaties, en desgewenst een veld dat
 * zichzelf bijwerkt (DATE/TIME). Het veld gaat via het pakket: document
 * opslaan, een markering in de OOXML vervangen door `w:fldSimple`, opnieuw
 * laden. Daarbij vervalt de ongedaan-maakgeschiedenis; het venster zegt dat.
 */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { Dialoog } from "../../werkruimte/Dialoog";
import type { Herladen } from "../../lint/editorApi";
import { Pakket } from "../../grafieken/pakket";
import { herstelPlek, leesPlek } from "../pagina/ui/engine";
import { planNaHerladen } from "../pagina/ui/staat";
import {
  NOTATIES,
  STANDAARD_NOTATIE,
  formatteerDatum,
  maakMarkering,
  veldXml,
  vervangMarkering,
  type Notatie,
} from "./datum";

const VOORKEUR = "open-tekst-datumnotatie";

function leesVoorkeur(): number {
  try {
    const opgeslagen = localStorage.getItem(VOORKEUR);
    const i = opgeslagen === null ? -1 : Number(opgeslagen);
    return Number.isInteger(i) && i >= 0 && i < NOTATIES.length ? i : STANDAARD_NOTATIE;
  } catch {
    return STANDAARD_NOTATIE;
  }
}

/** Zet een datumveld op de cursor via het pakket en laadt het document opnieuw. */
export async function voegVeldIn(
  ref: DocxEditorRef,
  herlaad: Herladen,
  notatie: Notatie,
  nu = new Date(),
) {
  const invoer = ref.getEditorRef();
  if (!invoer) throw new Error(i18next.t("writer:editing.dateTime.notReady"));
  const markering = maakMarkering();
  // Cursor en beeld vóór de markering: na het herladen staat de cursor achter het veld.
  const plek = await leesPlek(ref);
  ref.focus();
  invoer.insertText(markering);
  await ref.flushPendingInput();
  const pakket = new Pakket(await herlaad.bytes());
  const waarde = formatteerDatum(nu, notatie.afbeelding);
  const delen = pakket
    .namen()
    .filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
  for (const deel of delen) {
    const xml = pakket.lees(deel);
    if (!xml.includes(markering)) continue;
    const nieuw = vervangMarkering(xml, markering, (rPr) => veldXml(notatie, waarde, rPr));
    if (!nieuw) break;
    pakket.schrijf(deel, nieuw);
    planNaHerladen(herlaad, (n) => herstelPlek(n, plek, "eind"), ref);
    herlaad.vervang(pakket.inpakken());
    return;
  }
  // Niet gevonden: de markering weer weghalen en als tekst invoegen.
  invoer.undo();
  invoer.insertText(waarde);
  throw new Error(i18next.t("writer:editing.dateTime.fieldFailed"));
}

export function DatumTijdDialoog({
  sluit,
  voegIn,
  api,
  herlaad,
  fout,
}: {
  sluit: () => void;
  voegIn: (tekst: string) => void;
  api: () => DocxEditorRef | null;
  herlaad: Herladen | null;
  fout: (error: unknown) => void;
}) {
  const { t } = useTranslation(["writer", "common"]);
  const id = useId();
  const [nu] = useState(() => new Date());
  const [gekozen, setGekozen] = useState(leesVoorkeur);
  const [veld, setVeld] = useState(false);
  const notatie = NOTATIES[gekozen];

  function invoegen() {
    try {
      localStorage.setItem(VOORKEUR, String(gekozen));
    } catch {
      // Alleen gemak.
    }
    sluit();
    if (!veld) {
      voegIn(formatteerDatum(new Date(), notatie.afbeelding));
      return;
    }
    const ref = api();
    if (!ref || !herlaad) {
      fout(new Error(t("editing.dateTime.fieldUnavailable")));
      voegIn(formatteerDatum(new Date(), notatie.afbeelding));
      return;
    }
    // Na het sluiten (de focus is dan terug in het document).
    requestAnimationFrame(() => void voegVeldIn(ref, herlaad, notatie).catch(fout));
  }

  return (
    <Dialoog
      titel={t("editing.dateTime.title")}
      sluit={sluit}
      className="tekst-datumtijd"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={invoegen}>
            {t("editing.dateTime.insert")}
          </button>
        </>
      }
    >
      <p id={`${id}-uitleg`} className="werkruimte-uitleg">
        {t("editing.dateTime.formats")}
      </p>
      <div
        className="tekst-datumtijd-lijst"
        role="listbox"
        aria-labelledby={`${id}-uitleg`}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setGekozen((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + NOTATIES.length) % NOTATIES.length);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            invoegen();
          }
        }}
      >
        {NOTATIES.map((n, i) => (
          <button
            key={n.afbeelding}
            type="button"
            role="option"
            aria-selected={i === gekozen}
            data-autofocus={i === gekozen ? "" : undefined}
            className="tekst-datumtijd-optie"
            title={n.afbeelding}
            onClick={() => setGekozen(i)}
            onDoubleClick={invoegen}
            ref={(el) => {
              if (el && i === gekozen && el.parentElement?.contains(document.activeElement)) el.focus();
            }}
          >
            {formatteerDatum(nu, n.afbeelding)}
          </button>
        ))}
      </div>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={veld} onChange={(e) => setVeld(e.target.checked)} />
        {t("editing.dateTime.autoUpdate", { field: notatie.tijd ? "TIME" : "DATE" })}
      </label>
      {veld && (
        <p className="werkruimte-uitleg">
          {t("editing.dateTime.reloadWarning")}
        </p>
      )}
    </Dialoog>
  );
}
