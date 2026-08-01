function detectCompany(text) {

    text = text.toLowerCase();

    // -------------------------
    // ChicCar
    // -------------------------
    if (
        text.includes("chic network") ||
        text.includes("chiccarrent.com") ||
        text.includes("reservations.c@chiccarrent.com") ||
        text.includes("vehicle details") ||
        text.includes("reservation no.") ||
        text.includes("reservation ref. no.")
    ) {
        return "chiccar";
    }

    // -------------------------
    // Trip.com
    // -------------------------
    if (
        text.includes("trip.com") ||
        text.includes("trip.com travel") ||
        text.includes("หมายเลขเวาเชอร์รับรถ")
    ) {
        return "trip";
    }

    // -------------------------
    // Klook
    // -------------------------
    if (
        text.includes("klook") ||
        text.includes("booking reference") ||
        text.includes("manage booking")
    ) {
        return "klook";
    }

    // -------------------------
    // Reservation
    // -------------------------
    if (
        text.includes("driver's name") ||
        text.includes("vehicle name") ||
        text.includes("reservation ref. number")
    ) {
        return "reservation";
    }

    return "unknown";

}

module.exports = detectCompany;