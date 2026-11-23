import assert from "node:assert/strict";
import test from "node:test";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { mailFixture } from "./standalone-linux-mail-fixture.mjs";

test("synthetic peer accepts fragmented APPEND and serves the unchanged draft after reconnect", async () => {
  const fixture = await mailFixture();
  let socket;
  try {
    async function session() {
      let received = "";
      socket = connect(fixture.port, "127.0.0.1");
      socket.on("data", (b) => (received += b.toString()));
      const response = async (marker) => {
        for (let i = 0; i < 100 && !received.includes(marker); i++)
          await delay(10);
        assert.ok(
          received.includes(marker),
          `Expected protocol response ${marker}: ${received}`,
        );
        const result = received;
        received = "";
        return result;
      };
      await response("Synthetic local QA mailbox");
      socket.write(
        'a1 LOGIN "standalone@example.invalid" "SYNTHETIC-QA-PASSWORD"\r\n',
      );
      await response("a1 OK");
      return response;
    }
    let response = await session();
    socket.write('a2 LIST "" "*"\r\n');
    assert.match(await response("a2 OK"), /\\Drafts/);
    const raw = Buffer.from(
      "From: Synthetic QA <standalone@example.invalid>\r\nTo: nobody@example.invalid\r\nSubject: STANDALONE_SYNTHETIC_DRAFT\r\n\r\nNever sent.\r\n",
    );
    socket.write(`a3 APPEND "Drafts" (\\Draft) {${raw.length}}\r\n`);
    await response("+ send synthetic");
    socket.write(raw.subarray(0, 30));
    socket.write(Buffer.concat([raw.subarray(30), Buffer.from("\r\n")]));
    await response("a3 OK [APPENDUID 7 1]");
    assert.deepEqual(fixture.messages.Drafts[0].raw, raw);
    socket.destroy();
    response = await session();
    socket.write('a4 EXAMINE "Drafts"\r\n');
    assert.match(await response("a4 OK"), /\* 1 EXISTS/);
    socket.write(
      "a5 FETCH 1:1 (UID FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM)])\r\n",
    );
    assert.match(await response("a5 OK"), /STANDALONE_SYNTHETIC_DRAFT/);
    assert.ok(!fixture.commands.some((c) => /SMTP|SEND/.test(c.command)));
    assert.ok(
      !JSON.stringify(fixture.commands).includes("SYNTHETIC-QA-PASSWORD"),
    );
  } finally {
    socket?.destroy();
    await fixture.close();
  }
});
