const Booking = require("../models/booking");

function parseKlook(text) {

    text = text
        .replace(/\r/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();

    const booking = Booking();

    booking.company = "Klook";
    booking.rawText = text;

    // -----------------------------
    // Booking No.
    // -----------------------------
    const bookingNo = text.match(
        /หมายเลขอ้างอิงการจอง\s*([A-Z0-9]+)/i
    );

    if (bookingNo) {
        booking.bookingNo = bookingNo[1].trim();
    }

    // -----------------------------
    // Customer Name
    // -----------------------------
    const customer = text.match(
        /ชื่อพนักงานขับรถ\s*([^\n]+)/i
    );

    if (customer) {
        booking.customerName = customer[1].trim();
    }

    // -----------------------------
    // Email
    // -----------------------------
    const email = text.match(
        /อีเมล\s*([^\s]+)/i
    );

    if (email) {
        booking.customerEmail = email[1].trim();
    }

    // -----------------------------
    // Phone
    // -----------------------------
    const phone = text.match(
        /หมายเลขโทรศัพท์\s*([+\d-]+)/i
    );

    if (phone) {
        booking.customerPhone = phone[1].trim();
    }

    // -----------------------------
    // Pickup
    // -----------------------------
    const pickupLocation = text.match(
        /สถานที่นัดรับ\s*([^\n]+)/i
    );

    if (pickupLocation) {
        booking.pickupLocation = pickupLocation[1].trim();
    }

    const pickupDate = text.match(
        /เวลานัดรับ\s*(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2})/i
    );

    if (pickupDate) {
        booking.pickupDate = pickupDate[1];
        booking.pickupTime = pickupDate[2];
    }

    // -----------------------------
    // Return
    // -----------------------------
    const returnLocation = text.match(
        /สถานที่ส่งคืน\s*([^\n]+)/i
    );

    if (returnLocation) {
        booking.returnLocation = returnLocation[1].trim();
    }

    const returnDate = text.match(
        /ข้อมูลการส่งกลับ\s*(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2})/i
    );

    if (returnDate) {
        booking.returnDate = returnDate[1];
        booking.returnTime = returnDate[2];
    }

    // -----------------------------
    // Vehicle
    // -----------------------------
    const car = text.match(
        /ยานพาหนะ\s*([^\n]+)/i
    );

    if (car) {
        booking.car = car[1].trim();
    }

    // -----------------------------
    // Amount
    // -----------------------------
    const amount = text.match(
        /จำนวนเงินทั้งหมด\s*([\d,.]+)\s*THB/i
    );

    if (amount) {
        booking.amount = amount[1].replace(/,/g, "");
        booking.currency = "THB";
    }

    return booking;

}

module.exports = parseKlook;