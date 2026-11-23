"""Synthetic loopback IMAP only; never a real account/server. SMTP rejects DATA."""
import email
from email import policy
import json
from pathlib import Path
import re
import socketserver
import sys
import threading

root=Path(sys.argv[1]); root.mkdir()
lock=threading.Lock()
seed=(b'From: Fixture <fixture@localhost>\r\nTo: QA <qa@localhost>\r\nSubject: STANDALONE23 LOCAL MESSAGE\r\n'
      b'Date: Mon, 23 Nov 2026 08:00:00 +0000\r\nMessage-ID: <standalone23@localhost>\r\n'
      b'Content-Type: text/plain; charset=utf-8\r\n\r\nSTANDALONE23 LOCAL BODY\r\n')
mailboxes={'INBOX':[dict(uid=1,body=seed,flags='')],'Drafts':[],'Sent':[],'Trash':[]}
state={'imapCommands':[],'appendCount':0,'smtpDataRejected':0,'loopbackOnly':True}
counter=2

def words(value):
    return [a if a else b for a,b in re.findall(r'"((?:[^"\\]|\\.)*)"|([^\s]+)',value)]

class Imap(socketserver.StreamRequestHandler):
    def handle(self):
        global counter
        selected='INBOX'
        self.wfile.write(b'* OK [CAPABILITY IMAP4rev1 UIDPLUS SPECIAL-USE] standalone synthetic fixture\r\n')
        while True:
            raw=self.rfile.readline(1024*1024)
            if not raw: break
            line=raw.decode('utf-8').strip(); parts=line.split(' ',2)
            if len(parts)<2: break
            tag,command=parts[:2]; args=parts[2] if len(parts)>2 else ''; command=command.upper()
            if command=='UID': command,_,args=args.partition(' '); command=command.upper()
            with lock: state['imapCommands'].append(command)
            ok=f'{tag} OK done\r\n'.encode()
            if command=='CAPABILITY': self.wfile.write(b'* CAPABILITY IMAP4rev1 UIDPLUS SPECIAL-USE\r\n'+ok)
            elif command in ('LOGIN','NOOP','CHECK','SUBSCRIBE','UNSELECT','CLOSE','ID'): self.wfile.write(ok)
            elif command=='LOGOUT': self.wfile.write(b'* BYE closed\r\n'+ok); break
            elif command in ('LIST','LSUB'):
                for name in mailboxes:
                    flag={'Drafts':'\\Drafts','Sent':'\\Sent','Trash':'\\Trash'}.get(name,'')
                    self.wfile.write(f'* LIST (\\HasNoChildren {flag}) "/" "{name}"\r\n'.encode())
                self.wfile.write(ok)
            elif command=='STATUS':
                name=words(args)[0]; messages=mailboxes.get(name,[])
                self.wfile.write(f'* STATUS "{name}" (MESSAGES {len(messages)} UNSEEN {len(messages)})\r\n'.encode()+ok)
            elif command in ('SELECT','EXAMINE'):
                selected=words(args)[0]
                if selected not in mailboxes: self.wfile.write(f'{tag} NO unknown mailbox\r\n'.encode()); continue
                self.wfile.write((f'* {len(mailboxes[selected])} EXISTS\r\n* 0 RECENT\r\n* FLAGS (\\Seen \\Draft \\Deleted)\r\n'
                                  f'* OK [UIDVALIDITY 23] valid\r\n* OK [UIDNEXT {counter}] next\r\n{tag} OK [READ-WRITE] selected\r\n').encode())
            elif command=='SEARCH':
                self.wfile.write(('* SEARCH '+' '.join(str(m['uid']) for m in mailboxes[selected])+'\r\n').encode()+ok)
            elif command=='APPEND':
                match=re.search(r'\{(\d+)(\+)?\}$',args); assert match and int(match[1])<1024*1024
                if not match[2]: self.wfile.write(b'+ ready for literal\r\n'); self.wfile.flush()
                body=self.rfile.read(int(match[1])); self.rfile.readline()
                name=words(args)[0]; assert name in mailboxes
                with lock:
                    uid=counter; counter+=1
                    mailboxes[name].append(dict(uid=uid,body=body,flags='\\Draft'))
                    state['appendCount']+=1
                    (root/f'append-{uid}.eml').write_bytes(body)
                self.wfile.write(f'{tag} OK [APPENDUID 23 {uid}] appended\r\n'.encode())
            elif command=='FETCH':
                message_set=args.split(' ',1)[0]
                for sequence,message in enumerate(mailboxes[selected],1):
                    if ':' not in message_set and message_set not in ('*',str(message['uid']),str(sequence)): continue
                    body=message['body']; attributes=f'UID {message["uid"]} FLAGS ({message["flags"]}) RFC822.SIZE {len(body)}'
                    if 'BODY' in args.upper() or 'RFC822)' in args.upper():
                        if 'HEADER' in args.upper():
                            body=body.split(b'\r\n\r\n',1)[0]+b'\r\n\r\n'
                            field=re.search(r'BODY(?:\.PEEK)?\[(HEADER[^\]]*)\]',args,re.I)
                            section=field[1] if field else 'HEADER'
                        else: section=''
                        self.wfile.write(f'* {sequence} FETCH ({attributes} BODY[{section}] {{{len(body)}}}\r\n'.encode()+body+b')\r\n')
                    else: self.wfile.write(f'* {sequence} FETCH ({attributes})\r\n'.encode())
                self.wfile.write(ok)
            elif command in ('STORE','EXPUNGE','CREATE'): self.wfile.write(ok)
            else: self.wfile.write(f'{tag} BAD unsupported fixture command {command}\r\n'.encode())
            self.wfile.flush()

class Smtp(socketserver.StreamRequestHandler):
    def handle(self):
        self.wfile.write(b'220 localhost synthetic standalone fixture\r\n')
        while line:=self.rfile.readline(65536):
            verb=line.split(b' ',1)[0].strip().upper()
            if verb in (b'EHLO',b'HELO'): self.wfile.write(b'250-localhost\r\n250 AUTH PLAIN LOGIN\r\n')
            elif verb==b'AUTH': self.wfile.write(b'235 synthetic authentication accepted\r\n')
            elif verb==b'QUIT': self.wfile.write(b'221 closed\r\n'); break
            elif verb==b'DATA':
                state['smtpDataRejected']+=1; self.wfile.write(b'550 sending disabled in QA\r\n')
            else: self.wfile.write(b'250 OK\r\n')
            self.wfile.flush()

class Server(socketserver.ThreadingTCPServer):
    daemon_threads=True
    allow_reuse_address=False

servers=[Server(('127.0.0.1',0),handler) for handler in (Imap,Smtp)]
for server in servers: threading.Thread(target=server.serve_forever,daemon=True).start()
ports=dict(imap=servers[0].server_address[1],smtp=servers[1].server_address[1],host='127.0.0.1')
(root/'ports.json').write_text(json.dumps(ports),encoding='utf-8')
try: sys.stdin.read()
finally:
    for server in servers: server.shutdown(); server.server_close()
    state['serversClosed']=True
    (root/'report.json').write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8')
