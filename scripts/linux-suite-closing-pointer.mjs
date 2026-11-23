import assert from 'node:assert/strict';
/** Real terminal click: no WebDriver response is expected from a destroyed WebView. */
export async function clickClosingNativePointer({target,verify,xdo}){
  assert(target&&target.hit&&target.enabled,'Exact enabled native closing target is hit-testable');
  assert(['Don’t save','Discard changes'].includes(target.label));
  assert(Number.isSafeInteger(target.x)&&Number.isSafeInteger(target.y)&&target.x>=0&&target.y>=0&&target.x<target.width&&target.y<target.height,'Closing point lies inside the actual viewport');
  const before=await verify('before own-window terminal native pointer');
  assert.match(before.windowFocus,/^\d+$/);
  const command=['mousemove','--sync','--window',before.windowFocus,String(target.x),String(target.y),'click','1'];
  await xdo(command);
  return {backend:'x11-xtest',target,before,command};
}
