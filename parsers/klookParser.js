const Booking=require("../models/booking");

function parseKlook(text){

    const booking=Booking();

    booking.company="Klook";

    booking.rawText=text;

    return booking;

}

module.exports=parseKlook;