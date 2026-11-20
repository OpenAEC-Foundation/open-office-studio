import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  inspectSelectedDocumentReady,
  inspectSelectedCanvasPoint,
  selectedDocumentReadyScript,
} from "./writer361-native-ready.mjs";
const cells = ["alpha", "beta", "", "", "", "omega", "delta", "", ""];
function fixture() {
  const tab = {
    textContent: "361-other.docx",
    getAttribute: (n) => (n === "aria-controls" ? "other-panel" : null),
  };
  const canvas = {
    width: 816,
    height: 1056,
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ x: 401, y: 228, width: 816, height: 1056 }),
  };
  const input = { getClientRects: () => [1] };
  const table = {
    closest: () => null,
    getAttribute: (n) =>
      n === "aria-rowcount" || n === "aria-colcount" ? "3" : null,
    querySelectorAll: () => cells.map((textContent) => ({ textContent })),
  };
  const panel = {
    getAttribute: (n) => (n === "role" ? "tabpanel" : null),
    closest: () => null,
    querySelector: (n) => (n === "[data-testid=yrs-input]" ? input : null),
    querySelectorAll: (n) =>
      n === ".canvas-page canvas"
        ? [canvas]
        : n === "[role=table]"
          ? [table]
          : [],
  };
  const document = {
    fonts: { status: "loaded" },
    querySelectorAll: (n) => {
      if (n === "[data-testid=yrs-input]") return [input];
      assert.equal(
        n,
        ".office-tab[role=tab][aria-selected=true]",
        "No global/stale canvas lookup is allowed",
      );
      return [tab];
    },
    getElementById: (id) => (id === "other-panel" ? panel : null),
  };
  return { document, tab, panel, canvas, input, table };
}
function inspect(
  f,
  fn = () => inspectSelectedDocumentReady("361-other.docx", 3, cells),
) {
  const before = globalThis.document;
  globalThis.document = f.document;
  try {
    return fn();
  } finally {
    globalThis.document = before;
  }
}
test("readiness is tied to selected document, its own panel and exact grid/text", () => {
  const f = fixture();
  const r = inspect(f);
  assert.equal(r.panelId, "other-panel");
  assert.deepEqual(r.cells, cells);
  f.tab.textContent = "361-table.docx";
  assert.equal(inspect(f), null);
});
test("inactive/stale pane, unloaded fonts, missing input and unpainted canvas reject readiness", () => {
  for (const change of [
    (f) => (f.panel.closest = () => ({ hidden: true })),
    (f) => (f.document.fonts.status = "loading"),
    (f) => (f.input.getClientRects = () => []),
    (f) => (f.canvas.width = 0),
  ]) {
    const f = fixture();
    change(f);
    assert.equal(inspect(f), null);
  }
});
test("wrong columns or stale cell text do not satisfy selected document guard", () => {
  const f = fixture();
  assert.equal(
    inspect(f, () => inspectSelectedDocumentReady("361-other.docx", 4, cells)),
    null,
  );
  assert.equal(
    inspect(f, () =>
      inspectSelectedDocumentReady("361-other.docx", 3, ["stale"]),
    ),
    null,
  );
});
test("actual serialized native script is self-contained and preserves panel identity", () => {
  const f = fixture();
  const r = vm.runInNewContext(
    "(function(){" + selectedDocumentReadyScript + "}).apply(null,args)",
    { document: f.document, args: ["361-other.docx", 3, cells] },
  );
  assert.equal(r.panelId, "other-panel");
});
test("pointer resolves selected pane only and rejects hidden/out-of-canvas targets", () => {
  const f = fixture();
  const p = inspect(f, () => inspectSelectedCanvasPoint(145, 110));
  assert.deepEqual(p.point, { x: 546, y: 338 });
  assert.equal(p.panelId, "other-panel");
  assert.equal(
    inspect(f, () => inspectSelectedCanvasPoint(900, 110)),
    null,
  );
  f.panel.closest = () => ({ inert: true });
  assert.equal(
    inspect(f, () => inspectSelectedCanvasPoint(145, 110)),
    null,
  );
});

test("BODY-portaled input is observed without requiring false panel ancestry", () => {
  const f = fixture();
  f.panel.querySelector = () => null;
  const r = inspect(f);
  assert.equal(r.globalInputPortals, 1);
  assert.match(r.inputOwnership, /not input ancestry/);
});

test("fresh362 fixture can require its real2x3 grid and exact six header cells", () => {
  const f = fixture();
  const six = ["Alpha", "Beta", "Gamma", "One", "Two", "Three"];
  f.table.getAttribute = (n) =>
    n === "aria-rowcount" ? "2" : n === "aria-colcount" ? "3" : null;
  f.table.querySelectorAll = () => six.map((textContent) => ({ textContent }));
  const r = inspect(f, () =>
    inspectSelectedDocumentReady("361-other.docx", 3, six, 2),
  );
  assert.equal(r.rows, 2);
  assert.deepEqual(r.cells, six);
});

test("actual362 all-header fixture requires all six columnheader texts inDOM order", () => {
  const f = fixture();
  const six = ["Alpha", "Beta", "Gamma", "One", "Two", "Three"];
  f.table.getAttribute = (n) =>
    n === "aria-rowcount" ? "2" : n === "aria-colcount" ? "3" : null;
  f.table.querySelectorAll = (selector) =>
    selector === "[role=cell]"
      ? []
      : selector === "[role=columnheader],[role=rowheader],[role=cell]"
        ? six.map((textContent) => ({ textContent }))
        : [];
  const r = inspect(f, () =>
    inspectSelectedDocumentReady("361-other.docx", 3, six, 2),
  );
  assert(r);
  assert.deepEqual(r.cells, six);
  assert.equal(
    inspect(f, () =>
      inspectSelectedDocumentReady("361-other.docx", 3, [...six].reverse(), 2),
    ),
    null,
  );
});
test("mixed columnheader/rowheader/cell selector preserves DOM order instead of role grouping", () => {
  const f = fixture();
  const ordered = [
    { role: "columnheader", textContent: "alpha" },
    { role: "cell", textContent: "beta" },
    { role: "rowheader", textContent: "" },
    ...cells.slice(3).map((textContent) => ({ role: "cell", textContent })),
  ];
  f.table.querySelectorAll = (selector) =>
    ordered.filter((n) => selector.includes("[role=" + n.role + "]"));
  const r = inspect(f);
  assert(r);
  assert.deepEqual(r.cells, cells);
});
