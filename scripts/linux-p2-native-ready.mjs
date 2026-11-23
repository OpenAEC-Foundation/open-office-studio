/** Read-only readiness probe scoped to the selected Office document's own panel. */
export function inspectSelectedDocumentReady(
  name,
  columns,
  expectedCells,
  rows = 3,
) {
  const tabs = [
    ...document.querySelectorAll(".office-tab[role=tab][aria-selected=true]"),
  ].filter((e) => e.textContent.trim().startsWith(name));
  if (tabs.length !== 1) return null;
  const panelId = tabs[0].getAttribute("aria-controls"),
    panel = document.getElementById(panelId);
  if (
    !panel ||
    panel.getAttribute("role") !== "tabpanel" ||
    panel.closest("[hidden],[inert]")
  )
    return null;
  const canvas = [...panel.querySelectorAll(".canvas-page canvas")].find(
    (e) => e.getClientRects().length && e.width > 0 && e.height > 0,
  );
  // The SDK deliberately portals input proxies to document.body, not the pane.
  // Count them only as global observations; never claim an owner from ancestry.
  const inputPortals = [
    ...document.querySelectorAll("[data-testid=yrs-input]"),
  ].filter((e) => e.getClientRects().length);
  if (
    !canvas ||
    inputPortals.length === 0 ||
    document.fonts.status !== "loaded"
  )
    return null;
  const tables = [...panel.querySelectorAll("[role=table]")].filter(
    (e) => !e.closest("[hidden],[inert]"),
  );
  if (
    tables.length !== 1 ||
    Number(tables[0].getAttribute("aria-rowcount")) !== rows ||
    Number(tables[0].getAttribute("aria-colcount")) !== columns
  )
    return null;
  const cells = [
    ...tables[0].querySelectorAll(
      "[role=columnheader],[role=rowheader],[role=cell]",
    ),
  ].map((c) => c.textContent);
  if (expectedCells && JSON.stringify(cells) !== JSON.stringify(expectedCells))
    return null;
  const r = canvas.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return null;
  return {
    name,
    panelId,
    columns,
    rows,
    cells,
    fonts: document.fonts.status,
    globalInputPortals: inputPortals.length,
    inputOwnership:
      "Global BODY portal; selected document ownership is established by tab/panel/grid/canvas, not input ancestry",
    canvas: { x: r.x, y: r.y, width: r.width, height: r.height },
  };
}
export const selectedDocumentReadyScript = `return (${inspectSelectedDocumentReady.toString()})(...arguments)`;
export const twoReadOnlyFramesScript =
  "return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))";

export function inspectSelectedCanvasPoint(x, y) {
  const tabs = [
    ...document.querySelectorAll(".office-tab[role=tab][aria-selected=true]"),
  ];
  if (tabs.length !== 1) return null;
  const panelId = tabs[0].getAttribute("aria-controls"),
    panel = document.getElementById(panelId);
  if (!panel || panel.closest("[hidden],[inert]")) return null;
  const canvas = [...panel.querySelectorAll(".canvas-page canvas")].find(
    (e) => e.getClientRects().length && e.width > 0 && e.height > 0,
  );
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
  return {
    panelId,
    point: { x: Math.round(r.x + x), y: Math.round(r.y + y) },
    canvas: { x: r.x, y: r.y, width: r.width, height: r.height },
  };
}
export const selectedCanvasPointScript = `return (${inspectSelectedCanvasPoint.toString()})(...arguments)`;

export function inspectSelectedDocumentAnatomy() {
  const rect = (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  return {
    fonts: document.fonts.status,
    tabs: [...document.querySelectorAll(".office-tab[role=tab]")].map((e) => ({
      name: e.textContent.trim(),
      selected: e.getAttribute("aria-selected"),
      controls: e.getAttribute("aria-controls"),
    })),
    panels: [...document.querySelectorAll(".office-tabpaneel")].map((p) => ({
      id: p.id,
      blocked: Boolean(p.closest("[hidden],[inert]")),
      tables: [...p.querySelectorAll("[role=table]")].map((t) => ({
        rows: t.getAttribute("aria-rowcount"),
        columns: t.getAttribute("aria-colcount"),
        cells: [
          ...t.querySelectorAll(
            "[role=columnheader],[role=rowheader],[role=cell]",
          ),
        ].map((c) => ({ role: c.getAttribute("role"), text: c.textContent })),
      })),
      canvases: [...p.querySelectorAll(".canvas-page canvas")].map((c) => ({
        width: c.width,
        height: c.height,
        rect: rect(c),
      })),
    })),
    inputPortals: [...document.querySelectorAll("[data-testid=yrs-input]")].map(
      (e) => ({
        tag: e.tagName,
        parent: e.parentElement?.tagName,
        panel: e.closest("[role=tabpanel]")?.id ?? null,
        rect: rect(e),
      }),
    ),
  };
}
export const selectedDocumentAnatomyScript = `return (${inspectSelectedDocumentAnatomy.toString()})()`;
