const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { readBookingPdfFromDrive, driveIdFromUrl } = require("../services/driveBookingReader");

const id = "11111111-1111-4111-8111-111111111111";

test("reads a real PDF through Google Drive auth after checking the admin PIN", async () => {
  let fileIdSeen = "";
  let tokenSeen = "";
  const result = await readBookingPdfFromDrive({
    id, token: "pin", drive: { files: { async get(params) { fileIdSeen = params.fileId; return { data: Readable.from([Buffer.from("%PDF-1.7 example")]) }; } } },
    supabaseUrl: "https://db.example/", anonKey: "sb_publishable_demo",
    fetchImpl: async (url, init) => {
      assert.equal(url, `https://db.example/functions/v1/rental-admin/bookings/${id}/file`);
      tokenSeen = init.headers["x-booking-edit-token"];
      return Response.json({ url: "https://drive.google.com/file/d/driveFile_123456789/view", file_name: "booking.pdf" });
    },
    readDocument: async (pdf) => {
      assert.equal(pdf.toString("ascii"), "%PDF-1.7 example");
      return { booking: { company: "Trip", pickupDate: "2026-11-21", pickupTime: "09:30", returnDate: "2026-11-23", returnTime: "10:00" }, usedOcrFallback: true };
    },
  });
  assert.equal(fileIdSeen, "driveFile_123456789");
  assert.equal(tokenSeen, "pin");
  assert.deepEqual(result, { pickup_date: "2026-11-21", pickup_time: "09:30", return_date: "2026-11-23", return_time: "10:00", company: "Trip", foundCount: 4, usedOcrFallback: true, ocrFailed: false });
});

test("reader propagates PIN errors without downloading from Drive", async () => {
  let downloaded = false;
  await assert.rejects(readBookingPdfFromDrive({
    id, token: "bad", drive: { files: { async get() { downloaded = true; } } }, supabaseUrl: "https://db.example", anonKey: "anon",
    fetchImpl: async () => Response.json({ error: "รหัสผู้ดูแลไม่ถูกต้อง" }, { status: 403 }),
  }), (error) => error.status === 403 && /รหัสผู้ดูแล/.test(error.message));
  assert.equal(downloaded, false);
});

test("reader rejects non-PDF payloads and unsafe file links", async () => {
  const base = { id, token: "pin", drive: { files: { async get() { return { data: Readable.from([Buffer.from("not a PDF")]) }; } } }, supabaseUrl: "https://db.example", anonKey: "anon", fetchImpl: async () => Response.json({ url: "https://drive.google.com/open?id=driveFile_123456789" }) };
  await assert.rejects(readBookingPdfFromDrive(base), (error) => error.status === 422 && /ไม่ใช่ PDF/.test(error.message));
  assert.equal(driveIdFromUrl("http://drive.google.com/file/d/driveFile_123456789/view"), "");
  assert.equal(driveIdFromUrl("https://attacker.example/file/d/driveFile_123456789/view"), "");
});

test("reader falls back to public Drive download when OAuth lookup returns 404", async () => {
  let fetchCalls = 0;
  const pdf = Buffer.from("%PDF-1.7 public link fallback");
  const result = await readBookingPdfFromDrive({
    id, token: "pin", drive: { files: { async get() { throw { code: 404, message: "File not found" }; } } },
    supabaseUrl: "https://db.example", anonKey: "anon",
    fetchImpl: async (url) => {
      fetchCalls += 1;
      if (url.includes("/functions/v1/")) return Response.json({ url: "https://drive.google.com/file/d/driveFile_123456789/view" });
      if (url.startsWith("https://drive.usercontent.google.com/")) return new Response(pdf, { status: 200, headers: { "content-type": "application/pdf" } });
      return new Response("not found", { status: 404 });
    },
    readDocument: async (buffer) => {
      assert.deepEqual(buffer, pdf);
      return { booking: { pickupDate: "2026-11-21", pickupTime: "09:30", returnDate: "2026-11-23", returnTime: "10:00" } };
    },
  });
  assert.equal(fetchCalls, 2);
  assert.equal(result.foundCount, 4);
});

test("reader clearly identifies a missing or inaccessible Drive file after both download paths fail", async () => {
  await assert.rejects(readBookingPdfFromDrive({
    id, token: "pin", drive: { files: { async get() { throw { code: 404, message: "File not found" }; } } },
    supabaseUrl: "https://db.example", anonKey: "anon",
    fetchImpl: async (url) => url.includes("/functions/v1/")
      ? Response.json({ url: "https://drive.google.com/file/d/driveFile_123456789/view" })
      : new Response("not found", { status: 404 }),
  }), (error) => error.status === 404 && /ไม่พบไฟล์ต้นฉบับ/.test(error.message));
});

test("reader refuses to apply an impossible pickup/return order", async () => {
  await assert.rejects(readBookingPdfFromDrive({
    id, token: "pin", drive: { files: { async get() { return { data: Readable.from([Buffer.from("%PDF-1.7 example")]) }; } } },
    supabaseUrl: "https://db.example", anonKey: "anon",
    fetchImpl: async () => Response.json({ url: "https://drive.google.com/file/d/driveFile_123456789/view" }),
    readDocument: async () => ({ scheduleIssue: "pickup_after_return", booking: {} }),
  }), (error) => error.status === 422 && /ไม่เรียงกัน/.test(error.message));
});
