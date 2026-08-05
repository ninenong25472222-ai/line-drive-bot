const Booking = require("../models/booking");

function cleanText(value = "") {
    return String(value)
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(/\u00A0/g, " ")
        .replace(
            /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
            " "
        )
        .replace(/\uFFFD/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function toOneLine(value = "") {
    return cleanText(value)
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizePhone(value = "") {
    const raw = String(value).trim();

    const hasPlus =
        raw.startsWith("+");

    const digits =
        raw.replace(/\D/g, "");

    if (!digits) {
        return "";
    }

    return hasPlus
        ? `+${digits}`
        : digits;
}

function normalizeLocation(value = "") {
    return toOneLine(value)
        .replace(
            /^(?:Pick\s*-?\s*up|Drop\s*-?\s*off)\s+location\s*:?[\s-]*/i,
            ""
        )
        .replace(
            /\s+(?:Customer\s+responsibility|Excess|Deposit|Vehicle|Vehicle\s+Name)\b.*$/i,
            ""
        )
        .replace(/\s+/g, " ")
        .trim();
}

// ============================
// Booking Number
// ============================

function extractBookingNumber(text) {
    const source =
        toOneLine(text);

    const reservationRef =
        source.match(
            /Reservation\s+ref\.?\s+number\s*:\s*([A-Z0-9-]{6,})/i
        );

    if (reservationRef) {
        return reservationRef[1];
    }

    const confirmation =
        source.match(
            /Confirmation\s+number\s*[:#-]?\s*([A-Z0-9-]{6,})/i
        );

    return confirmation
        ? confirmation[1]
        : "";
}

// ============================
// Customer Name
// ============================

function extractCustomerName(text) {
    const lines = cleanText(text)
        .split(/\n+/)
        .map(toOneLine)
        .filter(Boolean);

    for (const line of lines) {
        if (
            !/Driver'?s\s+Name/i.test(
                line
            )
        ) {
            continue;
        }

        const value = line
            .replace(
                /^.*?Driver'?s\s+Name\s*:?[\s-]*/i,
                ""
            )
            .split(
                /\s+(?:Driver'?s\s+(?:Birth\s+Date|Residence|Phone)|Vehicle\s+class|Transmission|Location)\b/i
            )[0]
            .trim();

        if (value) {
            return value;
        }
    }

    const source =
        toOneLine(text);

    const match = source.match(
        /Driver'?s\s+Name\s*:?[\s-]*([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){1,4})(?=\s+(?:Driver'?s\s+(?:Birth\s+Date|Residence|Phone)|Vehicle\s+class|Transmission|Location)\b)/i
    );

    return match
        ? toOneLine(match[1])
        : "";
}

// ============================
// Email
// ============================

function extractEmail(text) {
    const emails = [
        ...String(text).matchAll(
            /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
        )
    ].map(item => item[0]);

    return (
        emails.find(
            email =>
                !/@chiccarrent\.com$/i.test(
                    email
                )
        ) || ""
    );
}

// ============================
// Phone
// ============================

function extractPhone(text) {
    const source =
        toOneLine(text);

    const labelled = source.match(
        /Driver'?s\s+Phone\s+number\s*:?[\s-]*(\+?\d[\d\s()-]{7,}\d)/i
    );

    if (labelled) {
        return normalizePhone(
            labelled[1]
        );
    }

    const fallback = source.match(
        /\+\d[\d\s()-]{7,}\d|\b0\d{9}\b/
    );

    return fallback
        ? normalizePhone(fallback[0])
        : "";
}

// ============================
// Pickup Date
// ============================

function extractPickupDate(text) {
    const source =
        toOneLine(text);

    const match = source.match(
        /Pick\s*-?\s*up\s+date\s*:?[\s-]*(\d{1,2}\.\d{1,2}\.\d{4})/i
    );

    return match
        ? match[1]
        : "";
}

// ============================
// Pickup Time
// ============================

function extractPickupTime(text) {
    const source =
        toOneLine(text);

    const match = source.match(
        /Pick\s*-?\s*up\s+time\s*:?[\s-]*([0-2]?\d:[0-5]\d)/i
    );

    return match
        ? match[1]
        : "";
}

// ============================
// Return Date + Time
// ============================

function extractReturnDateTime(text) {
    const source =
        toOneLine(text);

    const match = source.match(
        /Drop\s*-?\s*off\s+date\s*&\s*time\s*:?[\s-]*(\d{1,2}\.\d{1,2}\.\d{4})\s+([0-2]?\d:[0-5]\d)/i
    );

    return match
        ? {
            date: match[1],
            time: match[2]
        }
        : {
            date: "",
            time: ""
        };
}

// ============================
// Pickup / Return Location
// ============================

function extractLocation(
    text,
    type
) {
    const lines = cleanText(text)
        .split(/\n+/)
        .map(toOneLine)
        .filter(Boolean);

    const labelPattern =
        type === "pickup"
            ? /Pick\s*-?\s*up\s+location/i
            : /Drop\s*-?\s*off\s+location/i;

    for (
        let i = 0;
        i < lines.length;
        i++
    ) {
        if (
            !labelPattern.test(lines[i])
        ) {
            continue;
        }

        let value = lines[i]
            .replace(
                /^.*?(?:Pick\s*-?\s*up|Drop\s*-?\s*off)\s+location\s*:?[\s-]*/i,
                ""
            )
            .split(
                /\s+(?:Cost\s+of\s+rental|Equipment\s+or\s+options|Customer\s+responsibility|Excess|Deposit|Vehicle)\b/i
            )[0]
            .trim();

        /*
            ใน PDF ตาราง คำว่า Airport
            อาจอยู่บรรทัดถัดไป
        */

        if (
            !/Airport$/i.test(value)
        ) {
            for (
                let j = i + 1;
                j <
                Math.min(
                    i + 6,
                    lines.length
                );
                j++
            ) {
                if (
                    /^Airport\b/i.test(
                        lines[j]
                    )
                ) {
                    value =
                        `${value} Airport`;

                    break;
                }
            }
        }

        if (value) {
            return normalizeLocation(
                value
            );
        }
    }

    return "";
}

// ============================
// Vehicle
// ============================

function extractCar(text) {
    const lines = cleanText(text)
        .split(/\n+/)
        .map(toOneLine)
        .filter(Boolean);

    for (const line of lines) {
        if (
            !/Vehicle\s+Name/i.test(
                line
            )
        ) {
            continue;
        }

        const value = line
            .replace(
                /^.*?Vehicle\s+Name\s*:?[\s-]*/i,
                ""
            )
            .split(
                /\s+(?:Package\s*\/\s*payment\s+type|SIPP|Vehicle\s+group|Vehicle\s+class|Transmission|Doors\s*\/\s*Seats|Air\s+conditioner|Cost\s+of\s+rental)\b/i
            )[0]
            .trim();

        if (value) {
            return value;
        }
    }

    const source =
        toOneLine(text);

    const match = source.match(
        /Vehicle\s+Name\s*:?[\s-]*(.{2,80}?)(?=\s+(?:Package\s*\/\s*payment\s+type|SIPP|Vehicle\s+group|Vehicle\s+class|Transmission|Doors\s*\/\s*Seats|Air\s+conditioner|Cost\s+of\s+rental)\b)/i
    );

    return match
        ? toOneLine(match[1])
        : "";
}

// ============================
// Main Parser
// ============================

function parseReservation(inputText) {
    const booking = Booking();

    const text = cleanText(
        inputText || ""
    );

    booking.company =
        "Reservation";

    booking.rawText = text;

    booking.bookingNo =
        extractBookingNumber(text);

    booking.customerName =
        extractCustomerName(text);

    booking.renter =
        booking.customerName;

    booking.customerEmail =
        extractEmail(text);

    booking.customerPhone =
        extractPhone(text);

    booking.phone =
        booking.customerPhone;

    booking.pickupDate =
        extractPickupDate(text);

    booking.pickupTime =
        extractPickupTime(text);

    const returnDateTime =
        extractReturnDateTime(text);

    booking.returnDate =
        returnDateTime.date;

    booking.returnTime =
        returnDateTime.time;

    booking.pickupLocation =
        extractLocation(
            text,
            "pickup"
        );

    booking.returnLocation =
        extractLocation(
            text,
            "return"
        );

    booking.car =
        extractCar(text);

    return booking;
}

module.exports = parseReservation;