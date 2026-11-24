"""Explicit supplementary GNM/Gnumeric and XLSB native routes, never core substitutes."""
from pathlib import Path
import json
import re
import time
import urllib.request
from contracts import digest
from native import Unavailable
from cases import is_dialog
from stw import picker_open,REQUIRED_CORE
import gnm_oracle
import xlsb_oracle

GNM_ORACLE_SHA="7f47fe4fbd5fdc66a1c8179300d257dcef0e1ebae514d7271159c3469dfbb599"
XLSB_ORACLE_SHA="e75c41fd23fa4285b13351b143c6d9d6a7120e58fc16107c1af14476b0f6dae7"
XLSB_URL="https://raw.githubusercontent.com/LibreOffice/core/bd7011e96264ddfe5506839319dd610975328a59/sc/qa/unit/data/xlsb/shared_formula.xlsb"


def unsaved_xlsx_copy(snapshot,stem):
    matches=[]
    for row in snapshot.get("rawNodes",[]):
        a=row["attributes"];text=" ".join(str(a.get(k,"")) for k in ("AXTitle","AXDescription","AXHelp"))
        if (a.get("AXRole") in ("AXRadioButton","AXTab") and a.get("AXRoleDescription")=="tab"
                and a.get("AXSelected") is True and a.get("frame") and stem in text and ".xlsx" in text):
            matches.append(a)
    if len(matches)!=1 or "unsaved changes" not in " ".join(str(v) for v in matches[0].values()):
        raise Unavailable("One actual selected unsaved XLSX working-copy tab not established")
    return {k:matches[0].get(k) for k in ("AXTitle","AXDescription","AXHelp","AXSelected","AXValue")}


def default_xlsx_proposal(snapshot,stem):
    rows={r["index"]:r for r in snapshot.get("rawNodes",[])}
    dialogs=[r for r in rows.values() if is_dialog(r["attributes"])
             and "Save as" in (r["attributes"].get("AXTitle"),r["attributes"].get("AXDescription"))]
    if len(dialogs)>1:raise Unavailable("Save As proposal is ambiguous")
    if not dialogs:return None
    children=[]
    for row in rows.values():
        cursor=row
        while cursor:
            if cursor["index"]==dialogs[0]["index"]:children.append(row["attributes"]);break
            cursor=rows.get(cursor["parent"])
    radio=[a for a in children if a.get("AXRole")=="AXRadioButton" and a.get("AXValue") in (True,1)
           and a.get("frame") and a.get("AXEnabled") is not False
           and "Excel workbook (.xlsx)" in (a.get("AXTitle"),a.get("AXDescription"))]
    names=[a for a in children if a.get("AXRole")=="AXTextField" and a.get("AXTitle")=="File name .xlsx"
           and a.get("frame") and a.get("AXEnabled") is not False
           and stem in str(a.get("AXValue","")) and not str(a.get("AXValue","")).lower().endswith(".xlsb")]
    if len(radio)==1 and len(names)==1:return {"dialog":dialogs[0]["attributes"],"selectedFormat":radio[0],"filename":names[0]}
    return None  # Never select XLSX ourselves to manufacture a correct default.


def xlsb_save_policy377(case,fixture,receipt):
    """Raw-import Cmd-S/ordinary Save proposal and cancel, before any Save As."""
    source=digest(fixture);initial=fixture.stat()
    fingerprint={"sha256":source,"bytes":initial.st_size,"mtimeNs":initial.st_mtime_ns}
    proof={"status":"running","nativeAccepted":False,"sourceFingerprint":fingerprint,"routes":{}}
    receipt["savePolicy377"]=proof
    try:
        case.select(["AXTextField","AXComboBox"],["Name box"]);case.replace("A1");case.s.ax("key","return")
        deadline=time.monotonic()+5
        while True:
            snap=case.snapshot();focus=snap.get("focused",{})
            label=focus.get("AXDescription") or focus.get("AXTitle","")
            formula=[r["attributes"] for r in snap.get("rawNodes",[]) if r["attributes"].get("AXRole")=="AXTextField"
                     and "Enter a value or formula" in (r["attributes"].get("AXTitle"),r["attributes"].get("AXDescription"))]
            if (focus.get("AXRole")=="AXCell" and focus.get("AXSelected") is True and label.startswith("A1, ")
                    and len(formula)==1 and formula[0].get("AXValue") in ("=1+2","1+2")):break
            if time.monotonic()>=deadline:raise Unavailable("377 raw XLSB A1 native grid/formula focus not established")
            time.sleep(.2)
        before=unsaved_xlsx_copy(snap,fixture.stem);proof["beforeWorkingCopy"]=before
        for route in ("command-s","ordinary-save"):
            item={"status":"running"};proof["routes"][route]=item
            if route=="command-s":case.s.ax("key","cmd-s")
            else:case.button("Save",toolbar="Quick access")
            deadline=time.monotonic()+45
            while True:
                snap=case.snapshot();proposal=default_xlsx_proposal(snap,fixture.stem)
                if proposal:break
                if time.monotonic()>=deadline:raise Unavailable("377 default XLSX Save As proposal not observed: "+route)
                time.sleep(.2)
            item["proposal"]=proposal;case.s.capture("xlsb377-"+route+"-proposal")
            case.button("Cancel",dialog=True);deadline=time.monotonic()+5
            while True:
                snap=case.snapshot()
                if not any(is_dialog(r["attributes"]) for r in snap.get("rawNodes",[])):break
                if time.monotonic()>=deadline:raise Unavailable("377 ordinary Cancel did not close the Save As dialog")
                time.sleep(.2)
            after=unsaved_xlsx_copy(snap,fixture.stem)
            stat=fixture.stat();current={"sha256":digest(fixture),"bytes":stat.st_size,"mtimeNs":stat.st_mtime_ns}
            if after!=before or current!=fingerprint:raise Unavailable("377 Cancel changed the original source fingerprint or unsaved working-copy tab")
            item.update(status="functional-evidence-collected-review-pending",sourceBytesUnchanged=True,
                        sourceFingerprintAfterCancel=current,unsavedWorkingCopyPreserved=True,afterWorkingCopy=after)
            case.s.capture("xlsb377-"+route+"-cancelled")
        proof["status"]="functional-evidence-collected-review-pending"
    except Exception as error:
        proof.update(status="unavailable-or-incomplete",failure={"type":type(error).__name__,"message":str(error)})
        raise
    finally:case.s.write("xlsb/save-policy377.json",proof)


def prepare(folder,kind):
    folder=Path(folder);folder.mkdir(exist_ok=False)
    if kind in ("gnm","gnumeric"):
        oracle_file=Path(__file__).with_name("gnm_oracle.py");expected_sha=GNM_ORACLE_SHA
        origin="d21243acad54235e2674f7e89f44db75cf6bcb44:scripts/format30-gnm/oracle.py"
        url=gnm_oracle.SOURCE_URL;size=2062;sha=gnm_oracle.SOURCE_SHA;name="universal-content."+kind
    else:
        oracle_file=Path(__file__).with_name("xlsb_oracle.py");expected_sha=XLSB_ORACLE_SHA
        origin="fb7e7b8ad95b9d13ed0ac1a33f70fd9906082588:qa/xlsb35-p2/oracle.py"
        url=XLSB_URL;size=7651;sha=xlsb_oracle.SHA256;name="shared_formula.xlsb"
    if digest(oracle_file)!=expected_sha:raise Unavailable("Pinned independent spreadsheet oracle source changed")
    with urllib.request.urlopen(url,timeout=30) as response:data=response.read(size+1)
    if len(data)!=size:raise Unavailable("Pinned original spreadsheet fixture size differs")
    path=folder/name;path.write_bytes(data)
    if digest(path)!=sha:raise Unavailable("Pinned original spreadsheet fixture digest differs")
    if kind in ("gnm","gnumeric"):oracle=gnm_oracle.source_contents(data)
    else:
        # Independent BIFF12 oracle input location only, never an app/model setting.
        xlsb_oracle.BASE=folder;oracle=xlsb_oracle.source_oracle()
    return path,oracle,{"url":url,"sha256":sha,"bytes":size,"oracleSHA256":expected_sha,"oracleOrigin":origin}


def save_xlsx(case,path,oracle,kind,edited):
    case.office_save_as(path,"xlsx","Excel workbook")
    deadline=time.monotonic()+20
    while True:
        try:
            if kind=="xlsb":return xlsb_oracle.inspect_xlsx(path,edited)
            result=gnm_oracle.check(path.read_bytes(),oracle,marker=edited)
            return {"passed":True,"path":str(path),"sha256":digest(path),"sheets":result,"edited":edited,"nativeAccepted":False}
        except Exception as error:
            if time.monotonic()>=deadline:raise Unavailable("Native XLSX save failed independent source oracle: "+str(error))
            time.sleep(.3)


def readable_grid_zoom(case):
    """Use ordinary visible Zoom controls; never change OCR confidence or body bounds."""
    observed=[]
    for attempt in range(12):
        snapshot=case.snapshot();values=[]
        for row in snapshot.get('rawNodes',[]):
            a=row['attributes'];label=a.get('AXTitle','')
            match=re.fullmatch(r'Zoom (\d+)%, back to 100%',label)
            if a.get('AXRole')=='AXButton' and match and a.get('frame'):values.append(int(match.group(1)))
        if len(values)!=1 or not 25<=values[0]<=200:raise Unavailable('One real bounded native Zoom percentage required')
        observed.append(values[0])
        if values[0]==200:
            case.s.write('native-grid-readability-zoom.json',{'observedPercentages':observed,
                'method':'Actual visible Zoom in buttons; original screenshot/OCR >=0.8 and body/PID checks unchanged'})
            return
        if attempt==11 or (len(observed)>1 and observed[-1]<=observed[-2]):
            raise Unavailable('Native Zoom in did not progress to the readable 200% view')
        case.button('Zoom in',toolbar='Zoom')
    raise Unavailable('Native readable zoom not established')


def selected_workbook(snapshot,filename):
    matches=[r['attributes'] for r in snapshot.get('rawNodes',[]) if
        r['attributes'].get('AXRole') in ('AXRadioButton','AXTab')
        and r['attributes'].get('AXRoleDescription')=='tab' and r['attributes'].get('AXSelected') is True
        and r['attributes'].get('AXTitle')==filename+' Close '+filename
        and str(r['attributes'].get('AXHelp','')).split('\n')[0]==filename and r['attributes'].get('frame')]
    if len(matches)!=1:raise Unavailable('One exact native selected workbook tab required for addon preflight')
    return matches[0]


def run_native(session,kind,baseline=None):
    from cases import Case
    if kind not in ("gnm","gnumeric","xlsb"):raise Unavailable("No other supplemental formats are authorized")
    reused=(baseline is not None and baseline.get('functionalCorePreviouslyVerified') is True
            and baseline.get('source')==session.report.get('source'))
    if reused and not all(session.report.get(k) is True for k in ('identityVerified','installedSignatureGatesVerified','suiteAbsent')):
        raise Unavailable('Current addon host package identity/signature/Suite absence not established')
    if session.app!="spreadsheet" or not (reused or all(session.report.get(k) is True for k in REQUIRED_CORE)):
        raise Unavailable("Ordinary standalone Spreadsheet core preflight must pass first")
    if session.process and session.process.poll() is None:raise Unavailable("Previous case must fully quit before next spreadsheet format")
    receipt={"status":"running","nativeAccepted":False,"scope":"One pinned original source via ."+kind,
             "applicationSource":session.report["source"],"coreSpreadsheetPassedBeforeThisCase":True}
    if reused:receipt['reusedOrdinaryFunctionalCoreBaseline']=baseline
    session.report.setdefault("additionalCases",{})[kind]=receipt
    fixture,oracle,binding=prepare(session.documents/kind,kind);receipt["input"]=binding
    session.write(kind+"/source-oracle.json",oracle)
    previous=set(session.children);session.start();case=Case(session,fixture);picker_open(case,fixture)
    # Name box proves a real active workbook before attempting its native Save As.
    case.select(["AXTextField","AXComboBox"],["Name box"]);case.focus()
    converters=[p for k,p in list(session.children.items()) if k not in previous and Path(p["executable"]).name in ("soffice","soffice.bin")]
    input_extensions=("xlsb",) if kind=="xlsb" else ("gnm","gnumeric")
    conversions=[p for p in converters if re.search(r'--convert-to\s+"?xlsx(?=[:\s"]|$)',p.get("arguments",""))
                 and any("."+ext in p.get("arguments","").lower() for ext in input_extensions)]
    if not conversions or not all(p["resolvedInsideOwnApp"] for p in converters):
        raise Unavailable("Actual legacy spreadsheet import converter not observed inside own app")
    receipt["actualConversionChildren"]=conversions
    if kind=="xlsb":xlsb_save_policy377(case,fixture,receipt)
    output=session.documents/kind/"imported-original.xlsx"
    receipt["beforeEditOracle"]=save_xlsx(case,output,oracle,kind,False)
    if reused:
        # The current fresh host must demonstrate focus/save/normal quit/new-PID
        # reopen before the edit matrix. Prior core flags are never copied into
        # this host's report, and #377 remains before any explicit Save As.
        initial_pid=session.quit();session.start(output)
        if session.process.pid==initial_pid:raise Unavailable('Fresh addon-host preflight reused previous PID')
        case.select(['AXTextField','AXComboBox'],['Name box']);case.focus('Name box')
        receipt['ownNativeHostPreflight']={'nativeFocusVerified':True,'nativeSaveAndIndependentOracleVerified':True,
            'fullNormalQuitVerified':True,'previousPid':initial_pid,'newReopenPid':session.process.pid,
            'actualSelectedWorkbook':selected_workbook(case.snapshot(),output.name)}
    if kind!="xlsb":case.select(["AXRadioButton","AXTab","AXButton"],["Sheet2"])
    cell="A15" if kind=="xlsb" else "A1";text="=40+2" if kind=="xlsb" else gnm_oracle.MARKER
    case.select(["AXTextField","AXComboBox"],["Name box"]);case.replace(cell);session.ax("key","return")
    case.edit_selected_cell(cell,text,expected=("=1+2","1+2") if kind=="xlsb" else "")
    output=session.documents/kind/"edited-native.xlsx"
    receipt["editedOracle"]=save_xlsx(case,output,oracle,kind,True)
    old=session.quit();session.start(output)
    if session.process.pid==old:raise Unavailable("Supplementary XLSX cold reopen reused old PID")
    if kind!="xlsb":case.select(["AXRadioButton","AXTab","AXButton"],["Sheet2"])
    case.select(["AXTextField","AXComboBox"],["Name box"]);case.replace(cell);session.ax("key","return")
    if reused and kind!='xlsb':
        readable_grid_zoom(case)
        case.select(['AXTextField','AXComboBox'],['Name box']);case.replace(cell);session.ax('key','return')
    case.writer_visible("42" if kind=="xlsb" else "EDIT",kind+"-reopened-visible-cell")
    if kind=="xlsb":receipt["reopenedOracle"]=xlsb_oracle.inspect_xlsx(output,True)
    else:receipt["reopenedOracle"]={"sheets":gnm_oracle.check(output.read_bytes(),oracle,marker=True),"sha256":digest(output)}
    if digest(fixture)!=binding["sha256"]:raise Unavailable("Native spreadsheet route changed original binary/gzip source")
    session.capture(kind+"-reopened");session.quit()
    receipt.update(status="functional-evidence-collected-review-pending",nativeOpenFilePicker=True,
        ownConverterObserved=True,nativeEditAndXlsxSave=True,fullQuitNewPidReopen=True,
        sourceBytesUnchanged=True,visualAndResourceReviewPending=True)
    session.write(kind+"/receipt.json",receipt)
    return receipt
