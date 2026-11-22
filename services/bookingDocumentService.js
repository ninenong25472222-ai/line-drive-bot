const { readPDF } = require("./pdfReader");
const parserService = require("./parserService");
const { normalizeDate, normalizeTime, normalizeSchedule } = require("../utils/dateTime");
const DATE_TIME_FIELDS = ["pickupDate", "pickupTime", "returnDate", "returnTime"];

function present(value) {
    return value != null && String(value).trim() !== "";
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
    const initialSchedule = normalizeSchedule(initial);

    // Date/time may be complete while text-layer extraction misses a Thai
    // customer name. OCR that case too so the dashboard can repair blank names.
    if ((initialSchedule.complete && present(initial.customerName || initial.renter)) || !mightBeBooking(sourceText, initial)) {
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
    if (!present(preferred.customerName) && present(preferred.renter)) preferred.customerName = preferred.renter;
    const filledCustomerNameFromOcr = !present(preferred.customerName) && present(ocrBooking.customerName || ocrBooking.renter);
    if (filledCustomerNameFromOcr) {
        preferred.customerName = ocrBooking.customerName || ocrBooking.renter;
        preferred.renter = preferred.customerName;
    }
    if (!isRecognized(preferred) && isRecognized(initial)) preferred.company = initial.company;
    if (!present(preferred.bookingNo)) preferred.bookingNo = initial.bookingNo || ocrBooking.bookingNo || "";
    if (!present(preferred.customerName)) preferred.customerName = initial.customerName || ocrBooking.customerName || "";
    if (!present(preferred.customerPhone)) preferred.customerPhone = initial.customerPhone || ocrBooking.customerPhone || "";
    if (!present(preferred.car)) preferred.car = initial.car || ocrBooking.car || "";

    const usedOcrFallback = filledFromOcr || filledCustomerNameFromOcr || !isRecognized(initial) && isRecognized(ocrBooking);
    return {
        text: usedOcrFallback ? ocrText : sourceText,
        booking: preferred,
        usedOcrFallback,
        ocrFailed: false,
        scheduleIssue: !selectedSchedule.chronological ? "pickup_after_return" : "",
    };
}

module.exports = { readBookingDocument, mightBeBooking, normalizeDate, normalizeTime, normalizeSchedule };
