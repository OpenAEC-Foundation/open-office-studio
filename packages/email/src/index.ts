/** OpenAEC Email Studio: publieke ingangen voor de kantooromgeving. */
export type * from "./contract";
export { kiesBackend, ongelezenInInbox, bewaarBestand, isDesktop } from "./backend";
export { DemoBackend, demoMelding } from "./demo-backend";
export { TauriBackend } from "./tauri-backend";
export { kantoorModule, kanDirectOpenen, moduleNaam, type KantoorModule } from "./kantoor";
export type { EmailActies, EmailStudioProps } from "./ui/EmailStudio";
