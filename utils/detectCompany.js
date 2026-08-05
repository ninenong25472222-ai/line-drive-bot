function detectCompany(inputText = "") {
    const text = String(inputText || "")
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // ============================
    // KLOOK
    // ============================

    const hasKlook =
        /\bKLOOK\b/i.test(text) ||
        /@klook\.com/i.test(text) ||
        /klook_booking_reference_number/i.test(
            text
        );

    console.log(
        "HAS KLOOK :",
        hasKlook
    );

    if (hasKlook) {
        return "klook";
    }

    // ============================
    // TRIP
    // ============================

    const hasTrip =
        /\bTRIP\.?\s*COM\b/i.test(text) ||
        /TRIP\.COM\s+TRAVEL\s+SINGAPORE/i.test(
            text
        ) ||
        /\bC\d{10,20}\b/.test(text);

    console.log(
        "HAS TRIP :",
        hasTrip
    );

    if (hasTrip) {
        return "trip";
    }

    // ============================
    // CHICCAR
    // ต้องตรวจก่อน Reservation
    // ============================

    const hasChicCar =
        /Renter\s+Name/i.test(text) ||

        /www\.chiccarrent\.com/i.test(
            text
        ) ||

        /reservations?\.c@chiccarrent\.com/i.test(
            text
        ) ||

        (
            /Reservation\s+No\.?/i.test(
                text
            ) &&
            /Chic\s+Network/i.test(
                text
            )
        );

    console.log(
        "HAS CHICCAR :",
        hasChicCar
    );

    if (hasChicCar) {
        return "chiccar";
    }

    // ============================
    // RESERVATION
    // ============================

    const hasReservation =
        (
            /Reservation\s+ref\.?\s+number/i.test(
                text
            ) &&
            /Driver'?s\s+Name/i.test(
                text
            )
        ) ||

        (
            /Confirmation\s+number/i.test(
                text
            ) &&
            /Pick\s*-?\s*up\s+date/i.test(
                text
            )
        ) ||

        (
            /Drop\s*-?\s*off\s+date\s*&\s*time/i.test(
                text
            ) &&
            /Vehicle\s+Name/i.test(
                text
            )
        );

    console.log(
        "HAS RESERVATION :",
        hasReservation
    );

    if (hasReservation) {
        return "reservation";
    }

    return "other";
}

module.exports = detectCompany;