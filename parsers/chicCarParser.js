const Booking = require("../models/booking");

function parseChicCar(text) {

    text = text
        .replace(/\r/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();

    const booking = Booking();

    booking.company = "ChicCar";
    booking.rawText = text;

    // -----------------------------
    // Reservation No.
    // -----------------------------
    const bookingNo = text.match(
        /Reservation\s+No\.\s*([\d]+)/i
    );

    if (bookingNo) {
        booking.bookingNo = bookingNo[1].trim();
    }

    // -----------------------------
    // Customer Name
    // -----------------------------
    const customer = text.match(
        /Renter Name\s*([\s\S]*?)\nE-?Mail/i
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
        /E-?Mail\s*([^\s]+)/i
    );

    if (email) {
        booking.customerEmail = email[1].trim();
    }

    // -----------------------------
    // Phone
    // -----------------------------
    const phone = text.match(
        /Tel\.\s*([\d-]+)/i
    );

    if (phone) {
        booking.customerPhone = phone[1].trim();
    }

    // -----------------------------
    // Pickup Date
    // -----------------------------
    const pickupDate = text.match(
        /Date\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i
    );

    if (pickupDate) {

        booking.pickupDate =
            `${pickupDate[1]}/${pickupDate[2]}/${pickupDate[3]}`;

    }

    // -----------------------------
    // Return Date
    // -----------------------------
    const returnDate = text.match(
        /Date\s*\d+\s*\/\s*\d+\s*\/\s*\d+\s*Date\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i
    );

    if (returnDate) {

        booking.returnDate =
            `${returnDate[1]}/${returnDate[2]}/${returnDate[3]}`;

    }

    // -----------------------------
    // Pickup / Return Time
    // -----------------------------
    const times = text.match(
        /(\d{2}:\d{2})\s+(\d{2}:\d{2})/
    );

    if (times) {

        booking.pickupTime = times[1];
        booking.returnTime = times[2];

    }

    // -----------------------------
    // Pickup / Return Location
    // -----------------------------
    const location = text.match(
        /(SURAT THANI AIRPORT)\s+(SURAT THANI AIRPORT)/i
    );

    if (location) {

        booking.pickupLocation = location[1].trim();
        booking.returnLocation = location[2].trim();

    }

    // -----------------------------
    // Vehicle
    // -----------------------------
    const car = text.match(
        /Vehicle Details\s*([\s\S]*?)Or Similar/i
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
        /Total\s*([\d,]+\.\d{2})/i
    );

    if (total) {

        booking.amount = total[1].replace(/,/g, "");
        booking.currency = "THB";

    }

    return booking;

}

module.exports = parseChicCar;