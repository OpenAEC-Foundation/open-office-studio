/**
 * Het hostcontract van de gehoste bouw (bijvoorbeeld een werkplek die Open Office Studio in een iframe laadt): zet de
 * host `window.openaecHost` met `save`, dan gaat opslaan rechtstreeks naar de opslag van de host in plaats van een
 * download. Zonder host blijft opslaan in de browser een download.
 */
export interface OfficeHost {
  save(naam: string, bytes: Uint8Array): Promise<{ naam?: string } | void>;
}

/** De soorten die de host als document opslaat; andere exports blijven een download. */
export const HOST_SOORTEN = ["docx", "xlsx", "pptx", "md"];

export function officeHost(): OfficeHost | undefined {
  const host = (window as { openaecHost?: Partial<OfficeHost> }).openaecHost;
  return host && typeof host.save === "function" ? (host as OfficeHost) : undefined;
}
