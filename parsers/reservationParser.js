const Booking=require("../models/booking");

function parseReservation(text){

    const booking=Booking();

    booking.company="Reservation";

    booking.rawText=text;

    return booking;

}

module.exports=parseReservation;