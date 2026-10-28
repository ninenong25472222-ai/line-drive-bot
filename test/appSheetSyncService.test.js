const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBooking } = require("../services/appSheetSyncService");

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
