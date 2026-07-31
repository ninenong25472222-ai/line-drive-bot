const Booking = require("../models/booking");

function parseReservation(text){

    const booking = Booking();

    booking.company = "Reservation";

    booking.rawText = text;


    // เลขจอง
    const ref = text.match(
        /Reservation ref\. number:\s*([A-Z0-9-]+)/i
    );

    if(ref){
        booking.bookingNo = ref[1];
    }


    // ชื่อผู้เช่า
    const driver = text.match(
        /Driver's Name\s*(.+)/i
    );

    if(driver){
        booking.customerName = driver[1].trim();
    }


    // วันที่รับ
    const pickupDate = text.match(
        /Pick-up date\s*(\d{2}\.\d{2}\.\d{4})/i
    );

    if(pickupDate){
        booking.pickupDate = pickupDate[1];
    }


    // เวลารับ
    const pickupTime = text.match(
        /Pick-up time\s*(\d{2}:\d{2})/i
    );

    if(pickupTime){
        booking.pickupTime = pickupTime[1];
    }


    // วันที่คืน + เวลาคืน
    const dropoff = text.match(
        /Drop-off date & time\s*(\d{2}\.\d{2}\.\d{4})\s*(\d{2}:\d{2})/i
    );

    if(dropoff){

        booking.returnDate = dropoff[1];
        booking.returnTime = dropoff[2];

    }


    // จุดรับ
    const location = text.match(
        /Pick-up location\s*(.*?)Airport/i
    );

    if(location){

        booking.pickupLocation =
            location[1].trim() + " Airport";

    }


    // จุดคืน
    const returnLocation = text.match(
        /Drop-off location\s*(.*?)Airport/i
    );

    if(returnLocation){

        booking.returnLocation =
            returnLocation[1].trim() + " Airport";

    }


    // รถ
    const car = text.match(
        /Vehicle Name\s*(.+)/i
    );

    if(car){

        booking.car = car[1].trim();

    }


    return booking;

}


module.exports = parseReservation;