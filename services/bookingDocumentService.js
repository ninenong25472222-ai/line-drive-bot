const { readPDF } = require("./pdfReader");
const parserService = require("./parserService");

const DATE_TIME_FIELDS = ["pickupDate", "pickupTime", "returnDate", "returnTime"];

const THAI_MONTHS = {
    "ม.ค.": 1, "มกราคม": 1, "ก.พ.": 2, "กุมภาพันธ์": 2,
    "มี.ค.": 3, "มีนาคม": 3, "เม.ย.": 4, "เมษายน": 4,
    "พ.ค.": 5, "พฤษภาคม": 5, "มิ.ย.": 6, "มิถุนายน": 6,
    "ก.ค.": 7, "กรกฎาคม": 7, "ส.ค.": 8, "สิงหาคม": 8,
    "ก.ย.": 9, "กันยายน": 9, "ต.ค.": 10, "ตุลาคม": 10,
    "พ.ย.": 11, "พฤศจิกายน": 11, "ธ.ค.": 12, "ธันวาคม": 12,
};

const ENGLISH_MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function present(value) {
    return value != null && String(value).trim() !== "";
}

function isRecognized(booking = {}) {
    return present(booking.company) && String(booking.company).toLowerCase() !== "other";
}

function validIsoDate(year, month, day) {
    year = Number(year);
    month = Number(month);
    day = Number(day);
    if (year >= 2400) year -= 543;
    if (year < 1900 || year > 2200 || month < 1 || month > 12) return "";
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDate(value) {
    const source = String(value || "").trim().replace(/[๐-๙]/g, digit => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
    let match = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) return validIsoDate(match[1], match[2], match[3]);
    match = source.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (match) return validIsoDate(match[3], match[2], match[1]); // Booking documents use day/month/year.

    const thai = source.replace(/\s+/g, "").match(/^(\d{1,2})(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)(\d{4})$/);
    if (thai) {
        const monthLabel = thai[2].replace(/\.$/, ".");
        const month = THAI_MONTHS[monthLabel];
        if (month) return validIsoDate(thai[3], month, thai[1]);
    }

    const englishPattern = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
    match = source.match(new RegExp(`^(${englishPattern})\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i"));
    if (match) return validIsoDate(match[3], ENGLISH_MONTHS[match[1].slice(0, 3).toLowerCase()], match[2]);
    match = source.match(new RegExp(`^(\\d{1,2})\\s+(${englishPattern})\\s+(\\d{4})$`, "i"));
    if (match) return validIsoDate(match[3], ENGLISH_MONTHS[match[2].slice(0, 3).toLowerCase()], match[1]);
    return "";
}

function normalizeTime(value) {
    const source = String(value || "").trim().replace(/[๐-๙]/g, digit => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
    const match = source.match(/^(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*:\s*(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return "";
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = match[3] == null ? 0 : Number(match[3]);
    const meridiem = (match[4] || "").toUpperCase();
    if (minute > 59 || second > 59 || (meridiem && (hour < 1 || hour > 12)) || hour > 23) return "";
    if (meridiem) hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeSchedule(booking = {}) {
    const normalized = { ...booking };
    normalized.pickupDate = normalizeDate(booking.pickupDate);
    normalized.returnDate = normalizeDate(booking.returnDate);
    normalized.pickupTime = normalizeTime(booking.pickupTime);
    normalized.returnTime = normalizeTime(booking.returnTime);

    const score = DATE_TIME_FIELDS.reduce((count, field) => count + (present(normalized[field]) ? 1 : 0), 0);
    const complete = score === DATE_TIME_FIELDS.length;
    const startsAt = complete ? `${normalized.pickupDate}T${normalized.pickupTime}` : "";
    const endsAt = complete ? `${normalized.returnDate}T${normalized.returnTime}` : "";
    const chronological = !complete || endsAt > startsAt;
    if (!chronological) {
        for (const field of DATE_TIME_FIELDS) normalized[field] = "";
    }
    return { booking: normalized, score: chronological ? score : 0, complete: complete && chronological, chronological };
}

function mightBeBooking(text = "", booking = {}) {
    return isRecognized(booking) || /(?:pick\s*-?\s*up|drop\s*-?\s*off|return|รับรถ|คืนรถ|วันส่งรถ|วันคืนรถ|ใบจอง|booking confirmation)/i.test(text);
}

async function readBookingDocument(buffer, dependencies = {}) {
    const readPdf = dependencies.readPdf || readPDF;
    const parse = dependencies.parse || parserService.parse;
    const sourceText = await readPdf(buffer);
    const initial = parse(sourceText) || { company: "Other" };
    const initialSchedule = normalizeSchedule(initial);

    if (initialSchedule.complete || !mightBeBooking(sourceText, initial)) {
        return { text: sourceText, booking: initialSchedule.booking, usedOcrFallback: false, scheduleIssue: !initialSchedule.chronological ? "pickup_after_return" : "" };
    }

    let ocrText;
    try {
        ocrText = await readPdf(buffer, { forceOCR: true });
    } catch (error) {
        // Text-layer data remains useful for manual review when OCR is offline.
        console.warn("BOOKING_OCR_FALLBACK_FAILED", error?.code || "ocr_error");
        return { text: sourceText, booking: initialSchedule.booking, usedOcrFallback: false, ocrFailed: true, scheduleIssue: !initialSchedule.chronological ? "pickup_after_return" : "" };
    }

    const ocrBooking = parse(ocrText) || { company: "Other" };
    const ocrSchedule = normalizeSchedule(ocrBooking);
    let selectedSchedule = ocrSchedule.score > initialSchedule.score ? ocrSchedule : initialSchedule;
    let filledFromOcr = selectedSchedule === ocrSchedule && ocrSchedule.score > initialSchedule.score;
    if (selectedSchedule === initialSchedule && initialSchedule.chronological && ocrSchedule.chronological) {
        const merged = { ...initialSchedule.booking };
        for (const field of DATE_TIME_FIELDS) {
            if (!present(merged[field]) && present(ocrSchedule.booking[field])) merged[field] = ocrSchedule.booking[field];
        }
        const mergedSchedule = normalizeSchedule(merged);
        if (mergedSchedule.chronological && mergedSchedule.score > initialSchedule.score) {
            selectedSchedule = mergedSchedule;
            filledFromOcr = true;
        }
    }
    const preferred = { ...(selectedSchedule === ocrSchedule || (!isRecognized(initial) && isRecognized(ocrBooking)) ? ocrBooking : initial) };
    for (const field of DATE_TIME_FIELDS) preferred[field] = selectedSchedule.booking[field];
    if (!isRecognized(preferred) && isRecognized(initial)) preferred.company = initial.company;
    if (!present(preferred.bookingNo)) preferred.bookingNo = initial.bookingNo || ocrBooking.bookingNo || "";
    if (!present(preferred.customerName)) preferred.customerName = initial.customerName || ocrBooking.customerName || "";
    if (!present(preferred.customerPhone)) preferred.customerPhone = initial.customerPhone || ocrBooking.customerPhone || "";
    if (!present(preferred.car)) preferred.car = initial.car || ocrBooking.car || "";

    const usedOcrFallback = filledFromOcr || !isRecognized(initial) && isRecognized(ocrBooking);
    return {
        text: usedOcrFallback ? ocrText : sourceText,
        booking: preferred,
        usedOcrFallback,
        ocrFailed: false,
        scheduleIssue: !selectedSchedule.chronological ? "pickup_after_return" : "",
    };
}

module.exports = { readBookingDocument, mightBeBooking, normalizeDate, normalizeTime, normalizeSchedule };
