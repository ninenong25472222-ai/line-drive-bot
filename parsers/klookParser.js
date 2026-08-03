const Booking = require("../models/booking");

function parseKlook(text) {

    const booking = Booking();

    booking.company = "Klook";
    booking.rawText = text;

    const lines = text
        .split("\n")
        .map(x => x.trim())
        .filter(x => x.length > 0);

    // -------------------------
    // Booking No
    // -------------------------
    const bookingLine = lines.find(x => /^[A-Z]{3}\d{6}$/.test(x));

    if (bookingLine) {
        booking.bookingNo = bookingLine;
    }

    // -------------------------
    // Customer Email
    // -------------------------
    const email = lines.find(x =>
        x.includes("@") &&
        !x.includes("operator@klook.com") &&
        !x.includes("merchant@klook.com") &&
        !x.includes("reservations.c@") &&
        !x.includes("reservations@")
    );

    if (email) {
        booking.email = email;
    }

    // -------------------------
    // Phone
    // -------------------------
    const phone = lines.find(x =>
        /^(\+?\d{2,4}[- ]?)?\d{8,12}$/.test(x.replace(/-/g, ""))
        || /^\d{2}-\d{10}$/.test(x)
        || /^\d{2}-\d{9}$/.test(x)
    );

    if (phone) {
        booking.phone = phone;
    }

    // -------------------------
    // Customer Name
    // -------------------------
    const nameIndex = lines.findIndex(x => x === booking.phone);

    if (nameIndex > 0) {

        const name = lines[nameIndex - 2];

        if (
            name &&
            !name.includes("2026") &&
            !name.includes("@")
        ) {
            booking.renter = name;
        }

    }

    // -------------------------
    // Dates
    // -------------------------
    const dates = [];

    for (const line of lines) {

        const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);

        if (m) {
            dates.push({
                date: m[1],
                time: m[2]
            });
        }

    }

    if (dates.length >= 3) {

        booking.pickupDate = dates[1].date;
        booking.pickupTime = dates[1].time;

        booking.returnDate = dates[2].date;
        booking.returnTime = dates[2].time;

    }

    // -------------------------
    // Locations
    // -------------------------
    const locations = lines.filter(x =>
        x.startsWith("Chic Network")
    );

    if (locations.length >= 2) {

        booking.pickupLocation = locations[0];
        booking.returnLocation = locations[1];

    }

    // -------------------------
    // Car
    // -------------------------
    const car = lines.find(x =>
        x.includes("Toyota") ||
        x.includes("Honda") ||
        x.includes("Nissan") ||
        x.includes("Ativ") ||
        x.includes("Yaris")
    );

    if (car) {
        booking.car = car;
    }

    // -------------------------
    // Amount
    // -------------------------
    const amount = lines.find(x =>
        /^[\d,.]+\s*THB$/.test(x)
    );

    if (amount) {

        booking.amount =
            amount.replace("THB", "").trim();

        booking.currency = "THB";

    }

    return booking;

}

module.exports = parseKlook;