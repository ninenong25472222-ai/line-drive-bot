const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { driveFileIdFromUrl, normalizedDate, reparsedPatch, missing } = require("../netlify/functions/booking");

test("extracts only a Google Drive file id from an attached file URL", () => {
  assert.equal(driveFileIdFromUrl("https://drive.google.com/file/d/1sEgV_DXda9faOGi7mIlt9fhRethahXQH/view"), "1sEgV_DXda9faOGi7mIlt9fhRethahXQH");
  assert.equal(driveFileIdFromUrl("https://example.com/file/d/not-drive"), "");
});

test("normalizes Trip Thai dates before saving", () => {
  assert.equal(normalizedDate("23 ต.ค. 2026"), "2026-10-23");
  assert.equal(normalizedDate("23/10/2569"), "2026-10-23");
});

test("re-reading fills only missing booking fields", () => {
  const result = reparsedPatch(
    { pickup_date: "", pickup_time: "", return_date: "2026-10-24", return_time: "06:30", car: "Manual car" },
    { pickupDate: "23 ต.ค. 2026", pickupTime: "06:30", returnDate: "24 ต.ค. 2026", returnTime: "06:30", car: "Toyota Yaris" },
  );

  assert.deepEqual(result.patch, { pickup_date: "2026-10-23", pickup_time: "06:30" });
});

test("re-reading eligibility treats blank dates as incomplete", () => {
  assert.equal(missing(""), true);
  assert.equal(missing("   "), true);
  assert.equal(missing("2026-10-23"), false);
});

test("public booking-ingestion function cannot be used to rewrite missing dates", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "store-rental-booking", "index.ts"), "utf8");
  assert.match(source, /payload\?\.reparse_only === true\) return respond\(\{ error: "Date re-reading requires administrator authorization" \}, 403\)/);
  assert.doesNotMatch(source, /async function reparseOnly/);
  assert.match(source, /respond\(\{ ok: true, duplicate: true/);
  assert.match(source, /respond\(\{ ok: true, duplicate: false \}\)/);
  assert.doesNotMatch(source, /respond\(\{ booking[,}]/);
});
