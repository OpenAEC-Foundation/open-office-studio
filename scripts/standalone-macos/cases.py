"""Native UI recipes. All choices are resolved from the current owned AX tree."""
from pathlib import Path
import time
import zipfile
import xml.etree.ElementTree as ET
from fixtures import SEEDS,MARKERS,CONTROL,WRITER_ANCHOR,WRITER_VISIBLE_EDIT
from native import Unavailable
from oracles import verify
from contracts import digest
from mail_fixture_server import USER,PASSWORD
from vision import visible_word
from native import command
import json


def attributes(snapshot):return [n["attributes"] for n in snapshot.get("rawNodes",[])]


def is_dialog(node):
    return (node.get("AXRole")=="AXSheet" or "Dialog" in node.get("AXSubrole","")
            or node.get("AXRoleDescription")=="dialog" or node.get("AXModal") is True)


class Case:
    def __init__(self,session,fixture):self.s=session;self.fixture=Path(fixture)

    def select(self,roles,labels=(),*,contains=None,action="click",dialog=False):
        deadline=time.monotonic()+4
        while True:
            matches=self.candidates(roles,labels,contains,action,dialog)
            if len(matches)==1:break
            if len(matches)>1 or time.monotonic()>=deadline:
                raise Unavailable("Native selector ambiguous/unavailable: "+str((roles,labels,contains,len(matches))))
            time.sleep(0.2)  # Read-only readiness polling; the eventual input is sent once.
        self.s.ax(action,matches[0]);time.sleep(0.3)
        return matches[0]

    def candidates(self,roles,labels,contains,action,dialog):
        snapshot=self.s.ax("snapshot");matches=[]
        rows={n["index"]:n for n in snapshot.get("rawNodes",[])}
        for row in rows.values():
            node=row["attributes"]
            if node.get("AXRole") not in roles:continue
            if node.get("AXEnabled") is False or not node.get("frame"):continue
            if action=="press" and "AXPress" not in node.get("actions",[]):continue
            if dialog:
                ancestor=row;dialog_found=False
                while ancestor:
                    a=ancestor["attributes"]
                    if is_dialog(a):
                        dialog_found=True;break
                    ancestor=rows.get(ancestor["parent"])
                if not dialog_found:continue
            for field in ("AXDescription","AXTitle","AXIdentifier","AXValue"):
                value=node.get(field)
                if isinstance(value,str) and ((labels and value in labels) or (contains and contains in value)):
                    matches.append({"role":node["AXRole"],"field":field,"value":value,"frame":node["frame"]});break
        return matches

    def button(self,*labels,dialog=False):return self.select(["AXButton"],labels,action="press",dialog=dialog)

    def tab(self,label):return self.select(["AXRadioButton","AXTab"],[label],action="press")

    def focus(self,expected=None):
        snap=self.s.ax("snapshot");focused=snap.get("focused",{})
        if focused.get("AXRole") not in ("AXTextField","AXTextArea","AXComboBox"):
            raise Unavailable("Actual owned editable text focus not proven")
        if expected and not any(expected in str(focused.get(f,"")) for f in ("AXValue","AXTitle","AXDescription")):
            raise Unavailable("Focused native field does not contain expected identity/value")
        self.s.report["nativeFocusVerified"]=True
        return focused

    def replace(self,text,expected=None):
        self.focus(expected);self.s.ax("key","cmd-a");self.s.ax("type",text);time.sleep(0.2)

    def append(self,text,expected):
        self.focus(expected);self.s.ax("key","cmd-end");self.s.ax("type",text);time.sleep(0.2)

    def file_dialog(self,path,*,save=False):
        path=Path(path).resolve()
        # Go To Folder is native. Never assign HTML input/model/backend values.
        deadline=time.monotonic()+4
        while True:
            snapshot=self.s.ax("snapshot")
            if any(n.get("AXRole")=="AXSheet" or (n.get("AXRole")=="AXWindow" and "Dialog" in n.get("AXSubrole",""))
                   for n in attributes(snapshot)):break
            if time.monotonic()>=deadline:raise Unavailable("Expected native file dialog is not present")
            time.sleep(0.2)
        self.s.ax("key","cmd-shift-g");time.sleep(0.4)
        self.replace(str(path.parent if save else path));self.s.ax("key","return");time.sleep(0.6)
        if save:
            self.select(["AXTextField"],["Save As:","Save As","saveAsNameTextField"])
            self.replace(path.name);self.button("Save",dialog=True)
        else:self.button("Open",dialog=True)
        time.sleep(0.8)

    def save_office(self):
        before=self.fixture.stat().st_mtime_ns
        self.s.ax("key","cmd-s")
        deadline=time.monotonic()+12;failure=None
        while time.monotonic()<deadline:
            try:
                result=verify(self.s.app,self.fixture)
                if self.fixture.stat().st_mtime_ns!=before:
                    self.s.report["nativeSaveVerified"]=True;self.s.report["outputOraclePassed"]=True
                    self.s.write("output-oracle.json",result);self.s.capture("saved");return
            except (AssertionError,KeyError,ValueError,OSError,zipfile.BadZipFile,ET.ParseError) as error:
                failure=str(error)  # Retry reads only while the one native Save completes.
            time.sleep(0.4)
        raise Unavailable("Native Save did not produce independently verified edited output: "+str(failure))

    def office(self):
        app=self.s.app
        if app=="writer":
            target=self.writer_visible(WRITER_ANCHOR,"before-input")
            self.s.ax("click-point",target)
            focused=self.focus("Document input")
            if focused.get("AXDescription")!="Document input" or focused.get("AXRole")!="AXTextArea":
                raise Unavailable("Actual visible body click did not focus exact Document input")
            self.s.ax("key","cmd-end");self.s.ax("type"," "+MARKERS[app]+" "+WRITER_VISIBLE_EDIT)
        elif app=="spreadsheet":
            self.select(["AXTextField","AXComboBox"],["Name box"]);self.replace("B2");self.s.ax("key","return");time.sleep(0.4)
            self.focus();self.s.ax("type","42");self.s.ax("key","return")
        elif app=="presentation":
            self.tab("View");self.button("Outline")
            self.select(["AXTextArea"],contains=SEEDS[app]);self.append(" "+MARKERS[app],SEEDS[app])
            # Blur commits the ordinary outline editor's onBlur handler.
            self.button("Normal view")
        self.s.capture("edited");self.save_office()
        old=self.s.quit();snap=self.s.start(self.fixture)
        if self.s.process.pid==old:raise Unavailable("Cold reopen reused the old process")
        self.s.report["newPidReopenVerified"]=True
        if app=="presentation":self.tab("View");self.button("Outline")
        if app=="spreadsheet":
            self.select(["AXTextField","AXComboBox"],["Name box"]);self.replace("B2");self.s.ax("key","return")
            self.s.capture("reopened-B2")
            # Export and a new PID are necessary but not enough: inspect native value too.
            if not any(n.get("AXValue") in ("42",42) for n in attributes(self.s.ax("snapshot"))):
                raise Unavailable("Reopened B2 native value 42 not independently visible in AX")
        elif app=="writer":
            self.writer_visible(WRITER_VISIBLE_EDIT,"reopened-visible-edit")
        else:
            if not any(MARKERS[app] in str(n.get("AXValue","")) for n in attributes(self.s.ax("snapshot"))):
                raise Unavailable("Edited text absent from cold-reopened native UI")
        self.s.write("reopened-oracle.json",verify(app,self.fixture));self.s.capture("reopened")
        self.runtime_export()

    def writer_visible(self,text,label):
        last=None;deadline=time.monotonic()+20;attempt=0
        while True:
            image,snapshot=self.s.capture_original(label+"-"+str(attempt))
            output=image.with_suffix(".ocr.json")
            result=command([self.s.ocr,image,output],timeout=30)
            if result["code"]:raise Unavailable("Native Vision original-pixel inspection failed")
            try:
                target=visible_word(json.loads(output.read_text()),snapshot,self.s.process.pid,digest(image),text)
                self.s.write(image.stem+"-target.json",target)
                return target
            except Unavailable as error:last=error
            if time.monotonic()>=deadline:break
            attempt+=1;time.sleep(0.5)
        raise Unavailable("Visible Writer body target unavailable; no input or paint primer sent: "+str(last))

    def runtime_export(self):
        app=self.s.app
        ext,label={"writer":("odt","OpenDocument Text"),"spreadsheet":("ods","OpenDocument Spreadsheet"),
                   "presentation":("odp","OpenDocument Presentation")}[app]
        if app=="presentation":self.button("Normal view")
        self.s.ax("key","cmd-shift-s");time.sleep(0.5)
        self.select(["AXTextField"],["File name"]);self.replace("standalone-runtime-"+app)
        self.select(["AXRadioButton"],[label+" (."+ext+")"],action="press")
        self.s.capture("own-runtime-choice");self.button("Save",dialog=True);time.sleep(0.5)
        output=self.s.root/("standalone-runtime-"+app+"."+ext)
        self.file_dialog(output,save=True)
        deadline=time.monotonic()+50
        while not output.exists() and time.monotonic()<deadline:time.sleep(0.4)
        if not output.is_file():raise Unavailable("Native runtime export did not produce requested ODF file")
        with zipfile.ZipFile(output) as archive:
            mimetype=archive.read("mimetype").decode()
            expected="application/vnd.oasis.opendocument."+{"writer":"text","spreadsheet":"spreadsheet","presentation":"presentation"}[app]
            if mimetype!=expected:raise Unavailable("Runtime output ODF type differs")
            content=ET.fromstring(archive.read("content.xml"));text=" ".join(content.itertext())
            if SEEDS[app] not in text or CONTROL not in text:raise Unavailable("Runtime ODF lost synthetic seed/control")
            if app!="spreadsheet" and MARKERS[app] not in text:raise Unavailable("Runtime ODF lost native edit")
        self.s.write("runtime-export-oracle.json",{"path":str(output),"sha256":digest(output),"mimetype":mimetype,
            "independentZipXmlPassed":True,"nativeAcceptance":False})
        observations=list(self.s.children.values())
        converters=[p for p in observations if Path(p["executable"]).name in ("soffice","soffice.bin")]
        if not converters or not all(p["resolvedInsideOwnApp"] for p in converters):
            raise Unavailable("Actual app-driven converter child executable not observed exclusively inside own bundle")
        self.s.report["ownConverterChildObserved"]=True
        self.s.capture("runtime-exported")

    def notition(self):
        self.tab("Save");self.button("Add backup");self.file_dialog(self.fixture)
        self.button("Standalone QA");self.button("Own Markdown");self.button("Standalone page")
        self.select(["AXTextField"],["Page title"]);self.replace("Standalone edited page")
        self.select(["AXTextArea"],["Markdown text"]);self.append("\n"+MARKERS["notition"],SEEDS["notition"])
        self.tab("Save");self.button("Save now");time.sleep(0.6)
        export=self.s.root/"notes-export.openaec-notities"
        self.button("Save backup");self.file_dialog(export,save=True)
        result=verify("notition",export)
        if result["page"]["titel"]!="Standalone edited page":raise Unavailable("Native page title did not survive export")
        self.s.write("output-oracle.json",result);self.s.report.update(nativeSaveVerified=True,outputOraclePassed=True)
        old=self.s.quit();self.s.start()
        if self.s.process.pid==old:raise Unavailable("Notes reopen reused old process")
        self.s.report["newPidReopenVerified"]=True
        self.button("Standalone QA");self.button("Own Markdown");self.button("Standalone edited page")
        if not any(MARKERS["notition"] in str(n.get("AXValue","")) for n in attributes(self.s.capture("notes-reopened"))):
            raise Unavailable("Native notes did not persist without reimport")

    def database(self):
        # Normal supported SQLite UI route; no direct WerkkopieClient/backend setup.
        before=digest(self.fixture)
        self.button("Open database");self.file_dialog(self.fixture)
        self.button("Open anyway")
        self.button("standalone_data")
        snap=self.s.capture("database-table")
        for value in (SEEDS["database"],CONTROL,"beta"):
            if not any(value in str(n.get("AXValue",""))+str(n.get("AXTitle",""))+str(n.get("AXDescription","")) for n in attributes(snap)):
                raise Unavailable("Actual UI table is missing expected synthetic row: "+value)
        if digest(self.fixture)!=before:raise Unavailable("Opening the SQLite UI changed the original fixture")
        self.database_query()
        self.tab("Home");self.button("Save")
        output=self.s.root/"database-export.sqlite";self.file_dialog(output,save=True)
        self.s.write("output-oracle.json",verify("database",output))
        if digest(self.fixture)!=before:raise Unavailable("Original SQLite file changed during read/query/export")
        self.s.report.update(nativeSaveVerified=True,outputOraclePassed=True)
        old=self.s.quit();self.s.start()
        if self.s.process.pid==old:raise Unavailable("Database reopened in same process")
        self.s.report["newPidReopenVerified"]=True
        self.button("Open database");self.file_dialog(output)
        self.button("standalone_data");self.database_query();self.s.capture("database-reopened")
        self.s.write("reopened-oracle.json",verify("database",output))

    def database_query(self):
        self.tab("Create");self.button("Query")
        self.select(["AXTextArea"],["Access-SQL"])
        self.replace("SELECT SUM(amount) AS qa_total FROM standalone_data;")
        self.button("Run")
        time.sleep(0.8);snapshot=self.s.capture("query-result")
        if not any(str(n.get("AXValue",""))=="60" or str(n.get("AXTitle",""))=="60" for n in attributes(snapshot)):
            raise Unavailable("Native SELECT aggregate result 60 is not visible")

    def email(self,server):
        # Own fake account is entered through the real wizard, never backend injection.
        self.button("Add account")
        checkbox=[n for n in attributes(self.s.ax("snapshot")) if n.get("AXRole")=="AXCheckBox"
                  and n.get("AXDescription",n.get("AXTitle"))=="Also consult the Thunderbird database"]
        if len(checkbox)!=1:raise Unavailable("ISPDB checkbox state cannot be identified before synthetic account entry")
        if str(checkbox[0].get("AXValue")) in ("1","True","true"):
            self.select(["AXCheckBox"],["Also consult the Thunderbird database"],action="press")
        for label,value in (("Your full name","Standalone QA"),("Email address",USER),("Password",PASSWORD)):
            self.select(["AXTextField"],[label]);self.replace(value)
        # Wait for the genuine wizard to render manual server fields after .invalid discovery.
        deadline=time.monotonic()+20
        while True:
            try:self.select(["AXTextField"],["IMAP server"]);break
            except Unavailable:
                if time.monotonic()>=deadline:raise
                time.sleep(0.5)
        for protocol,port in (("IMAP",server.imap_port),("SMTP",server.smtp_port)):
            for label,value in ((protocol+" server","127.0.0.1"),(protocol+" username",USER)):
                self.select(["AXTextField"],[label]);self.replace(value)
            self.select(["AXPopUpButton"],[protocol+" security"],action="press")
            self.s.ax("key","end");self.s.ax("key","return")
            nodes=attributes(self.s.ax("snapshot"))
            selected=[n for n in nodes if n.get("AXRole")=="AXPopUpButton" and n.get("AXDescription")==protocol+" security"]
            if len(selected)!=1 or selected[0].get("AXValue")!="None":raise Unavailable("Native loopback security selection not verified")
            self.select(["AXTextField"],[protocol+" port"]);self.replace(str(port))
        self.button("Done","Save anyway");time.sleep(1)
        self.button("New")
        self.select(["AXTextField","AXComboBox"],["To"]);self.replace("fixture@example.invalid");self.s.ax("key","tab")
        self.select(["AXTextField"],["Subject"]);self.replace(SEEDS["email"])
        self.select(["AXTextArea"],["Message text"]);self.replace(SEEDS["email"]+"\n"+CONTROL+"\n"+MARKERS["email"])
        self.button("Draft");time.sleep(0.8)
        captured=list(server.directory.glob("draft-*.eml"))
        if len(captured)!=1:raise Unavailable("Native draft save did not APPEND exactly one synthetic MIME message")
        self.s.write("output-oracle.json",verify("email",captured[0]))
        self.s.report.update(nativeSaveVerified=True,outputOraclePassed=True)
        old=self.s.quit();self.s.start()
        if self.s.process.pid==old:raise Unavailable("Mail reopen reused old process")
        self.s.report["newPidReopenVerified"]=True
        self.select(["AXRow","AXButton","AXStaticText"],["Drafts"])
        self.select(["AXRow","AXButton","AXStaticText"],[SEEDS["email"]])
        snapshot=self.s.capture("draft-reopened")
        if not any(MARKERS["email"] in str(n.get("AXValue",""))+str(n.get("AXDescription","")) for n in attributes(snapshot)):
            raise Unavailable("Persisted synthetic draft body absent from reopened native UI")
        if server.receipt()["smtpDataAttempts"]!=0:raise Unavailable("A send attempt occurred; draft-only acceptance rejected")
