export function classifyReplacementStatus({editor,errorSpan=[],status=""}) {
  const isSuccess=s=>/^\d+\s+match(?:es)?\s+replaced;/.test(s.replace(/^[\s·]+/u,""));
  const errors=errorSpan.filter(s=>s.trim()&&!isSuccess(s));
  const hasSuccess=status.split("·").some(isSuccess);
  return {success:Boolean(editor&&hasSuccess&&!errors.length),errors};
}
