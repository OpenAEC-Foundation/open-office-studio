"""One genuine legacy STW native route, after standalone Writer DOCX preflight."""
from pathlib import Path
import time
import urllib.request
import re
from contracts import digest
from native import Unavailable
from stw_oracle import source_oracle,docx_audit,SOURCE_SHA256

ORACLE_ORIGIN="082319659e0e2349c8ab8860a7d886c6733a936e:scripts/format30-stw-oracle.py"
ORACLE_SHA256="172b3ab9bf92cdb804fc68958c894e8468a31671af83a0ddee936f68221fe0ec"
FIXTURE_URL="https://raw.githubusercontent.com/LibreOffice/core/ded596096a767fa470eea8dfccd51c1af5c3dd54/qadevOOo/testdocs/report.stw"
MARKER=" STANDALONE_STW_EDIT MARIGOLD"
REQUIRED_CORE=("identityVerified","suiteAbsent","freshProfileVerified","ownCwdEnvironmentVerified",
               "nativeFocusVerified","nativeSaveVerified","outputOraclePassed","fullQuitVerified",
               "newPidReopenVerified","ownConverterChildObserved","functionalCaseCompleted")


def prepare(folder):
    folder=Path(folder);folder.mkdir(exist_ok=False)
    oracle_file=Path(__file__).with_name("stw_oracle.py")
    if digest(oracle_file)!=ORACLE_SHA256:raise Unavailable("Pinned independent STW oracle source changed")
    with urllib.request.urlopen(FIXTURE_URL,timeout=30) as response:data=response.read(11187)
    if len(data)!=11186:raise Unavailable("Immutable report.stw size differs")
    fixture=folder/"report.stw";fixture.write_bytes(data)
    if digest(fixture)!=SOURCE_SHA256:raise Unavailable("Immutable report.stw digest differs")
    return fixture,source_oracle(fixture)


def picker_open(case,fixture):
    # The real start page also has an Open button. The observed ordinary
    # header command is uniquely contained in the Quick access toolbar.
    case.button("Open",toolbar="Quick access")
    case.file_dialog(fixture)


def save_docx(case,output,oracle,marker):
    case.office_save_as(output,"docx","Word document")
    deadline=time.monotonic()+20;last=None
    while True:
        try:return docx_audit(output,oracle,marker)
        except Exception as error:
            last=error
            if time.monotonic()>=deadline:raise Unavailable("STW native DOCX Save As did not pass independent source oracle: "+str(last))
            time.sleep(.3)  # Read only; no repeated edit or Save.


def run_native(session):
    from cases import Case
    if session.app!="writer" or not all(session.report.get(k) is True for k in REQUIRED_CORE):
        raise Unavailable("Ordinary standalone Writer DOCX native preflight must pass before STW")
    if session.process and session.process.poll() is None:raise Unavailable("Previous core case must fully quit before STW")
    receipt={"status":"running","nativeAccepted":False,"scope":"One original report.stw template; no universal STW claim",
             "applicationSource":session.report["source"],"oracleOrigin":ORACLE_ORIGIN,"oracleSHA256":ORACLE_SHA256,
             "tableCount":0,"coreDocxPassedBeforeThisCase":True}
    session.report.setdefault("additionalCases",{})["stw"]=receipt
    fixture,oracle=prepare(session.documents/"stw")
    receipt["input"]={"url":FIXTURE_URL,"sha256":SOURCE_SHA256,"bytes":11186}
    session.write("stw/source-oracle.json",oracle)
    previous=set(session.children)
    session.start();case=Case(session,fixture);picker_open(case,fixture)
    case.writer_visible("TITLE","stw-import-visible")
    converters=[p for k,p in list(session.children.items()) if k not in previous and Path(p["executable"]).name in ("soffice","soffice.bin")]
    conversions=[p for p in converters if re.search(r'--convert-to\s+"?docx(?=[:\s"]|$)',p.get("arguments","")) and ".stw" in p.get("arguments","").lower()]
    if not conversions or not all(p["resolvedInsideOwnApp"] for p in converters):
        raise Unavailable("STW importer did not show an own-bundle converter child")
    receipt["actualStwConversionChildren"]=conversions
    output=session.documents/"stw/imported-original.docx"
    receipt["beforeEditOracle"]=save_docx(case,output,oracle,"")
    target=case.writer_visible("TITLE","stw-before-edit",placement="after-word")
    session.ax("click-point",target);focus=case.focus("Document input")
    if focus.get("AXRole")!="AXTextArea" or focus.get("AXDescription")!="Document input":
        raise Unavailable("STW visible title click did not focus exact Document input")
    session.ax("type",MARKER)
    output=session.documents/"stw/edited-native.docx"
    receipt["editedOracle"]=save_docx(case,output,oracle,MARKER)
    old=session.quit();session.start(output)
    if session.process.pid==old:raise Unavailable("STW DOCX cold reopen reused old PID")
    case.writer_visible("MARIGOLD","stw-reopened-visible-edit")
    receipt["reopenedOracle"]=docx_audit(output,oracle,MARKER)
    if digest(fixture)!=SOURCE_SHA256:raise Unavailable("Native STW route modified the immutable source template")
    session.capture("stw-reopened");session.quit()
    receipt.update(status="functional-evidence-collected-review-pending",nativeOpenFilePicker=True,
                   ownConverterObserved=True,nativeEditAndDocxSaveAs=True,fullQuitNewPidReopen=True,
                   sourceBytesUnchanged=True,visualAndResourceReviewPending=True)
    session.write("stw/receipt.json",receipt)
    return receipt
