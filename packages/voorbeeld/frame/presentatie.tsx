import { PptxEditor } from "@betteroffice/pptx-react";
import { render, type Meldingen } from "./gedeeld";
import { lettertypen } from "./lettertypen";

export async function toon(
  host: HTMLElement,
  bytes: Uint8Array,
  naam: string,
  meld: Meldingen,
) {
  const fonts = await lettertypen(bytes, true);
  return render(
    host,
    <PptxEditor
      legacySyncApi
      file={bytes}
      fileName={naam}
      fonts={fonts}
      readOnly
      toolbar={null}
      showToolbar={false}
      onSaveRequest={() => false}
      className="kantoorvoorbeeld"
      onReady={meld.gereed}
      onError={meld.fout}
    />,
    meld,
  );
}
