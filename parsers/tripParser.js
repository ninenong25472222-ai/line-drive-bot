const Booking = require("../models/booking");

function parseTrip(text) {

    text = text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n");

    const booking = Booking();

    booking.company = "Trip";
    booking.rawText = text;

    // ---------------- Booking No ----------------

   let m = text.match(/Booking\s*(?:no\.?|number)?\s*:?\s*([A-Z0-9]+)/i);

    if (m) {
    booking.bookingNo = m[1].trim();
    }

    // ---------------- Customer ----------------

    m = text.match(/Main Driver Name\s*\n([^\n]+)/i);

    if (m) {
    booking.customerName = m[1].trim();
    }

    booking.renter = booking.customerName;

    // ---------------- Car ----------------

    m = text.match(
    /Car\s*type\s*([^\n]+?)\s*(?:Transmission|Seats)/i
);

if (m) {

    booking.car = m[1]
        .replace(/or similar/i, "")
        .replace(/\s+/g, " ")
        .trim();

}

    // ---------------- Phone ----------------

   m = text.match(/\+66[- ]?\d[\d-]{7,}/);

if (m) {

    booking.customerPhone =
        m[0].replace(/-/g, "");

}

    // ---------------- Pickup ----------------

    m = text.match(
/Pick-up\s*\n([\s\S]*?)Drop-off/i
);

if(m){

    const section = m[1];

    const airport =
        section.match(/([A-Za-z ]+Airport)/);

    if(airport){

        booking.pickupLocation =
            airport[1].trim();

    }

    const dt =
        section.match(
/(\d{1,2}:\d{2}\s*(?:AM|PM)),\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i
);

    if(dt){

        booking.pickupTime = dt[1];
        booking.pickupDate = dt[2];

    }

}
    
    // ---------------- Return ----------------

m = text.match(
/Drop-off\s*\n([\s\S]*)$/i
);

if(m){

    const section = m[1];

    const airport =
        section.match(/([A-Za-z ]+Airport)/);

    if(airport){

        booking.returnLocation =
            airport[1].trim();

    }

    const dt =
        section.match(
/(\d{1,2}:\d{2}\s*(?:AM|PM)),\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i
);

    if(dt){

        booking.returnTime = dt[1];
        booking.returnDate = dt[2];

    }

}

    return booking;
}

module.exports = parseTrip;