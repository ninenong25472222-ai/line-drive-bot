const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

function dashboardDateParser() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  const start = source.indexOf("var pad =");
  const end = source.indexOf("function ptime");
  return vm.runInNewContext(`${source.slice(start, end)}; pdate;`);
}

test("Dashboard recognizes Thai dates from Trip booking files", () => {
  const pdate = dashboardDateParser();
  assert.equal(pdate("23 ต.ค. 2026"), "2026-10-23");
  assert.equal(pdate("6 ส . ค . 2026"), "2026-08-06");
  assert.equal(pdate("23/10/2569"), "2026-10-23");
});
