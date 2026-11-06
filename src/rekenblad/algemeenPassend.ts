/** Versmallen van Algemene notatie met de decimale scheiding van het bestand. */
interface Meetcontext {
  measureText(tekst: string): { width: number };
}
type Passer = (
  waarde: number,
  breedte: number,
  context: Meetcontext,
) => string | undefined;

/** De bestaande afronding werkt met canonieke cijfers. Alleen haar meet- en
 * tekenresultaat gebruiken de bestandsdecimaal; letterlijke celtekst wordt
 * hier nooit aangeboden. */
export function passendAlgemeen(
  pas: Passer,
  waarde: number,
  breedte: number,
  context: Meetcontext,
  decimaal: string,
): string | undefined {
  const lokaal = (tekst: string) => tekst.replace(".", decimaal);
  const resultaat = pas(waarde, breedte, {
    measureText: (tekst) => context.measureText(lokaal(tekst)),
  });
  return resultaat === undefined ? undefined : lokaal(resultaat);
}
