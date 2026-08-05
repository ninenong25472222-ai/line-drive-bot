const detectCompany = require("../utils/detectCompany");

const parseTrip = require("../parsers/tripParser");
const parseKlook = require("../parsers/klookParser");
const parseReservation = require("../parsers/reservationParser");
const parseChicCar = require("../parsers/chicCarParser");

function parse(text) {

    const company = detectCompany(text);

    console.log("===== DETECT COMPANY =====");
    console.log(company);
    console.log("==========================");

    switch (company) {

        case "trip":
            return parseTrip(text);

        case "reservation":
            return parseReservation(text);

        case "klook":
            return parseKlook(text);

        case "chiccar":
            return parseChicCar(text);

        default:
            return {
                company: "Other",
                rawText: text
            };

    }

}

module.exports = {
    parse
};