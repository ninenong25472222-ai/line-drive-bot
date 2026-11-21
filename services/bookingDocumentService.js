const { readPDF } = require("./pdfReader");
const parserService = require("./parserService");

const DATE_TIME_FIELDS = ["pickupDate", "pickupTime", "returnDate", "returnTime"];

function present(value) {
    return value != null && String(value).trim() !== "";
}

function dateTimeScore(booking = {}) {
    return DATE_TIME_FIELDS.reduce((score, field) => score + (present(booking[field]) ? 1 : 0), 0);
}

function isRecognized(booking = {}) {
    return present(booking.company) && String(booking.company).toLowerCase() !== "other";
}

function mightBeBooking(text = "", booking = {}) {
    return isRecognized(booking) || /(?:pick\s*-?\s*up|drop\s*-?\s*off|return|รับรถ|คืนรถ|วันส่งรถ|วันคืนรถ|ใบจอง|booking confirmation)/i.test(text);
}

async function readBookingDocument(buffer, dependencies = {}) {
    const readPdf = dependencies.readPdf || readPDF;
    const parse = dependencies.parse || parserService.parse;
    const sourceText = await readPdf(buffer);
    const initial = parse(sourceText) || { company: "Other" };

    if (dateTimeScore(initial) === DATE_TIME_FIELDS.length || !mightBeBooking(sourceText, initial)) {
        return { text: sourceText, booking: initial, usedOcrFallback: false };
    }

    let ocrText;
    try {
        ocrText = await readPdf(buffer, { forceOCR: true });
    } catch (error) {
        // Text-layer data remains useful for manual review when OCR is offline.
        console.warn("BOOKING_OCR_FALLBACK_FAILED", error?.code || "ocr_error");
        return { text: sourceText, booking: initial, usedOcrFallback: false, ocrFailed: true };
    }

    const ocrBooking = parse(ocrText) || { company: "Other" };
    const initialScore = dateTimeScore(initial);
    const ocrScore = dateTimeScore(ocrBooking);
    const preferred = ocrScore > initialScore || (!isRecognized(initial) && isRecognized(ocrBooking))
        ? { ...ocrBooking }
        : { ...initial };

    // Preserve stronger text-layer values, using OCR only to fill fields that
    // were absent. This avoids replacing clear dates/times with OCR guesses.
    let filledFromOcr = false;
    for (const field of DATE_TIME_FIELDS) {
        if (present(initial[field])) preferred[field] = initial[field];
        else if (present(ocrBooking[field])) { preferred[field] = ocrBooking[field]; filledFromOcr = true; }
    }
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
    };
}

module.exports = { readBookingDocument, dateTimeScore, mightBeBooking };
