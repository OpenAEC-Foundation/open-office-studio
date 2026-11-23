/** Synthetic loopback IMAP test peer, never an application backend replacement.
 * A small subset of the same protocol exercised by src-tauri/src/email/nepserver.rs.
 * SMTP is deliberately absent. Authentication values are public fixture data.
 */
import { createServer } from "node:net";
import assert from "node:assert/strict";

export async function mailFixture() {
  const commands = [],
    sockets = new Set();
  const messages = { INBOX: [], Drafts: [] };
  let uid = 1;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.write("* OK [CAPABILITY IMAP5rev1] Synthetic local QA mailbox\r\n");
    let buffer = Buffer.alloc(0),
      selected = "INBOX",
      append;
    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (true) {
        if (append) {
          if (buffer.length < append.length + 2) return;
          const raw = buffer.subarray(0, append.length);
          buffer = buffer.subarray(append.length + 2);
          messages[append.folder].push({ uid: uid++, raw });
          socket.write(
            `${append.tag} OK [APPENDUID 7 ${uid - 1}] appended\r\n`,
          );
          append = undefined;
          continue;
        }
        const end = buffer.indexOf("\r\n");
        if (end < 0) return;
        const line = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 2);
        const [, tag, uidPrefix, command, args = ""] =
          /^(\S+) (UID )?(\S+)(?: (.*))?$/.exec(line) || [];
        if (!tag) {
          socket.destroy();
          return;
        }
        const cmd = command.toUpperCase(),
          words = args.match(/"(?:[^"\\]|\\.)*"|\S+/g) || [];
        const unquote = (s) => s?.replace(/^"|"$/g, "");
        // Never log even the synthetic password: match production logging discipline.
        commands.push({
          command: `${uidPrefix || ""}${cmd}`,
          args: cmd === "LOGIN" ? "<synthetic credentials>" : args,
        });
        let response = "",
          ok = `${tag} OK completed\r\n`;
        if (cmd === "LOGIN") {
          assert.equal(unquote(words[0]), "standalone@example.invalid");
          assert.equal(unquote(words[1]), "SYNTHETIC-QA-PASSWORD");
        } else if (cmd === "CAPABILITY")
          response = "* CAPABILITY IMAP5rev1 UIDPLUS SPECIAL-USE UNSELECT\r\n";
        else if (cmd === "LIST")
          response =
            '* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\HasNoChildren \\Drafts) "/" "Drafts"\r\n';
        else if (cmd === "STATUS") {
          const folder = unquote(words[0]);
          response = `* STATUS "${folder}" (MESSAGES ${messages[folder]?.length || 0} UNSEEN ${messages[folder]?.length || 0})\r\n`;
        } else if (cmd === "SELECT" || cmd === "EXAMINE") {
          selected = unquote(words[0]);
          assert.ok(messages[selected], `Unknown fixture folder ${selected}`);
          response = `* ${messages[selected].length} EXISTS\r\n* 0 RECENT\r\n* FLAGS (\\Seen \\Draft)\r\n* OK [UIDVALIDITY 7] stable\r\n* OK [UIDNEXT ${uid}] next\r\n`;
          ok = `${tag} OK [READ-WRITE] selected\r\n`;
        } else if (cmd === "APPEND") {
          const folder = unquote(words[0]),
            literal = /\{(\d+)\}$/.exec(args);
          assert.ok(
            messages[folder] && literal,
            "Only known literal APPEND allowed",
          );
          append = { tag, folder, length: Number(literal[1]) };
          socket.write("+ send synthetic message\r\n");
          continue;
        } else if (cmd === "SEARCH")
          response = `* SEARCH ${messages[selected].map((m) => m.uid).join(" ")}\r\n`;
        else if (cmd === "FETCH") {
          const set = words[0];
          for (const [i, message] of messages[selected].entries()) {
            const wanted = uidPrefix ? message.uid : i + 1;
            if (!set.includes(":") && Number(set) !== wanted) continue;
            const header = /HEADER/i.test(args);
            const data = header
              ? message.raw.subarray(0, message.raw.indexOf("\r\n\r\n") + 4)
              : message.raw;
            const section = header ? "HEADER" : "";
            if (/BODY/i.test(args)) {
              socket.write(
                `* ${i + 1} FETCH (UID ${message.uid} FLAGS (\\Draft) RFC822.SIZE ${message.raw.length} BODY[${section}] {${data.length}}\r\n`,
              );
              socket.write(data);
              socket.write(")\r\n");
            } else
              response += `* ${i + 1} FETCH (UID ${message.uid} FLAGS (\\Draft) RFC822.SIZE ${message.raw.length})\r\n`;
          }
        } else if (cmd === "LOGOUT")
          response = "* BYE local fixture closed\r\n";
        else if (
          ![
            "NOOP",
            "UNSELECT",
            "CLOSE",
            "CHECK",
            "STORE",
            "SUBSCRIBE",
          ].includes(cmd)
        ) {
          socket.write(`${tag} BAD unsupported fixture command\r\n`);
          continue;
        }
        socket.write(response + ok);
        if (cmd === "LOGOUT") socket.end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    messages,
    commands,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
