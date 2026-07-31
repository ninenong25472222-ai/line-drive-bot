function detectCompany(text){

    text=text.toLowerCase();

    if(text.includes("trip.com"))
        return "trip";

    if(text.includes("klook"))
        return "klook";

    if(text.includes("reservation"))
        return "reservation";

    if(text.includes("chic car"))
        return "chiccar";

    return "unknown";

}

module.exports=detectCompany;