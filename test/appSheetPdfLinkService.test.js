const test = require("node:test");
const assert = require("node:assert/strict");
const { columnLetter, driveUrlFrom, findColumn } = require("../services/appSheetPdfLinkService");

test("finds the AppSheet Link column and extracts its Drive URL from notes", () => {
    const headers = ["BookingID", "Notes", "Link"];
    assert.equal(findColumn(headers, ["link"]), 2);
    assert.equal(columnLetter(27), "AB");
    assert.equal(driveUrlFrom("เลขจอง: A | https://drive.google.com/file/d/abc_123/view | สำเร็จ"), "https://drive.google.com/file/d/abc_123/view");
});
