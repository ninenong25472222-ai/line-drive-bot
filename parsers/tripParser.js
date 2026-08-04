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
const lines = text
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

const detailIndex = lines.findIndex(
    x =>
        x.includes("รายละเอียดรถ") ||
        x.includes("รายละเอียด รถ")
);

if (detailIndex > 0) {

    const names = [];

    for (let i = detailIndex - 1; i >= 0; i--) {

        if (/^[A-Z ]+$/.test(lines[i])) {

            names.unshift(lines[i]);

        } else {

            break;

        }

    }

    booking.customerName = names.join(" ");


    }

    // -----------------------------
    // Vehicle
    // -----------------------------
    const car = text.match(
    /ประเภทรถ\s*([\s\S]*?)ระบบเกียร์/i
);

if (car) {

    booking.car = car[1]
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .replace(/หรือรุ่นที.*/i, "")
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
    // -----------------------------
// Phone
// -----------------------------
const phone = text.match(
    /\+66\d+|0\d{9}/
);

if(phone){

    booking.customerPhone = phone[0];

}

    return booking;

}

module.exports = parseTrip;