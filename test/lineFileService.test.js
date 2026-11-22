const test = require("node:test");
const assert = require("node:assert/strict");
const { downloadLineFile, lineFileErrorMessage } = require("../services/lineFileService");

test("LINE processing errors have actionable user-facing messages instead of a generic retry alert", () => {
  assert.match(lineFileErrorMessage(new Error("LINE_FILE_DOWNLOAD_UNAUTHORIZED")), /สิทธิ์ดาวน์โหลดจาก LINE/);
  assert.match(lineFileErrorMessage(new Error("LINE_FILE_CONTENT_NOT_PDF")), /ไม่ใช่ PDF/);
  assert.match(lineFileErrorMessage(new Error("UNEXPECTED_INTERNAL_ERROR")), /อย่าส่งซ้ำทันที/);
});

test("LINE file download retries transient failures then returns the complete PDF bytes", async () => {
  let calls = 0;
  const waits = [];
  const result = await downloadLineFile({
    messageId: "line-message/1",
    accessToken: "test-token",
    fileName: "booking.pdf",
    maxBytes: 1024,
    wait: async (ms) => waits.push(ms),
    request: async (config) => {
      calls += 1;
      assert.match(config.url, /line-message%2F1\/content$/);
      if (calls < 3) throw { response: { status: 503 }, message: "temporary" };
      return { data: Buffer.from("%PDF-1.7 sample"), headers: { "content-type": "application/pdf" } };
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(result.attempts, 3);
  assert.equal(result.buffer.toString(), "%PDF-1.7 sample");
});

test("LINE file download does not retry permanent authorization failures", async () => {
  let calls = 0;
  await assert.rejects(
    downloadLineFile({
      messageId: "message",
      accessToken: "test-token",
      maxBytes: 1024,
      request: async () => { calls += 1; throw { response: { status: 401 } }; },
      wait: async () => assert.fail("must not retry a permanent failure"),
    }),
    /LINE_FILE_DOWNLOAD_UNAUTHORIZED/,
  );
  assert.equal(calls, 1);
});

test("LINE file download rejects an invalid PDF body without retrying", async () => {
  let calls = 0;
  await assert.rejects(downloadLineFile({
    messageId: "message",
    accessToken: "test-token",
    fileName: "booking.pdf",
    maxBytes: 1024,
    request: async () => { calls += 1; return { data: Buffer.from("<html>error</html>") }; },
    wait: async () => assert.fail("invalid successful response is not transient"),
  }), /LINE_FILE_CONTENT_NOT_PDF/);
  assert.equal(calls, 1);
});

test("LINE file download reports oversized content clearly without retrying", async () => {
  let calls = 0;
  await assert.rejects(downloadLineFile({
    messageId: "message",
    accessToken: "test-token",
    maxBytes: 5,
    request: async () => { calls += 1; return { data: Buffer.from("%PDF-1.7 larger than cap") }; },
  }), /LINE_FILE_TOO_LARGE/);
  assert.equal(calls, 1);
});
