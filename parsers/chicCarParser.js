const Booking = require("../models/booking");

function parseChicCar(text) {

    text = text
        .replace(/\r/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim();

    const booking = Booking();

    booking.company = "ChicCar";
    booking.rawText = text;

    // -----------------------------
    // Reservation No.
    // -----------------------------
    const bookingNo = text.match(
        /Reservation\s*No\.\s*([0-9]+)/i
    );

    if (bookingNo) {
        booking.bookingNo = bookingNo[1].trim();
    }

    // -----------------------------
    // Customer Phone
    // -----------------------------
    const phone = text.match(
        /Chic Network.*?\n([0-9-]+)/is
    );

    if (phone) {
        booking.customerPhone = phone[1].trim();
    }

    // -----------------------------
    // Customer Name
    // -----------------------------
    const customer = text.match(
        /\d{3}-\d{7}\s*([\s\S]*?)\s*E-Mail/i
    );

    if (customer) {
        booking.customerName = customer[1]
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    // -----------------------------
    // Email
    // -----------------------------
    const email = text.match(
        /E-Mail\s*([^\s]+)/i
    );

    if (email) {
        booking.customerEmail = email[1].trim();
    }

    // -----------------------------
    // Pickup Date / Return Date
    // -----------------------------
    const dates = text.match(
        /Date\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4}).*?Date\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/is
    );

    if (dates) {

        booking.pickupDate =
            `${dates[1]}/${dates[2]}/${dates[3]}`;

        booking.returnDate =
            `${dates[4]}/${dates[5]}/${dates[6]}`;

    }

    // -----------------------------
    // Pickup Time / Return Time
    // -----------------------------
    const times = text.match(
        /(\d{2}:\d{2})\s*(\d{2}:\d{2})/
    );

    if (times) {

        booking.pickupTime = times[1];
        booking.returnTime = times[2];

    }

    // -----------------------------
    // Pickup / Return Location
    // -----------------------------
    const locations = text.match(
        /(SURAT THANI AIRPORT)\s+(SURAT THANI AIRPORT)/i
    );

    if (locations) {

        booking.pickupLocation = locations[1].trim();
        booking.returnLocation = locations[2].trim();

    }

    // -----------------------------
    // Vehicle
    // -----------------------------
    const car = text.match(
        /Vehicle Details([\s\S]*?)Or Similar/i
    );

    if (car) {

        booking.car = car[1]
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .replace(/^-/, "")
            .trim();

    }

    // -----------------------------
    // Total Amount
    // -----------------------------
    const amount = text.match(
        /Total\s*([\d,]+\.\d{2})/i
    );

    if (amount) {

        booking.amount = amount[1].replace(/,/g, "");
        booking.currency = "THB";

    }

    return booking;

}

module.exports = parseChicCar;