/** Read-only readiness probe scoped to the selected Office document's own panel. */
export function inspectSelectedDocumentReady(name, columns, expectedCells) {
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
  const input = panel.querySelector("[data-testid=yrs-input]");
  if (
    !canvas ||
    !input?.getClientRects().length ||
    document.fonts.status !== "loaded"
  )
    return null;
  const tables = [...panel.querySelectorAll("[role=table]")].filter(
    (e) => !e.closest("[hidden],[inert]"),
  );
  if (
    tables.length !== 1 ||
    Number(tables[0].getAttribute("aria-rowcount")) !== 3 ||
    Number(tables[0].getAttribute("aria-colcount")) !== columns
  )
    return null;
  const cells = [...tables[0].querySelectorAll("[role=cell]")].map(
    (c) => c.textContent,
  );
  if (expectedCells && JSON.stringify(cells) !== JSON.stringify(expectedCells))
    return null;
  const r = canvas.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return null;
  return {
    name,
    panelId,
    columns,
    rows: 3,
    cells,
    fonts: document.fonts.status,
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
