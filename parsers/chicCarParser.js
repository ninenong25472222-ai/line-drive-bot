const Booking=require("../models/booking");

function parseChicCar(text){

    const booking=Booking();

    booking.company="Chic Car Rent";

    booking.rawText=text;

    return booking;

}

module.exports=parseChicCar;