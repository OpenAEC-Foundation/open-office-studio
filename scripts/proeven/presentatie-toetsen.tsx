import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { zetTaal } from "../../src/i18n/config";
import { Voorstelling } from "../../src/presentatie/Voorstelling";
import voorbeeld from "../../docs/voorbeelden/Ontwerpvisie.pptx?url";

await zetTaal("en");
await initWasm();
const handle = openPresentation(new Uint8Array(await (await fetch(voorbeeld)).arrayBuffer()));
// Voorstelling leest alleen de engine-handle; invoer gaat door de echte component.
const api = { handle } as PptxEditorApi;

function Proef() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Begin show</button>
    {open && <Voorstelling api={api} verzoek={{ vanafBegin: true, presentator: true }} huidig={0} einde={() => setOpen(false)} />}
  </>;
}
createRoot(document.getElementById("root")!).render(<Proef />);
