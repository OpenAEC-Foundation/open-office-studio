type ConceptToets = Pick<
  KeyboardEvent,
  | "key"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "shiftKey"
  | "repeat"
  | "defaultPrevented"
  | "preventDefault"
> & {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

/** De opstelling bezit haar eigen Opslaan-toets; de host slaat modals over. */
export function conceptOpslaanToets(
  event: ConceptToets,
  bezig: boolean,
  bewaarConcept: () => unknown,
): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.nativeEvent?.isComposing ||
    event.keyCode === 229 ||
    event.nativeEvent?.keyCode === 229 ||
    event.ctrlKey === event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== "s"
  )
    return false;

  // Ook tijdens bewaren/verzenden of toetsherhaling nooit de browserpagina opslaan.
  event.preventDefault();
  if (!event.repeat && !bezig) void bewaarConcept();
  return true;
}
