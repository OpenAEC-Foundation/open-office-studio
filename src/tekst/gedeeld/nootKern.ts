// De build neemt deze kern met een inhoudsafhankelijke bestandsnaam op.
// Bron, patch, licentie en bouwinstructies staan bij de meegeleverde kern.
export const tekstKernUrl = new URL("../../../vendor/tekstengine/docx_edit_bg.wasm", import.meta.url);
export const layoutKernUrl = new URL("../../../vendor/tekstengine/docx_layout_bg.wasm", import.meta.url);
