function normalize(value = "") {
    return String(value ?? "").toLowerCase().replace(/[\s_\-./()]+/g, "").trim();
}

function findColumn(headers, candidates) {
    const wanted = candidates.map(normalize);
    return headers.findIndex((header) => wanted.some((candidate) => normalize(header) === candidate || normalize(header).includes(candidate)));
}

function columnLetter(index) {
    let output = "", value = index + 1;
    while (value > 0) {
        const remainder = (value - 1) % 26;
        output = String.fromCharCode(65 + remainder) + output;
        value = Math.floor((value - 1) / 26);
    }
    return output;
}

function driveUrlFrom(value = "") {
    const match = String(value).match(/https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^\s]*id=)[A-Za-z0-9_-]+[^\s|)]*/i);
    return match ? match[0].replace(/[),.;]+$/, "") : "";
}

async function repairAppSheetPdfLinks({ auth, spreadsheetId, bookingSheetTitle = "Bookings" }) {
    if (!auth || !spreadsheetId) return { skipped: true, reason: "missing_configuration" };
    const { google } = require("googleapis");
    const sheets = google.sheets({ version: "v4", auth });
    const result = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${bookingSheetTitle}!A:ZZ`, valueRenderOption: "FORMATTED_VALUE" });
    const [headers = [], ...rows] = result.data.values || [];
    const pdfIndex = findColumn(headers, ["booking_pdf", "booking pdf", "pdf file", "ไฟล์ใบจอง"]);
    if (pdfIndex < 0) return { skipped: true, reason: "booking_pdf_column_not_found" };
    const candidates = [
        findColumn(headers, ["drive_url", "drive url", "file_url", "file url", "pdf_url", "pdf url"]),
        findColumn(headers, ["notes", "note", "หมายเหตุ"])
    ].filter((index) => index >= 0);
    const data = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index] || [];
        if (String(row[pdfIndex] || "").trim()) continue;
        const driveUrl = candidates.map((column) => driveUrlFrom(row[column])).find(Boolean);
        if (!driveUrl) continue;
        data.push({ range: `${bookingSheetTitle}!${columnLetter(pdfIndex)}${index + 2}`, values: [[driveUrl]] });
    }
    if (data.length) {
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
    }
    return { scanned: rows.length, repaired: data.length, skipped: false };
}

module.exports = { findColumn, columnLetter, driveUrlFrom, repairAppSheetPdfLinks };
