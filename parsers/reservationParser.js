const Booking = require("../models/booking");

function parseReservation(text){

    const booking = Booking();

    booking.company = "Reservation";

    booking.rawText = text;


    // เลขจอง
    booking.bookingNo =
        find(text, /(?:booking|reservation)\s*(?:no|number)?\s*[:#]?\s*([A-Z0-9-]+)/i);


    // ชื่อลูกค้า
    booking.customerName =
        find(text, /(?:customer|name|guest)\s*[:：]?\s*(.+)/i);


    // วันที่รับ
    booking.pickupDate =
        find(text, /(?:pickup|pick up)\s*date?\s*[:：]?\s*(.+)/i);


    // เวลารับ
    booking.pickupTime =
        find(text, /(?:pickup|pick up)\s*time?\s*[:：]?\s*(.+)/i);


    // วันที่คืน
    booking.returnDate =
        find(text, /(?:return|drop off)\s*date?\s*[:：]?\s*(.+)/i);


    // เวลาคืน
    booking.returnTime =
        find(text, /(?:return|drop off)\s*time?\s*[:：]?\s*(.+)/i);


    // รถ
    booking.car =
        find(text, /(?:car|vehicle|model)\s*[:：]?\s*(.+)/i);


    return booking;

}


function find(text, regex){

    const match = text.match(regex);

    return match ? match[1].trim() : "";

}


module.exports = parseReservation;