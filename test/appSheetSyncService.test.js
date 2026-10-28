const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBooking, fileReferenceFrom, resolveAppSheetDriveUrl } = require("../services/appSheetSyncService");

test("keeps the Booking_PDF Drive link when importing an AppSheet booking", () => {
    const headers = ["BookingID", "CustomerName", "PickupDate", "ReturnDate", "Booking_PDF"];
    const row = ["f09b7c2b", "คุณ นันทพร", "22/10/2569", "28/10/2569", "https://drive.google.com/file/d/abc123/view"];
    const booking = buildBooking(row, headers, new Map());

    assert.equal(booking.driveUrl, "https://drive.google.com/file/d/abc123/view");
    assert.equal(booking.fileName, "Booking-f09b7c2b.pdf");
});

test("does not create a fake file name when an AppSheet row has no file link", () => {
    const headers = ["BookingID", "CustomerName", "PickupDate", "ReturnDate"];
    const booking = buildBooking(["f09b7c2b", "คุณ นันทพร", "22/10/2569", "28/10/2569"], headers, new Map());

    assert.equal(booking.driveUrl, "");
    assert.equal(booking.fileName, "");
});

test("retains a legacy AppSheet PDF path so sync can resolve it in Drive", () => {
    assert.equal(fileReferenceFrom("Booking_Files/c66b7d3a - customer.pdf"), "Booking_Files/c66b7d3a - customer.pdf");
    assert.equal(fileReferenceFrom("https://drive.google.com/file/d/abc/view"), "");
});

test("resolves a legacy AppSheet filename to a real Drive view link", async () => {
    const calls = [];
    const drive = {
        files: {
            list: async (request) => {
                calls.push(request);
                return { data: { files: [{ name: "c66.pdf", mimeType: "application/pdf", webViewLink: "https://drive.google.com/file/d/real/view" }] } };
            }
        }
    };
    const cache = new Map();
    const link = await resolveAppSheetDriveUrl(drive, "Booking_Files/c66.pdf", cache);
    assert.equal(link, "https://drive.google.com/file/d/real/view");
    assert.equal(calls.length, 1);
    assert.equal(await resolveAppSheetDriveUrl(drive, "Booking_Files/c66.pdf", cache), link);
    assert.equal(calls.length, 1);
});
