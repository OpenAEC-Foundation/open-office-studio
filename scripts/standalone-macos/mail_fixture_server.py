"""Loopback-only synthetic IMAP and SMTP sink. Never relay mail or use secrets."""
from pathlib import Path
import re
import socketserver
import threading

USER="qa@example.invalid"
PASSWORD="synthetic-local-only"
CAPS="IMAP4rev1 UIDPLUS SPECIAL-USE LITERAL+ UNSELECT"


def words(raw):
    return [s[1:-1].replace('\\"','"').replace('\\\\','\\') if s.startswith('"') else s
            for s in re.findall(r'"(?:[^"\\]|\\.)*"|\([^)]*\)|[^ ]+',raw)]


def in_set(spec,number,maximum):
    def num(x):return maximum if x=="*" else int(x)
    try:
        for part in spec.split(","):
            pair=part.split(":");a=num(pair[0]);b=num(pair[-1])
            if min(a,b)<=number<=max(a,b):return True
    except ValueError:return False
    return False


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address=False
    daemon_threads=True


class Imap(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(15);state=self.server.fixture;selected=None;authenticated=False
        def send(data):self.wfile.write(data.encode() if isinstance(data,str) else data);self.wfile.flush()
        send("* OK [CAPABILITY IMAP4rev1] Standalone synthetic loopback\r\n")
        while True:
            line=self.rfile.readline(65537)
            if not line:return
            if len(line)>65536:return
            text=line.decode("utf-8",errors="strict").rstrip("\r\n")
            parts=text.split(" ",2)
            if len(parts)<2:return
            tag,command=parts[:2];args=parts[2] if len(parts)>2 else "";command=command.upper()
            uid_mode=command=="UID"
            if uid_mode:
                command,_,args=args.partition(" ");command=command.upper()
            literal=b"";literal_match=re.search(r"\{(\d+)(\+)?\}$",args)
            if literal_match:
                length=int(literal_match[1])
                if length>2*1024*1024:send(tag+" NO synthetic size limit\r\n");return
                if not literal_match[2]:send("+ Ready for synthetic literal\r\n")
                literal=self.rfile.read(length)
                if len(literal)!=length:return
                if self.rfile.read(2)!=b"\r\n":return
            tokens=words(args)
            with state.lock:
                # No password or AUTH payload enters receipts.
                state.commands.append(("UID " if uid_mode else "")+command)
                ok=tag+" OK completed\r\n";response="";raw=b""
                if command=="CAPABILITY":response="* CAPABILITY "+CAPS+"\r\n"+ok
                elif command=="LOGIN":
                    authenticated=tokens==[USER,PASSWORD]
                    response=ok if authenticated else tag+" NO [AUTHENTICATIONFAILED] synthetic credentials only\r\n"
                elif command=="LOGOUT":send("* BYE synthetic session ended\r\n"+ok);return
                elif not authenticated:response=tag+" NO authenticate first\r\n"
                elif command in ("NOOP","CHECK","SUBSCRIBE"):response=ok
                elif command=="LIST":
                    for name,flag in (("INBOX",""),("Drafts","\\Drafts"),("Sent","\\Sent"),("Trash","\\Trash")):
                        response+='* LIST (\\HasNoChildren '+flag+') "/" "'+name+'"\r\n'
                    response+=ok
                elif command=="STATUS" and tokens[0] in state.boxes:
                    response='* STATUS "'+tokens[0]+'" (MESSAGES '+str(len(state.boxes[tokens[0]]))+" UNSEEN 0)\r\n"+ok
                elif command in ("SELECT","EXAMINE") and tokens[0] in state.boxes:
                    selected=tokens[0]
                    response=("* "+str(len(state.boxes[selected]))+" EXISTS\r\n* 0 RECENT\r\n"
                              "* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)\r\n"
                              "* OK [UIDVALIDITY 7] synthetic\r\n* OK [UIDNEXT "+str(state.next_uid)+"] next\r\n"
                              +tag+" OK [READ-WRITE] selected\r\n")
                elif command=="UNSELECT":selected=None;response=ok
                elif command=="APPEND" and tokens[0]=="Drafts" and literal:
                    uid=state.next_uid;state.next_uid+=1
                    state.boxes["Drafts"].append({"uid":uid,"body":literal,"flags":["\\Draft"]})
                    (state.directory/("draft-"+str(uid)+".eml")).write_bytes(literal)
                    response=tag+" OK [APPENDUID 7 "+str(uid)+"] synthetic draft captured\r\n"
                elif command=="SEARCH" and selected:
                    ids=[str(m["uid"] if uid_mode else i+1) for i,m in enumerate(state.boxes[selected]) if "\\Deleted" not in m["flags"]]
                    response="* SEARCH "+" ".join(ids)+"\r\n"+ok
                elif command=="FETCH" and selected:
                    messages=state.boxes[selected];maximum=max((m["uid"] for m in messages),default=0) if uid_mode else len(messages)
                    for i,m in enumerate(messages):
                        if not in_set(tokens[0],m["uid"] if uid_mode else i+1,maximum):continue
                        fields=["UID "+str(m["uid"])]
                        if "FLAGS" in args.upper():fields.append("FLAGS ("+" ".join(m["flags"])+")")
                        if "RFC822.SIZE" in args.upper():fields.append("RFC822.SIZE "+str(len(m["body"])))
                        if "INTERNALDATE" in args.upper():fields.append('INTERNALDATE "23-Nov-2026 08:00:00 +0000"')
                        raw+=("* "+str(i+1)+" FETCH ("+" ".join(fields)).encode()
                        if "BODY" in args.upper() or "RFC822)" in args.upper():
                            header="HEADER.FIELDS" in args.upper();body=m["body"].split(b"\r\n\r\n",1)[0]+b"\r\n\r\n" if header else m["body"]
                            section="BODY[HEADER]" if header else "BODY[]"
                            raw+=(" "+section+" {"+str(len(body))+"}\r\n").encode()+body
                        raw+=b")\r\n"
                    raw+=ok.encode()
                elif command=="STORE" and selected:
                    for i,m in enumerate(state.boxes[selected]):
                        if in_set(tokens[0],m["uid"] if uid_mode else i+1,state.next_uid-1):
                            flags=tokens[-1].strip("()").split()
                            if tokens[1].startswith("+"):m["flags"]=list(set(m["flags"]+flags))
                            elif tokens[1].startswith("-"):m["flags"]=[f for f in m["flags"] if f not in flags]
                            else:m["flags"]=flags
                    response=ok
                elif command in ("EXPUNGE","CLOSE") and selected:
                    state.boxes[selected]=[m for m in state.boxes[selected] if "\\Deleted" not in m["flags"]];response=ok
                else:response=tag+" BAD unsupported synthetic command\r\n"
                send(raw or response)


class Smtp(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(10);state=self.server.fixture
        self.wfile.write(b"220 localhost synthetic no-relay SMTP\r\n");self.wfile.flush()
        while line:=self.rfile.readline(4096):
            command=line.split(b" ",1)[0].strip().upper()
            with state.lock:state.smtp_commands.append(command.decode("ascii",errors="replace"))
            if command in (b"EHLO",b"HELO"):reply=b"250-localhost\r\n250 AUTH PLAIN\r\n"
            elif command==b"AUTH":reply=b"235 synthetic authentication only\r\n"
            elif command==b"DATA":
                with state.lock:state.data_attempts+=1
                reply=b"554 Synthetic QA prohibits sending mail\r\n"
            elif command==b"QUIT":self.wfile.write(b"221 bye\r\n");self.wfile.flush();return
            elif command in (b"NOOP",b"RSET"):reply=b"250 OK\r\n"
            else:reply=b"554 Synthetic QA is not a mail relay\r\n"
            self.wfile.write(reply);self.wfile.flush()


class Fixture:
    def __init__(self,directory,seed):
        self.directory=Path(directory);self.directory.mkdir(exist_ok=False)
        self.lock=threading.Lock();self.next_uid=2;self.commands=[];self.smtp_commands=[];self.data_attempts=0
        self.boxes={"INBOX":[{"uid":1,"body":Path(seed).read_bytes(),"flags":[]}],"Drafts":[],"Sent":[],"Trash":[]}
        self.servers=[];self.threads=[]

    def __enter__(self):
        for handler in (Imap,Smtp):
            server=Server(("127.0.0.1",0),handler);server.fixture=self
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            self.servers.append(server);self.threads.append(thread)
        self.imap_port,self.smtp_port=[s.server_address[1] for s in self.servers]
        return self

    def receipt(self):
        with self.lock:
            return {"host":"127.0.0.1","imapPort":self.imap_port,"smtpPort":self.smtp_port,
                    "imapCommands":self.commands.copy(),"smtpCommands":self.smtp_commands.copy(),
                    "smtpDataAttempts":self.data_attempts,"relayedMessages":0,
                    "drafts":[m["uid"] for m in self.boxes["Drafts"]],"nativeAcceptance":False}

    def __exit__(self,*exc):
        for server in self.servers:server.shutdown();server.server_close()
        for thread in self.threads:thread.join(timeout=2)
