"""Independent XLSX interoperability checks. Run using LibreOffice's Python/UNO.

Set OPENAEC_CONVERSIE_PROGRAMMA to soffice.com/exe. Uses an isolated profile,
hidden documents and a loopback UNO socket; never changes an installed profile.
The two inputs come from the production-browser regression scripts.
"""
import json
import base64
import hashlib
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
import zipfile
from xml.etree import ElementTree as ET
import uno

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get("OOS_TEST_UIT", ".local/proef-validatie-beveiliging-libre")


def prop(name, value):
    p = uno.createUnoStruct("com.sun.star.beans.PropertyValue")
    p.Name, p.Value = name, value
    return p


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    session = OUT / ("session-" + uuid.uuid4().hex[:12])
    session.mkdir()
    profile = Path(tempfile.mkdtemp(prefix="oos-vp-"))
    (profile / "user").mkdir()
    shutil.copyfile(ROOT / "src-tauri/src/conversieprofiel.xcu", profile / "user/registrymodifications.xcu")
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        port = port_socket.getsockname()[1]
    channel = "socket,host=127.0.0.1,port=" + str(port)
    exe = os.environ["OPENAEC_CONVERSIE_PROGRAMMA"]
    env = dict(os.environ, SAL_DISABLE_DEFAULTPRINTER="1", SAL_DISABLE_PRINTERLIST="1")
    for key in ("URE_BOOTSTRAP", "UNO_PATH", "UNO_SERVICES", "UNO_TYPES", "PYTHONHOME", "PYTHONPATH"):
        env.pop(key, None)
    args = [exe, "--accept=" + channel + ";urp", "-env:UserInstallation=" + profile.as_uri(), "--quickstart=no", "--norestore", "--nologo", "--headless"]
    child = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    desktop, docs, report = None, [], {"checks": {}, "runtime": exe}
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        limit = time.monotonic() + 40
        while True:
            try:
                context = resolver.resolve("uno:" + channel + ";urp;StarOffice.ComponentContext")
                break
            except Exception:
                if time.monotonic() >= limit:
                    raise TimeoutError("Our isolated LibreOffice did not start within 40 seconds")
                time.sleep(.05)
        desktop = context.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", context)
        reference=desktop.loadComponentFromURL("private:factory/scalc","_blank",0,(prop("Hidden",True),))
        docs.append(reference)
        reference.protect("Book123")
        reference.storeToURL((OUT/"native-workbook-protection.xlsx").as_uri(),(prop("FilterName","Calc MS Excel 2007 XML"),prop("Overwrite",True)))
        report["nativeWorkbookProtected"]=reference.isProtected()
        with zipfile.ZipFile(OUT/"native-workbook-protection.xlsx") as reference_zip:
            report["nativeWorkbookXml"]=ET.fromstring(reference_zip.read("xl/workbook.xml")).find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}workbookProtection").attrib

        def load(path):
            doc = desktop.loadComponentFromURL(path.as_uri(), "_blank", 0, (prop("Hidden", True), prop("MacroExecutionMode", uno.getConstantByName("com.sun.star.document.MacroExecMode.NEVER_EXECUTE")), prop("UpdateDocMode", uno.getConstantByName("com.sun.star.document.UpdateDocMode.NO_UPDATE"))))
            if doc is None:
                raise AssertionError("No document loaded: " + str(path))
            docs.append(doc)
            return doc

        validation = load(ROOT / ".local/proef-validatie/saved.xlsx")
        sheet = validation.Sheets.getByIndex(0)
        rule = sheet.getCellRangeByName("B2").Validation
        report["validation"] = {"type": rule.Type.value, "formula1": rule.Formula1, "inputTitle": rule.InputTitle, "errorStyle": rule.ErrorAlertStyle.value}
        report["checks"]["list"] = rule.Type.value == "LIST" and "Red" in rule.Formula1 and "Green" in rule.Formula1 and rule.InputTitle == "Pick a colour"
        number = sheet.getCellRangeByName("C3").Validation
        report["checks"]["wholeWarning"] = number.Type.value == "WHOLE" and number.ErrorAlertStyle.value == "WARNING" and number.Formula1 == "1" and number.Formula2 == "10"
        report["checks"]["validationValues"] = sheet.getCellRangeByName("B2").String == "Green" and sheet.getCellRangeByName("C3").Value == 99
        validation.storeToURL((OUT / "validation-roundtrip.xlsx").as_uri(), (prop("FilterName", "Calc MS Excel 2007 XML"), prop("Overwrite", True)))

        protection = load(ROOT / ".local/proef-beveiliging/saved.xlsx")
        with zipfile.ZipFile(ROOT/".local/proef-beveiliging/saved.xlsx") as source_zip:
            for part in source_zip.namelist():
                if part.endswith((".xml",".rels")):
                    ET.fromstring(source_zip.read(part))
            source_book=ET.fromstring(source_zip.read("xl/workbook.xml")).find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}workbookProtection").attrib
        report["checks"]["workbookSourceFlag"]=source_book.get("lockStructure") in ("true","1")
        h=hashlib.sha512(base64.b64decode(source_book["workbookSaltValue"])+"Book123".encode("utf-16le")).digest()
        for i in range(int(source_book["workbookSpinCount"])):
            h=hashlib.sha512(h+i.to_bytes(4,"little")).digest()
        report["checks"]["workbookSourceHash"]=base64.b64encode(h).decode()==source_book["workbookHashValue"]
        sheet = protection.Sheets.getByIndex(0)
        report["checks"]["sheetProtected"] = sheet.isProtected()
        report["checks"]["lockedHidden"] = sheet.getCellRangeByName("A1").CellProtection.IsLocked and sheet.getCellRangeByName("A1").CellProtection.IsFormulaHidden
        report["checks"]["unlocked"] = not sheet.getCellRangeByName("B3").CellProtection.IsLocked
        report["checks"]["formula"] = sheet.getCellRangeByName("A1").Formula == "=B3+2" and sheet.getCellRangeByName("A1").Value == 22
        report["observedWorkbookProtected"] = protection.isProtected()
        protection.storeToURL((OUT / "protection-roundtrip.xlsx").as_uri(), (prop("FilterName", "Calc MS Excel 2007 XML"), prop("Overwrite", True)))
        try:
            sheet.unprotect("wrong")
        except Exception:
            pass
        report["checks"]["wrongPassword"] = sheet.isProtected()
        sheet.unprotect("Test123")
        report["checks"]["modernPassword"] = not sheet.isProtected()
        try:
            protection.unprotect("wrong")
        except Exception:
            pass
        report["observedWrongWorkbookPassword"] = protection.isProtected()
        protection.unprotect("Book123")
        report["observedModernWorkbookPassword"] = not protection.isProtected()
        if report["nativeWorkbookXml"].get("lockStructure") not in ("true","1"):
            report["limitations"]=["LibreOffice did not export structure protection from its own protected control document and does not import this XLSX workbook protection. Its XLSX round trip loses workbookProtection. Spreadsheet's own saved XML and hash are verified separately; this is not a passing workbook-conversion test."]
        else:
            report["checks"]["nativeWorkbookProtection"]=report["observedWorkbookProtected"] and report["observedWrongWorkbookPassword"] and report["observedModernWorkbookPassword"]
        for label in ["validation", "protection"]:
            with zipfile.ZipFile(OUT / (label + "-roundtrip.xlsx")) as z:
                for part in z.namelist():
                    if part.endswith((".xml", ".rels")):
                        ET.fromstring(z.read(part))
                root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
                ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                report["checks"][label + "WorksheetRoundtrip"] = len(root.findall("s:dataValidations/s:dataValidation", ns)) == 2 if label == "validation" else root.find("s:sheetProtection", ns).get("sheet") in ("true", "1")
        report["pass"] = all(report["checks"].values())
        print(json.dumps(report, ensure_ascii=False))
        assert report["pass"], report
    finally:
        for doc in docs:
            try:
                doc.close(True)
            except Exception:
                pass
        if desktop:
            try:
                desktop.terminate()
            except Exception:
                pass
        try:
            output, _ = child.communicate(timeout=8)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
            else:
                child.kill()
            output, _ = child.communicate(timeout=5)
        (session / "converter.log").write_bytes(output)
        (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
