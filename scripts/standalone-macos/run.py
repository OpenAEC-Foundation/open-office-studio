"""Execute only coordinator-released new48.1 own DMG on a fresh native Mac."""
from pathlib import Path
import argparse
import json
import plistlib
import re
import subprocess
import sys
from contracts import APPS,acceptance_from_evidence,validate_request,verify_package
from prepare import check_harness
from fixtures import create
from native import Session,Unavailable,command
from cases import Case
from mail_fixture_server import Fixture


def verify_transfer(folder,app):
    request=validate_request(json.loads((folder/"request.json").read_text()))
    if app not in request.get("executeApps",list(APPS)):
        raise PermissionError("This native case is not selected in the exact current retry request")
    check_harness(request,Path(__file__).resolve().parents[2])
    proof=json.loads((folder/"provenance.json").read_text())
    dmg=verify_package(request,proof,folder,app)
    return request,proof,dmg


def cleanup_mail_keychain(session):
    """Remove only the UUID created in our initially absent own email account file."""
    for profile in session.profiles:
        path=profile/"email-accounts.json"
        if not path.is_file():continue
        data=json.loads(path.read_text())
        if not isinstance(data,list):raise Unavailable("Unexpected own email account-file schema")
        accounts=data
        for account in accounts:
            identifier=account.get("id","")
            if account.get("email")!="qa@example.invalid" or not re.fullmatch(r"[a-fA-F0-9-]{36}",identifier):
                raise Unavailable("Unexpected own account identity; no keychain deletion attempted")
            result=command(["/usr/bin/security","delete-generic-password","-s","OpenAEC Email Studio","-a",identifier])
            session.write("own-mail-keychain-cleanup.json",result)
            # 44 means that our exact entry did not exist; never delete the whole service.
            if result["code"] not in (0,44):raise Unavailable("Own test account keychain cleanup failed")


def supplementary_cases(session):
    """Extra format failures are recorded separately from the six ordinary core cases."""
    if session.app=="writer":
        from stw import run_native
        routes=[("stw",lambda:run_native(session))]
    elif session.app=="spreadsheet":
        from sheet_formats import run_native
        routes=[(kind,lambda kind=kind:run_native(session,kind)) for kind in ("gnm","gnumeric","xlsb")]
    else:return None
    first_failure=None
    for key,run in routes:
        try:run()
        except Exception as error:
            first_failure=first_failure or error
            extra=session.report["additionalCases"].setdefault(key,{})
            extra.update(status="unavailable-or-incomplete",nativeAccepted=False,
                         failure={"type":type(error).__name__,"message":str(error)})
            if session.process and session.process.poll() is None:
                try:session.capture(key+"-blocked")
                except Exception as capture_error:extra["captureFailure"]=str(capture_error)
            session.write(key+"-result.json",extra)
        if session.process and session.process.poll() is None:
            try:session.quit()
            except Exception as error:
                first_failure=first_failure or error
                session.report["additionalCases"][key]["normalQuitFailure"]=str(error)
                # Other core app matrix jobs continue. No uncertain shared session for next format.
                break
    return first_failure


def main():
    parser=argparse.ArgumentParser();parser.add_argument("app",choices=APPS)
    parser.add_argument("package",type=Path);parser.add_argument("output",type=Path)
    args=parser.parse_args()
    if sys.platform!="darwin":raise SystemExit("Actual fresh macOS host required; no browser substitute")
    if subprocess.check_output(["/usr/bin/uname","-m"],text=True).strip()!="arm64":
        raise SystemExit("Own aarch64 DMG requires an actual arm64 native host")
    request,proof,dmg=verify_transfer(args.package.resolve(),args.app)
    root=Path(__file__).resolve().parents[2];helper=args.output.parent/("standalone-ax-"+args.app)
    subprocess.run(["/usr/bin/swiftc",root/"scripts/standalone-macos/ax.swift","-o",helper],check=True)
    capabilities=json.loads(subprocess.check_output([helper,"capabilities"],text=True))
    if not all(capabilities.get(k) is True for k in ("trusted","screenCaptureAuthorized","eventPostingAuthorized")):
        args.output.mkdir(parents=True,exist_ok=False)
        (args.output/"receipt.json").write_text(json.dumps({"nativeAccepted":False,"status":"host-unavailable",
            "source":request["source"],"provenance":proof,"capabilities":capabilities},indent=2)+"\n")
        raise SystemExit(3)
    ocr=None
    if args.app in ("writer","spreadsheet"):
        ocr=args.output.parent/"standalone-ocr"
        subprocess.run(["/usr/bin/swiftc",root/"scripts/standalone-macos/ocr.swift","-o",ocr],check=True)
    session=Session(args.app,args.output,helper);failure=None;session.ocr=ocr
    session.report.update(source=request["source"],provenance=proof,capabilities=capabilities,
                          visualReviewPassed=False,resourceObservationsReviewed=False,resourceIndependencePassed=False,
                          limitations=["Original native screenshots require visual review.",
                                       "Sampled process/files and runtime inventory do not establish complete converter/resource independence."])
    extras=("stw",) if args.app=="writer" else ("gnm","gnumeric","xlsb") if args.app=="spreadsheet" else ()
    session.report["additionalCases"]={key:{"status":"not-run: ordinary native core preflight pending","nativeAccepted":False} for key in extras}
    mail=None;supplement_failure=None
    try:
        session.install(dmg)
        session.prepare_display()
        fixtures=create(session.documents/"synthetic-inputs",root/"public/templates")
        fixture=Path(fixtures["files"][args.app]["path"])
        session.start(fixture if args.app in ("writer","spreadsheet","presentation") else None)
        case=Case(session,fixture)
        if args.app in ("writer","spreadsheet","presentation"):case.office()
        elif args.app=="notition":case.notition()
        elif args.app=="database":case.database()
        else:
            mail=Fixture(session.root/"synthetic-mail",fixture).__enter__()
            case.email(mail)
        session.quit();session.report["functionalCaseCompleted"]=True
        session.report["status"]="functional-evidence-collected-review-pending"
        session.write("core-receipt.json",session.report)
        supplement_failure=supplementary_cases(session)
    except Exception as error:
        failure=error;session.report.update(status="unavailable-or-incomplete",failure={"type":type(error).__name__,"message":str(error)})
        if session.process and session.process.poll() is None:
            try:session.capture("blocked")
            except Exception as capture_error:session.report["captureFailure"]=str(capture_error)
    finally:
        if mail:
            session.write("synthetic-mail-server.json",mail.receipt());mail.__exit__()
        if session.process and session.process.poll() is None:
            try:session.quit()
            except Exception as error:failure=failure or error;session.report["normalQuitFailure"]=str(error)
        if args.app=="email":
            try:cleanup_mail_keychain(session)
            except Exception as error:session.report["mailKeychainCleanupFailure"]=str(error);failure=failure or error
        session.report["nativeAccepted"]=acceptance_from_evidence(session.report)
        session.cleanup()
        if session.report.get("mailKeychainCleanupFailure"):
            session.report["cleanupPassed"]=False
        # Cleanup is part of acceptance, and manual evidence review is still mandatory.
        session.report["nativeAccepted"]=acceptance_from_evidence(session.report)
        session.write("receipt.json",session.report)
    if failure or supplement_failure:raise SystemExit(2)


if __name__=="__main__":main()
