/**
 * Vitest: tests draaien in het Nederlands (de brontaal), los van de systeemtaal
 * van de machine. Een test die een andere taal wil, roept zelf `zetTaal` aan.
 */
import { wijzigInstellingen } from "../instellingen";
import { zetTaal } from "./config";

wijzigInstellingen({ taal: "nl" });
await zetTaal("nl");
