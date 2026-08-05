const Booking = require("../models/booking");

function parseKlook(text) {

    text = text.replace(/\r/g, "");

    const booking = Booking();

    booking.company = "Klook";
    booking.rawText = text;

    // -----------------------------
    // Booking No.
    // -----------------------------
    booking.bookingNo =
        text.match(/\b[A-Z]{3}\d{6}\b/)?.[0] || "";

    // -----------------------------
    // Email (เอาอีเมลลูกค้า ไม่ใช่ operator@klook.com)
    // -----------------------------
    const emails =
        [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)]
        .map(x => x[0]);

    booking.customerEmail =
        emails.find(e =>
            !e.includes("klook.com") &&
            !e.includes("chiccarrent.com")
        ) || "";

    // -----------------------------
    // Phone
    // -----------------------------
    booking.customerPhone =
        text.match(/66-\d{10}|\+66-\d{9,10}|0\d{9}/)?.[0] || "";

    // -----------------------------
    // Customer
    // -----------------------------
    const lines = text.split("\n").map(x => x.trim());

    const emailIndex =
        lines.findIndex(x => x === booking.email);

    if (emailIndex > 1) {

        booking.customerName =
            lines[emailIndex - 2];

    }

    // -----------------------------
    // Pickup
    // -----------------------------
    const pickup =
        text.match(/Chic Network -[^\n]+\nT\d+\n(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);

    if (pickup) {

        booking.pickupLocation =
            pickup[0].split("\n")[0];

        booking.pickupDate =
            pickup[1];

        booking.pickupTime =
            pickup[2];

    }

    // -----------------------------
    // Return
    // -----------------------------
    const returns =
        [...text.matchAll(/Chic Network -[^\n]+\nT\d+\n(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/g)];

    if (returns.length >= 2) {

        booking.returnLocation =
            returns[1][0].split("\n")[0];

        booking.returnDate =
            returns[1][1];

        booking.returnTime =
            returns[1][2];

    }

    // -----------------------------
    // Vehicle
    // -----------------------------
    booking.car =
        text.match(/HDAV_[^\n]+/)?.[0] || "";


    console.log("===== BOOKING =====");
    console.log(booking);
    console.log("===================");

    return booking;
}

module.exports = parseKlook;