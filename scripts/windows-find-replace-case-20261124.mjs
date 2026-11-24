/** Ordinary native search/replace acceptance; real UI input, never editor APIs. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

export async function testNativeFindReplace({ out, exe, port, startApplication, closeApplication, getPage, waitFor, report,
  planPath = "docs/tests/windows-writer-find-replace-20261124/plan.json", runCases }) {
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const mode = {
    "regex-20261124": ["regexCase", "Regex native.docx", "regex"],
    "wildcard-20261124": ["wildcardCase", "Wildcard native.docx", "wildcard"],
    "format-20261124": ["formatCase", "Format native.docx", "format"],
    "special-20261124": ["specialCase", "Special native.docx", "special"],
  }[plan.mode];
  const customMode = Boolean(mode);
  assert.equal(Boolean(runCases), customMode, "Delegated case body requires an explicitly supported QA mode");
  const baseline = plan.baseline, bulk = plan.bulk, single = plan.single;
  let finalExpected = bulk;
  const sha = b => createHash("sha256").update(b).digest("hex");
  const path = join(out, customMode ? mode[1] : "Find Replace native.docx");
  const parts = unzipSync(await readFile("public/templates/nieuw.docx"));
  const escape = s => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const inline = text => text.split(/([\t\v])/).map(t => t === "\t" ? "<w:tab/>" : t === "\v" ? "<w:br/>" : `<w:t xml:space="preserve">${escape(t)}</w:t>`).join("");
  const cell = (text, n) => {
    const s=plan.styleCells;
    const props=s ? `<w:rPr><w:b w:val="${s.bold.includes(n)?1:0}"/><w:i w:val="${s.italic.includes(n)?1:0}"/><w:u w:val="${s.underline.includes(n)?"single":"none"}"/></w:rPr>` : n===1?"<w:rPr><w:b/></w:rPr>":"";
    return `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr>${text.split("\n").map(t=>`<w:p>${s?.heading.includes(n)?'<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>':""}<w:r>${props}${inline(t)}</w:r></w:p>`).join("")}</w:tc>`;
  };
  const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid>${[0,3,6].map(n => `<w:tr>${baseline.slice(n,n+3).map((t,i)=>cell(t,n+i)).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
  parts["word/document.xml"] = strToU8(strFromU8(parts["word/document.xml"]).replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`));
  await writeFile(path, zipSync(parts), { flag: "wx" });
  const evidence = report[customMode ? mode[0] : "findReplaceCase"] = { plan, steps: [], fixtureSha256: sha(await readFile(path)), screenshots: [] };
  let page;
  async function disk() {
    const b = await readFile(path);
    const doc = new DOMParser().parseFromString(strFromU8(unzipSync(b)["word/document.xml"]), "application/xml");
    const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const cells = [...doc.getElementsByTagNameNS(ns,"tc")];
    const text = node => node.localName==="t"?node.textContent:node.localName==="tab"?"\t":node.localName==="br"||node.localName==="cr"?"\v":Array.from(node.childNodes??[]).map(text).join("");
    const enabled = (c,name) => [...c.getElementsByTagNameNS(ns,name)].some(n=>!["0","false","off","none"].includes(n.getAttributeNS(ns,"val")));
    const state = {sha256:sha(b),cells:cells.map(c=>[...c.getElementsByTagNameNS(ns,"p")].map(text).join("\n")),secondCellBold:enabled(cells[1],"b")};
    if(plan.styleCells) state.styleControls={bold1:enabled(cells[1],"b"),bold4:enabled(cells[4],"b"),italic2:enabled(cells[2],"i"),italic4:enabled(cells[4],"i"),underline3:enabled(cells[3],"u"),heading5:cells[5].getElementsByTagNameNS(ns,"pStyle")[0]?.getAttributeNS(ns,"val")};
    return state;
  }
  async function visible(expected) {
    const projection = cells => plan.ariaWhitespaceProjection ? cells.map(s=>s.replace(/\s/gu,"")) : cells;
    await waitFor(async () => {
      const actual=await page.evaluate(() => [...document.querySelectorAll('[role="table"]')].filter(t=>!t.closest('[hidden],[inert]')).flatMap(t=>[...t.querySelectorAll('[role="cell"]')].map(c=>c.textContent)));
      const ok=JSON.stringify(projection(actual))===JSON.stringify(projection(expected));
      if(ok&&plan.ariaWhitespaceProjection) evidence.lastRawAccessibleCells=actual;
      return ok;
    }, "Actual native accessible cells must match expected content (control-character whitespace is audited exactly from DOCX)");
  }
  async function focus() {
    await page.locator(".canvas-page canvas").first().click({ position:{x:150,y:110} });
    await page.waitForFunction(()=>document.activeElement?.matches(".paged-editor__yrs-input"));
  }
  async function save(expected) {
    await page.keyboard.press("Control+s");
    const state = await waitFor(async()=>{ const s=await disk(); return JSON.stringify(s.cells)===JSON.stringify(expected)?s:null; },"Real native CtrlS must persist exact DOCX cell text");
    assert(state.secondCellBold,"Bold formatting in independent control cell retained");
    if(plan.styleCells) assert.deepEqual(state.styleControls,plan.expectedStyleControls,"All explicit positive style and heading controls retained");
    await page.waitForFunction(()=>!/[•●]/.test(document.title));
    return state;
  }
  async function shot(name) {
    const buttons=page.locator('.office-melding-sluiten');
    while(await buttons.count()) await buttons.first().click();
    await page.screenshot({path:join(out,`${name}.png`)}); evidence.screenshots.push(`${name}.png`);
  }
  const original=await disk(); assert.deepEqual(original.cells,baseline); assert(original.secondCellBold);
  const pid0=await startApplication(exe,port,path,true);page=getPage();await visible(baseline);await focus();
  await page.keyboard.press("Control+Home"); await page.keyboard.type("QA ");
  const prefixed=["QA "+baseline[0],...baseline.slice(1)];await visible(prefixed);
  const preflightSaved=await save(prefixed);await closeApplication();
  const pid1=await startApplication(exe,port,path,true);assert.notEqual(pid0,pid1);page=getPage();await visible(prefixed);
  assert.equal((await disk()).sha256,preflightSaved.sha256);
  await focus();await page.keyboard.press("Control+Home");
  for(let i=0;i<3;i++) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Backspace");await visible(baseline);const baselineSaved=await save(baseline);
  evidence.preflightSaved = preflightSaved; evidence.baselineSaved = baselineSaved;
  evidence.steps.push({name:"Current real editor focus/keyboard/save/normal close/newPID reopen preflight",passed:true,pid0,pid1});
  await page.keyboard.press("Control+h");
  const pane=page.getByRole("search",{name:"Find and Replace",exact:true});
  const query=pane.getByRole("searchbox",{name:"Find what",exact:true});
  const replacement=pane.getByRole("textbox",{name:"Replace with",exact:true});
  const whole=pane.getByRole("checkbox",{name:"Find whole words only",exact:true});
  const matchCase=pane.getByRole("checkbox",{name:"Match case",exact:true});
  async function textInput(field,text){await field.click();await page.keyboard.press("Control+a");if(text)await page.keyboard.type(text);else await page.keyboard.press("Backspace");assert.equal(await field.inputValue(),text);}
  async function results(n){await waitFor(async()=>await pane.locator('.tw-zoek-resultaten li').count()===n,`Native search must report ${n} results`);return await pane.locator('.tw-zoek-telling').textContent();}
  if (runCases) {
    const result=await runCases({page,pane,query,replacement,whole,matchCase,textInput,results,visible,baseline,bulk,single,plan,evidence,disk,baselineSaved,waitFor});
    if(result?.expectedFinal) {
      assert(plan.mode==="special-20261124"&&plan.collectIndependentFailures===true);
      finalExpected=result.expectedFinal;evidence.partialExpectedFinal=finalExpected;
    }
  } else {
  await textInput(query,"kat");let status=await results(plan.counts.literal);
  evidence.steps.push({name:"Literal case-insensitive search includes substrings across cells",passed:true,status});
  await whole.check();status=await results(plan.counts.whole);
  evidence.steps.push({name:"Whole words exclude underscore/digit continuations; emoji is a boundary",passed:true,status});
  await matchCase.check();status=await results(plan.counts.wholeCase);
  evidence.steps.push({name:"Match case filters the same whole-word result set",passed:true,status});
  await textInput(replacement,"hond");
  await pane.locator('.tw-zoek-resultaten li button').first().click();
  await pane.getByRole('button',{name:'Replace',exact:true}).click();await visible(single);
  await page.waitForFunction(()=>document.activeElement?.matches('.paged-editor__yrs-input'));
  await page.keyboard.press('Control+z');await visible(baseline);
  await page.keyboard.press('Control+y');await visible(single);
  await page.keyboard.press('Control+z');await visible(baseline);
  evidence.steps.push({name:"Replace current changes only selected eligible match; immediate document Undo/Redo works with pane open",passed:true});
  await matchCase.uncheck();await results(plan.counts.whole);
  await pane.getByRole('button',{name:'Replace All',exact:true}).click();await visible(bulk);
  await page.waitForFunction(()=>document.activeElement?.matches('.paged-editor__yrs-input'));
  evidence.bulkStatus=await pane.locator('.tw-zoek-telling').textContent();
  await page.keyboard.press('Control+z');await visible(baseline);
  await page.keyboard.press('Control+y');await visible(bulk);
  await page.keyboard.press('Control+z');await visible(baseline);
  await page.keyboard.press('Control+Shift+z');await visible(bulk);
  evidence.steps.push({name:"Replace All affects exactly six eligible whole words; one-step Undo and both Redo shortcuts preserve excluded text",passed:true});
  }
  await page.locator('.tw-zoek-sluit').click();await page.waitForFunction(()=>document.activeElement?.matches('.paged-editor__yrs-input'));
  const prefix=customMode?mode[2]:'find-replace';
  const saved=await save(finalExpected);evidence.saved=saved;await shot(`${prefix}-saved`);await closeApplication();
  const pid2=await startApplication(exe,port,path,true);assert.notEqual(pid1,pid2);page=getPage();await visible(finalExpected);
  assert.deepEqual(await disk(),saved);await shot(`${prefix}-reopened`);
  await page.keyboard.press('Control+h');
  const reopenedPane=page.getByRole('search',{name:'Find and Replace',exact:true});
  await textInput(reopenedPane.getByRole('searchbox',{name:'Find what',exact:true}),customMode?plan.reopenQuery:'hond');
  await waitFor(async()=>await reopenedPane.locator('.tw-zoek-resultaten li').count()===(customMode?plan.reopenCount:6),'Reopened actual document finds every persisted replacement');
  evidence.steps.push({name:"Real CtrlS, normal exit, newPID reopen retains exact replacements and bold control; reopened native Find confirms persisted text",passed:true,pid1,pid2});
  await page.locator('.tw-zoek-sluit').click();await closeApplication();
  evidence.processIds=[pid0,pid1,pid2];evidence.docx=path;evidence.visualStatus='requires screenshot review';
  evidence.acceptanceStatus=evidence.failures?.length?"failed":"passed";
  report.checks.push({name:customMode?`Focused native ${mode[2]} ${evidence.acceptanceStatus}`:'Focused native ordinary Find/Replace acceptance',steps:evidence.steps.length,failures:evidence.failures?.length??0});
}
