/**
 * WebKitGTK kan bij het overdragen van paginacanvassen aan een worker zwarte
 * of verouderde beelden tonen. De indeling blijft in de worker; het afgeronde
 * beeld presenteren we op Linux in het gewone canvas. Dit gebruikt de
 * replaykeuze van de vastgezette documentengine. Andere platformen houden
 * hun eigen renderer. Een expliciete keuze in de URL gaat voor.
 */
export function writerWeergaveUrl(url: string, agent: string, desktop: boolean): string | null {
  if (!desktop || !/Linux/.test(agent) || !/AppleWebKit/.test(agent) || /Chrome|Chromium|Edg\//.test(agent)) return null;
  const locatie = new URL(url);
  if (locatie.searchParams.has("offscreenReplay")) return null;
  locatie.searchParams.set("offscreenReplay", "0");
  return locatie.href;
}

export function bereidWriterWeergaveVoor() {
  const url = writerWeergaveUrl(location.href, navigator.userAgent, "__TAURI_INTERNALS__" in window);
  if (url) history.replaceState(history.state, "", url);
}
