const Booking = require("../models/booking");

function parseTrip(text) {
    // -----------------------
    // Normalize PDF Text
    // -----------------------
    text = text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n");

    const booking = Booking();

    booking.company = "Trip";
    booking.rawText = text;

    // -----------------------------
    // Booking Number
    // -----------------------------
    const bookingNo = text.match(
        /หมายเลขการจอง[:\s]*([A-Z0-9]+)/i
    );

    if (bookingNo) {
        booking.bookingNo = bookingNo[1].trim();
    }

    // -----------------------------
    // Customer Name
    // -----------------------------
    const customer = text.match(
        /ผู้ขับขี่หลัก\s*([\s\S]*?)รายละเอีย/i
    );

    if (customer) {

        booking.customerName = customer[1]
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    }

    // -----------------------------
    // Vehicle
    // -----------------------------
    const car = text.match(
        /รายละเอียดรถ[\s\S]*?ประเภทรถ\s*([\s\S]*?)ระบบเกียร์/i
    );

    if (car) {

        booking.car = car[1]
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    }

    // -----------------------------
    // Total Amount
    // -----------------------------
    const total = text.match(
        /ทั้งหมด\s*THB\s*([\d,.]+)/i
    );

    if (total) {

        booking.amount = total[1].replace(/,/g, "");
        booking.currency = "THB";

    }

    // -----------------------------
    // Pickup
    // -----------------------------
    const pickup = text.match(
        /จุดรับรถ[\s\S]*?\n([^\n]+)\n\s*(\d{1,2}\s+\S+\s+\d{4})\s+(\d{2}:\d{2})/i
    );

    if (pickup) {

        booking.pickupLocation = pickup[1].trim();
        booking.pickupDate = pickup[2].trim();
        booking.pickupTime = pickup[3].trim();

    }

    // -----------------------------
    // Return
    // -----------------------------
    const dropoff = text.match(
        /จุดคืนรถ[\s\S]*?\n([^\n]+)\n\s*(\d{1,2}\s+\S+\s+\d{4})\s+(\d{2}:\d{2})/i
    );

    if (dropoff) {

        booking.returnLocation = dropoff[1].trim();
        booking.returnDate = dropoff[2].trim();
        booking.returnTime = dropoff[3].trim();

    }

    // -----------------------------
    // Email (ไม่มีใน PDF)
    // -----------------------------
    booking.customerEmail = "";

    // -----------------------------
    // Phone (ไม่มีใน PDF)
    // -----------------------------
    booking.customerPhone = "";

    return booking;

}

module.exports = parseTrip;