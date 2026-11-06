import { XlsxEditor } from "@betteroffice/xlsx-react";
import { render, type Meldingen } from "./gedeeld";
import { lettertypen } from "./lettertypen";

export async function toon(
  host: HTMLElement,
  bytes: Uint8Array,
  naam: string,
  meld: Meldingen,
) {
  await lettertypen(bytes, false);
  return render(
    host,
    <XlsxEditor
      file={bytes}
      fileName={naam}
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
