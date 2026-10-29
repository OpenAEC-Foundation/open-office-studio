/** Publieke ingang van de VBA-module. */
export { lex } from "./lexer.ts";
export { parseerModule, parseerExpressie, type ParseerResultaat, type ModuleSoort } from "./parser.ts";
export type * from "./ast.ts";
export { VbaRuntime, type ModuleBron, type RuntimeOpties, type Uitkomst } from "./interpreter.ts";
export { VbaFout, VbaAfbreking, VbaParseerFout, foutTekst, foutTekstOfAlgemeen, type Positie } from "./fouten.ts";
export type { VbaHost, FormulierHost, FormulierDoel, HostWaarde, HostGebeurtenis, MsgBoxVerzoek, InputBoxVerzoek } from "./host.ts";
export { NEDERLANDS, ENGELS_VS, type Landinstelling } from "./land.ts";
export { scanAfscherming, GEWEIGERDE_FUNCTIES, GEWEIGERDE_LEDEN, type Bevinding, type Afscherming } from "./afscherming.ts";
export { naarHost, vanHost } from "./conversie.ts";
export { formatteer } from "./format.ts";
export { analyseerExtern, analyseerExternGeparst, leesLibid, oorzaakGroep, NAGEBOOTSTE_PROGIDS, type ExternOpties, type GeparsteModule } from "./extern.ts";
export type * from "./extern-typen.ts";
export { OntbrekendObject } from "./ontbrekend.ts";
