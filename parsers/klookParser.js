const Booking = require("../models/booking");

function find(text, regex) {
    const m = text.match(regex);
    return m ? m[1].trim() : "";
}

function parseKlook(text) {

    const booking = Booking();

    booking.company = "Klook";
    booking.rawText = text;

    // Booking Reference
    booking.bookingNo =
        find(text, /\b([A-Z]{3}\d{6})\b/);

    // Customer Name
    booking.renter =
        find(text, /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+)([A-Za-z\/ ]+)\n/)
        || find(text, /\n([A-Za-z]+\/[A-Za-z]+)\n/);

    // Email
    booking.email =
        find(text, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);

    // Phone
    booking.phone =
        find(text, /(\d{2}-\d{9}|\+\d+\s?\d+)/);

    // Pickup

    const pickup =
        text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);

    if (pickup) {

        booking.pickupDate = pickup[1];
        booking.pickupTime = pickup[2];

    }

    // Return

    const dates =
        [...text.matchAll(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/g)];

    if (dates.length >= 2) {

        booking.returnDate = dates[1][1];
        booking.returnTime = dates[1][2];

    }

    // Location

    const location =
        text.match(/Chic Network[^\n]+/);

    if (location) {

        booking.pickupLocation = location[0];
        booking.returnLocation = location[0];

    }

    // Car

    const car =
        text.match(/Toyota[^\n]+/);

    if (car) {

        booking.car = car[0];

    }

    // Amount

    const amount =
        text.match(/([\d,.]+)\s*THB/);

    if (amount) {

        booking.amount = amount[1].replace(/,/g, "");
        booking.currency = "THB";

    }

    return booking;

}

module.exports = parseKlook;