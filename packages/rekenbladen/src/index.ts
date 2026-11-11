/** UI-independent, versioned XLSX adapter over the pinned calculation engine. */
import {
  initWasm,
  openWorkbook,
  openWorkbookSession,
  type OpenWorkbookOptions,
  type OpenWorkbookSessionOptions,
  type WasmInitInput,
  type WorkbookHandle,
  type WorkbookSession,
  type XlsxReadRequest,
  type XlsxEditRequest,
  type XlsxExportOptions,
} from "@betteroffice/xlsx";

export type SpreadsheetOptions =
  | ({ mode: "local"; wasm?: WasmInitInput } & OpenWorkbookOptions)
  | ({ mode: "worker" } & OpenWorkbookSessionOptions);

/** Both implementations expose promises; callers do not depend on synchronous WASM access. */
export class SpreadsheetWorkbook {
  private closed = false;
  constructor(
    private readonly engine:
      | { handle: WorkbookHandle }
      | { session: WorkbookSession },
  ) {}
  private check() {
    if (this.closed) throw new Error("Spreadsheet adapter is closed");
  }
  async version() {
    this.check();
    return "handle" in this.engine
      ? this.engine.handle.version()
      : this.engine.session.call.version();
  }
  async readCells(request: XlsxReadRequest) {
    this.check();
    return "handle" in this.engine
      ? this.engine.handle.readCells(request)
      : this.engine.session.call.readCells(request);
  }
  async validateEdits(request: XlsxEditRequest) {
    this.check();
    return "handle" in this.engine
      ? this.engine.handle.validateEdits(request)
      : this.engine.session.call.validateEdits(request);
  }
  async applyEdits(request: XlsxEditRequest) {
    this.check();
    return "handle" in this.engine
      ? this.engine.handle.applyEdits(request)
      : this.engine.session.call.applyEdits(request);
  }
  async exportStructured(options?: XlsxExportOptions) {
    this.check();
    return "handle" in this.engine
      ? this.engine.handle.exportStructured(options)
      : this.engine.session.call.exportStructured(options);
  }
  async save() {
    this.check();
    return "handle" in this.engine
      ? this.engine.handle.save()
      : this.engine.session.save();
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    if ("handle" in this.engine) this.engine.handle.dispose();
    else await this.engine.session.dispose();
  }
}

/** Local mode is useful in Node/tests; worker mode keeps calculation off the browser thread. */
export async function openSpreadsheet(
  bytes: Uint8Array,
  options: SpreadsheetOptions,
): Promise<SpreadsheetWorkbook> {
  if (options.mode === "worker") {
    options.signal?.throwIfAborted();
    const { mode: _, ...workerOptions } = options;
    try {
      return new SpreadsheetWorkbook({
        session: await openWorkbookSession(bytes, workerOptions),
      });
    } catch (error) {
      options.signal?.throwIfAborted();
      throw error;
    }
  }
  const { mode: _, wasm, ...calculation } = options;
  await initWasm(wasm);
  return new SpreadsheetWorkbook({ handle: openWorkbook(bytes, calculation) });
}

/** Always releases the workbook, including refused edits and failing export callbacks. */
export async function withSpreadsheet<T>(
  bytes: Uint8Array,
  options: SpreadsheetOptions,
  work: (book: SpreadsheetWorkbook) => Promise<T>,
): Promise<T> {
  const book = await openSpreadsheet(bytes, options);
  try {
    return await work(book);
  } finally {
    await book.dispose();
  }
}

export type {
  XlsxReadRequest,
  XlsxReadResult,
  XlsxEditRequest,
  XlsxEditResult,
  XlsxCellValue,
  XlsxExportOptions,
  WorkbookCalculationContext,
} from "@betteroffice/xlsx";
