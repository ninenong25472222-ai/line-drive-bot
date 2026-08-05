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
    const dates = [...text.matchAll(/\d{1,2}\/\d{1,2}\/\d{4}/g)];

if(dates.length >= 2){

    booking.pickupDate = dates[0][0];
    booking.returnDate = dates[1][0];

    }

    // -----------------------------
    // Pickup Time / Return Time
    // -----------------------------
    const times = [...text.matchAll(/\d{2}:\d{2}/g)];

if(times.length >= 2){

    booking.pickupTime = times[0][0];
    booking.returnTime = times[1][0];

    }

    // -----------------------------
    // Pickup / Return Location
    // -----------------------------
    const airport = text.match(
    /(Surat Thani Airport|SURAT THANI AIRPORT)/i
);

if(airport){

    booking.pickupLocation = airport[1];
    booking.returnLocation = airport[1];

    }

    // -----------------------------
    // Vehicle
    // -----------------------------
    const car = text.match(
    /(TOYOTA|HONDA|MITSUBISHI|NISSAN|MAZDA|ISUZU|SUZUKI|MG|BYD)[\s\S]{0,80}/i
);

if(car){

    booking.car = car[0]
        .replace(/\n/g," ")
        .replace(/\s+/g," ")
        .trim();

    }

    // -----------------------------
    // Total Amount
    // -----------------------------
    const amount = text.match(
    /Total[\s:]*([\d,]+\.\d{2})/i
);

    return booking;

}

module.exports = parseChicCar;