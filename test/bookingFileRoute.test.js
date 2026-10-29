const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Cloudflare booking-file route hands valid files to Google Drive", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "functions", "api", "bookings", "[id]", "file.js"), "utf8");
  assert.match(source, /driveFileId\(booking\?\.drive_url\)/);
  assert.match(source, /Response\.redirect\(target, 302\)/);
  assert.match(source, /drive\.google\.com\/uc\?export=download/);
});
