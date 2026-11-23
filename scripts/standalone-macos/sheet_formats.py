"""Explicit supplementary GNM/Gnumeric and XLSB native routes, never core substitutes."""
from pathlib import Path
import json
import re
import time
import urllib.request
from contracts import digest
from native import Unavailable
from stw import picker_open,REQUIRED_CORE
import gnm_oracle
import xlsb_oracle

GNM_ORACLE_SHA="7f47fe4fbd5fdc66a1c8179300d257dcef0e1ebae514d7271159c3469dfbb599"
XLSB_ORACLE_SHA="e75c41fd23fa4285b13351b143c6d9d6a7120e58fc16107c1af14476b0f6dae7"
XLSB_URL="https://raw.githubusercontent.com/LibreOffice/core/bd7011e96264ddfe5506839319dd610975328a59/sc/qa/unit/data/xlsb/shared_formula.xlsb"


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


def run_native(session,kind):
    from cases import Case
    if kind not in ("gnm","gnumeric","xlsb"):raise Unavailable("No other supplemental formats are authorized")
    if session.app!="spreadsheet" or not all(session.report.get(k) is True for k in REQUIRED_CORE):
        raise Unavailable("Ordinary standalone Spreadsheet core preflight must pass first")
    if session.process and session.process.poll() is None:raise Unavailable("Previous case must fully quit before next spreadsheet format")
    receipt={"status":"running","nativeAccepted":False,"scope":"One pinned original source via ."+kind,
             "applicationSource":session.report["source"],"coreSpreadsheetPassedBeforeThisCase":True}
    session.report.setdefault("additionalCases",{})[kind]=receipt
    fixture,oracle,binding=prepare(session.root/kind,kind);receipt["input"]=binding
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
    output=session.root/kind/"imported-original.xlsx"
    receipt["beforeEditOracle"]=save_xlsx(case,output,oracle,kind,False)
    if kind!="xlsb":case.select(["AXRadioButton","AXTab","AXButton"],["Sheet2"])
    cell="A15" if kind=="xlsb" else "A1";text="=40+2" if kind=="xlsb" else gnm_oracle.MARKER
    case.select(["AXTextField","AXComboBox"],["Name box"]);case.replace(cell);session.ax("key","return")
    case.edit_selected_cell(cell,text,expected=("=1+2","1+2") if kind=="xlsb" else "")
    output=session.root/kind/"edited-native.xlsx"
    receipt["editedOracle"]=save_xlsx(case,output,oracle,kind,True)
    old=session.quit();session.start(output)
    if session.process.pid==old:raise Unavailable("Supplementary XLSX cold reopen reused old PID")
    if kind!="xlsb":case.select(["AXRadioButton","AXTab","AXButton"],["Sheet2"])
    case.select(["AXTextField","AXComboBox"],["Name box"]);case.replace(cell);session.ax("key","return")
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
