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
    const hasPlus = raw.startsWith("+");
    const digits = raw.replace(/\D/g, "");

    if (!digits) {
        return "";
    }

    return hasPlus
        ? `+${digits}`
        : digits;
}

function titleWords(value = "") {
    return toOneLine(value)
        .toLowerCase()
        .replace(
            /\b[a-z]/g,
            letter => letter.toUpperCase()
        );
}

// ============================
// Reservation Number
// ============================

function extractBookingNumber(text) {
    const source = toOneLine(text);

    const match = source.match(
        /Reservation\s*No\.?\s*[:#-]?\s*(\d{9,15})/i
    );

    return match
        ? match[1]
        : "";
}

// ============================
// Customer Name
// ============================

function extractCustomerName(text) {
    const source = toOneLine(text);

    const patterns = [
        /Renter\s+Name\s*:?[\s-]*([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){1,4})(?=\s+(?:Telephone|E-?Mail|Pick\s*Up|Return|Date|Time)\b)/i,

        /([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){1,4})\s+E-?Mail\b/i
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);

        if (match) {
            return toOneLine(match[1]);
        }
    }

    return "";
}

// ============================
// Customer Email
// ============================

function extractEmail(text) {
    const emails = [
        ...String(text).matchAll(
            /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
        )
    ].map(item => item[0]);

    return (
        emails.find(email =>
            !/reservations?\.[^@]*@chiccarrent\.com/i.test(
                email
            ) &&
            !/@chiccarrent\.com$/i.test(
                email
            )
        ) ||

        emails.find(email =>
            !/@chiccarrent\.com$/i.test(
                email
            )
        ) ||

        ""
    );
}

// ============================
// Customer Phone
// ============================

function extractCustomerPhone(
    text,
    bookingNo = ""
) {
    const source = toOneLine(text);

    const labelledPatterns = [
        /Telephone\.?\s*[:#-]?\s*(\+?\d[\d\s()-]{7,}\d)/i,

        /Customer\s+Phone\s*[:#-]?\s*(\+?\d[\d\s()-]{7,}\d)/i,

        /Renter\s+Phone\s*[:#-]?\s*(\+?\d[\d\s()-]{7,}\d)/i
    ];

    for (
        const pattern of labelledPatterns
    ) {
        const match = source.match(pattern);

        if (match) {
            const phone =
                normalizePhone(match[1]);

            if (phone) {
                return phone;
            }
        }
    }

    const candidates = [
        ...source.matchAll(
            /\+?\d[\d\s()-]{7,}\d/g
        )
    ]
        .map(match => ({
            raw: match[0],

            digits:
                match[0].replace(
                    /\D/g,
                    ""
                ),

            index:
                match.index || 0
        }))
        .filter(
            item =>
                item.digits.length >= 9 &&
                item.digits.length <= 13
        )
        .filter(
            item =>
                item.digits !==
                String(bookingNo || "")
        )
        .filter(
            item =>
                !/^02?2866799$/.test(
                    item.digits
                )
        )
        .filter(
            item =>
                !/^009990/.test(
                    item.digits
                )
        );

    /*
        ในเอกสาร ChicCar ตัวอย่าง:
        - เบอร์ลูกค้า 33667869459 = 11 หลัก
        - เบอร์สาขา 0950328080 = 10 หลัก
    */

    const preferred =
        candidates.find(
            item =>
                item.digits.length === 11
        ) ||

        candidates.find(
            item =>
                item.raw
                    .trim()
                    .startsWith("+")
        ) ||

        candidates.find(
            item =>
                item.digits.length === 10
        );

    return preferred
        ? normalizePhone(preferred.raw)
        : "";
}

// ============================
// Pickup / Return Dates
// ============================

function extractDates(text) {
    const dates = [];

    const regex =
        /\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\b/g;

    let match;

    while (
        (match = regex.exec(text)) !== null
    ) {
        const value =
            `${match[1]}/${match[2]}/${match[3]}`;

        if (!dates.includes(value)) {
            dates.push(value);
        }
    }

    return dates;
}

// ============================
// Pickup / Return Times
// ============================

function extractTimes(text) {
    const source = toOneLine(text);

    const times = [];

    const regex =
        /\b([01]?\d|2[0-3]):[0-5]\d\b/g;

    let match;

    while (
        (match = regex.exec(source)) !==
        null
    ) {
        if (!times.includes(match[0])) {
            times.push(match[0]);
        }
    }

    return times;
}

// ============================
// Airport Locations
// ============================

function extractAirportLocations(text) {
    const source = toOneLine(text);

    const results = [];

    /*
        ตัวอย่าง:
        SURAT THANI AIRPORT
        SURAT THANI AIRPORT
    */

    const upperRegex =
        /\b([A-Z]+(?:\s+[A-Z]+){0,3}?\s+AIRPORT)\b/g;

    let match;

    while (
        (match =
            upperRegex.exec(source)) !==
        null
    ) {
        const location =
            titleWords(match[1]);

        if (
            location &&
            !results.includes(location)
        ) {
            results.push(location);
        }
    }

    /*
        สำรองจากชื่อสาขา:
        Chic Network Surat Thani Airport 1
    */

    if (results.length === 0) {
        const branchRegex =
            /Chic\s+Network\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,5}\s+Airport)(?:\s+\d+)?/gi;

        while (
            (match =
                branchRegex.exec(source)) !==
            null
        ) {
            const location =
                titleWords(match[1]);

            if (
                location &&
                !results.includes(location)
            ) {
                results.push(location);
            }
        }
    }

    return results;
}

// ============================
// Vehicle
// ============================

function extractCar(text) {
    const source = toOneLine(text);

    const knownCars = [
        [
            /\bXPANDER(?:\s+1\.5\s+A\/T)?\b/i,
            "Mitsubishi Xpander"
        ],

        [
            /\bPAJERO(?:\s+SPORT)?\b/i,
            "Mitsubishi Pajero Sport"
        ],

        [
            /\bHR\s*-?\s*V\b/i,
            "Honda HR-V"
        ],

        [
            /\bCITY\b/i,
            "Honda City"
        ],

        [
            /\bCIVIC\b/i,
            "Honda Civic"
        ],

        [
            /\bYARIS\s+ATIV\b/i,
            "Toyota Yaris Ativ"
        ],

        [
            /\bYARIS\b/i,
            "Toyota Yaris"
        ],

        [
            /\bVIOS\b/i,
            "Toyota Vios"
        ],

        [
            /\bCOROLLA(?:\s+ALTIS)?\b/i,
            "Toyota Corolla Altis"
        ],

        [
            /\bFORTUNER\b/i,
            "Toyota Fortuner"
        ],

        [
            /\bCAMRY\b/i,
            "Toyota Camry"
        ],

        [
            /\bALPHARD\b/i,
            "Toyota Alphard"
        ],

        [
            /\bD\s*-?\s*MAX\b/i,
            "Isuzu D-Max"
        ],

        [
            /\bSWIFT\b/i,
            "Suzuki Swift"
        ],

        [
            /\bERTIGA\b/i,
            "Suzuki Ertiga"
        ],

        [
            /\bATTO\s*3\b/i,
            "BYD Atto 3"
        ],

        [
            /\bSEAL\b/i,
            "BYD Seal"
        ]
    ];

    for (
        const [pattern, name]
        of knownCars
    ) {
        if (pattern.test(source)) {
            return name;
        }
    }

    const generic = source.match(
        /\b(TOYOTA|HONDA|MITSUBISHI|NISSAN|MAZDA|ISUZU|SUZUKI|MG|BYD|FORD|HYUNDAI|KIA)\b\s*[-:]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,40}?)(?=\s+Or\s+Similar\b|\s+All\s+vehicles\b|$)/i
    );

    if (!generic) {
        return "";
    }

    return (
        `${titleWords(generic[1])} ` +
        `${toOneLine(generic[2])}`
    ).trim();
}

// ============================
// Main Parser
// ============================

function parseChicCar(inputText) {
    const booking = Booking();

    const text = cleanText(
        inputText || ""
    );

    booking.company = "ChicCar";
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
        extractCustomerPhone(
            text,
            booking.bookingNo
        );

    booking.phone =
        booking.customerPhone;

    const dates =
        extractDates(text);

    if (dates.length >= 1) {
        booking.pickupDate =
            dates[0];
    }

    if (dates.length >= 2) {
        booking.returnDate =
            dates[1];
    }

    const times =
        extractTimes(text);

    if (times.length >= 1) {
        booking.pickupTime =
            times[0];
    }

    if (times.length >= 2) {
        booking.returnTime =
            times[1];
    }

    const locations =
        extractAirportLocations(text);

    booking.pickupLocation =
        locations[0] || "";

    booking.returnLocation =
        locations[1] ||
        locations[0] ||
        "";

    booking.car =
        extractCar(text);

    return booking;
}

module.exports = parseChicCar;