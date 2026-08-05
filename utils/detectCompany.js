function detectCompany(inputText = "") {
    const text = String(inputText || "")
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // ============================
    // KLOOK
    // ต้องตรวจ Klook ก่อน ChicCar
    // เพราะเอกสาร Klook อาจมีคำว่า Chic Network
    // ============================

    const hasKlook =
        /\bKLOOK\b/i.test(text) ||
        /operator@klook\.com/i.test(text) ||
        /\bHDAV_[A-Z0-9_-]+/i.test(text) ||
        (
            /Chic\s+Network\s*-/i.test(text) &&
            /\b[A-Z]{3}\d{6,12}\b/i.test(text)
        );

    console.log("HAS KLOOK :", hasKlook);

    if (hasKlook) {
        return "klook";
    }

    // ============================
    // TRIP.COM
    // ============================

    const hasTrip =
        /\bTRIP\.?\s*COM\b/i.test(text) ||
        /TRIP\.COM\s+TRAVEL\s+SINGAPORE/i.test(text) ||
        /Trip\.com/i.test(text) ||
        /\bC\d{10,20}\b/.test(text);

    console.log("HAS TRIP :", hasTrip);

    if (hasTrip) {
        return "trip";
    }

    // ============================
    // RESERVATION
    // ============================

    const hasReservation =
        /Reservation\s+(?:Confirmation|Voucher|Number|No\.?)/i.test(
            text
        ) ||
        /Booking\s+Reservation/i.test(text) ||
        /Reservation\s+Details/i.test(text);

    console.log(
        "HAS RESERVATION :",
        hasReservation
    );

    if (hasReservation) {
        return "reservation";
    }

    // ============================
    // CHIC CAR
    // ห้ามใช้ Chic Network อย่างเดียว
    // เพราะอาจเป็นเอกสารจาก Klook
    // ============================

    const hasChicCar =
        /CHIC\s*CAR\s*RENT/i.test(text) ||
        /CHICCARRENT/i.test(text) ||
        /chiccarrent\.com/i.test(text) ||
        /Chic\s+Car\s+Rental/i.test(text);

    console.log("HAS CHICCAR :", hasChicCar);

    if (hasChicCar) {
        return "chiccar";
    }

    return "other";
}

module.exports = detectCompany;