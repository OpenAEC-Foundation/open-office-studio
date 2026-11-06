import { DocxEditor } from "@betteroffice/docx-react";
import { configureDefaultFonts } from "@betteroffice/docx/layout";
import * as fonts from "@betteroffice/fonts";
import "@betteroffice/docx-react/styles.css";
import { render, type Meldingen } from "./gedeeld";

// Alleen dit frame: instellingen en CSS van de host worden niet overschreven.
configureDefaultFonts({ fonts });
export function toon(
  host: HTMLElement,
  bytes: Uint8Array,
  _naam: string,
  meld: Meldingen,
) {
  return render(
    host,
    <DocxEditor
      documentBuffer={bytes}
      readOnly
      mode="viewing"
      showToolbar={false}
      showFileOpen={false}
      showHelpMenu={false}
      showRuler={false}
      showOutlineButton={false}
      downloadOnSave={false}
      onSaveRequest={() => false}
      className="kantoorvoorbeeld"
      colorMode="light"
      onFirstPagePainted={meld.gereed}
      onError={(fout, info) => {
        if (!info?.recoverable) meld.fout(fout);
      }}
    />,
    meld,
  );
}
