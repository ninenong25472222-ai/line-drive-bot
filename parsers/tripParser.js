const Booking = require("../models/booking");

function find(text, regex) {
    const m = text.match(regex);
    return m ? m[1].trim() : "";
}

function parseTrip(text) {

    const booking = Booking();

    booking.company = "Trip.com";

    booking.bookingNo = find(
        text,
        /Booking\s*(?:No|Number)?[:\s]+([A-Z0-9\-]+)/i
    );

    booking.customerName = find(
        text,
        /Driver(?:'s)?\s*Name[:\s]+([^\n]+)/i
    );

    booking.pickupDate = find(
        text,
        /Pick[\s-]?up\s*Date[:\s]+([^\n]+)/i
    );

    booking.pickupTime = find(
        text,
        /Pick[\s-]?up\s*Time[:\s]+([^\n]+)/i
    );

    booking.returnDate = find(
        text,
        /Return\s*Date[:\s]+([^\n]+)/i
    );

    booking.returnTime = find(
        text,
        /Return\s*Time[:\s]+([^\n]+)/i
    );

    booking.vehicle = find(
        text,
        /(Toyota|Honda|Nissan|Mazda|MG|BYD|Mitsubishi|Isuzu|Ford|Suzuki)[^\n]*/i
    );

    booking.amount = find(
        text,
        /(THB|USD|EUR)\s*([\d,\.]+)/i
    );

    booking.rawText = text;

    return booking;

}

module.exports = parseTrip;