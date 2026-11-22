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

test("imports Thai send-car and return-car date/time columns instead of leaving booking times blank", () => {
    const headers = ["BookingID", "CustomerName", "วันส่งรถ", "เวลาส่งรถ", "วันคืนรถ", "เวลาคืนรถ"];
    const row = ["f09b7c2b", "คุณ นันทพร", "22/10/2569", "8:30:00 PM", "28/10/2569", "08:30:00 AM"];
    const booking = buildBooking(row, headers, new Map());

    assert.equal(booking.pickupDate, "2026-10-22");
    assert.equal(booking.pickupTime, "20:30");
    assert.equal(booking.returnDate, "2026-10-28");
    assert.equal(booking.returnTime, "08:30");
});

test("rejects impossible and reversed AppSheet schedules rather than storing misleading dates", () => {
    const headers = ["BookingID", "CustomerName", "วันส่งรถ", "เวลาส่งรถ", "วันคืนรถ", "เวลาคืนรถ"];
    const invalidDate = buildBooking(["a", "ลูกค้า", "31/02/2569", "08:30", "01/03/2569", "08:30"], headers, new Map());
    assert.equal(invalidDate.pickupDate, "");
    assert.equal(invalidDate.returnDate, "2026-03-01");

    const reversed = buildBooking(["b", "ลูกค้า", "22/10/2569", "20:30", "22/10/2569", "08:30"], headers, new Map());
    assert.equal(reversed.pickupDate, "");
    assert.equal(reversed.returnDate, "");
    assert.equal(reversed.scheduleIssue, "pickup_after_return");
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
