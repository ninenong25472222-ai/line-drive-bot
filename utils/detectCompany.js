function detectCompany(text) {

    text = text.toLowerCase();

    // -------------------------
    // Klook (เช็คก่อน)
    // -------------------------
    if (
        text.includes("klook") ||
        text.includes("merchant.klook.com") ||
        text.includes("operator@klook.com") ||
        text.includes("klook_booking_reference")
    ) {
        return "klook";
    }

    // -------------------------
    // Reservation
    // -------------------------
    if (
        text.includes("reservation ref. number") ||
        text.includes("driver's name") ||
        text.includes("vehicle name")
    ) {
        return "reservation";
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
    // ChicCar (เอกสารของ ChicCar โดยตรง)
    // -------------------------
    if (
        text.includes("vehicle details") ||
        text.includes("reservation no.") ||
        text.includes("booking source : chic")
    ) {
        return "chiccar";
    }

    return "unknown";
}

module.exports = detectCompany;