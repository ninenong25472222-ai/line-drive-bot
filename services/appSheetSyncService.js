const crypto = require("crypto");
const { google } = require("googleapis");
const { savePartnerUpload } = require("./rentalProService");

const normalize = (value = "") => String(value ?? "")
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, "")
    .trim();

const readTable = async (sheets, spreadsheetId, title) => {
    const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${title}!A:Z`,
        valueRenderOption: "FORMATTED_VALUE"
    });
    const rows = result.data.values || [];
    return { headers: rows[0] || [], rows: rows.slice(1) };
};

const findColumn = (headers, candidates) => {
    const normalizedHeaders = headers.map(normalize);
    const wanted = candidates.map(normalize);
    return normalizedHeaders.findIndex((header) => wanted.some((candidate) => header === candidate || header.includes(candidate)));
};

const cell = (row, headers, candidates) => {
    const index = findColumn(headers, candidates);
    return index >= 0 ? String(row[index] ?? "").trim() : "";
};

const driveUrlFrom = (value = "") => {
    const text = String(value ?? "").trim();
    const match = text.match(/https?:\/\/[^\s|]+/i);
    return match ? match[0].replace(/[),.;]+$/, "") : "";
};

const fileReferenceFrom = (value = "") => {
    const reference = String(value ?? "").trim().replace(/\\/g, "/");
    if (!reference || driveUrlFrom(reference)) return "";
    return /\.pdf$/i.test(reference) ? reference : "";
};

const driveFileName = (reference = "") => String(reference)
    .split("/")
    .pop()
    .trim();

const driveQueryValue = (value = "") => String(value).replace(/'/g, "\\'");

async function resolveAppSheetDriveUrl(drive, fileReference, cache) {
    const name = driveFileName(fileReference);
    if (!drive || !name) return "";
    if (cache.has(name)) return cache.get(name);
    try {
        const response = await drive.files.list({
            q: `name = '${driveQueryValue(name)}' and trashed = false`,
            spaces: "drive",
            corpora: "allDrives",
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            pageSize: 10,
            fields: "files(id,name,mimeType,webViewLink,createdTime)"
        });
        const file = (response.data.files || []).find((item) =>
            String(item.mimeType || "").toLowerCase() === "application/pdf" && item.webViewLink
        );
        const resolved = file ? String(file.webViewLink) : "";
        cache.set(name, resolved);
        return resolved;
    } catch (error) {
        // A missing Drive permission must not make the rest of the booking
        // dashboard unusable.  The card will truthfully show no file link.
        cache.set(name, "");
        return "";
    }
}

const createCarLookup = (table) => {
    const lookup = new Map();
    const referenceIndex = findColumn(table.headers, ["carref", "carid", "vehicleid", "ทะเบียน", "รหัสรถ"]);
    const makeIndex = findColumn(table.headers, ["make", "brand", "ยี่ห้อ"]);
    const modelIndex = findColumn(table.headers, ["model", "vehiclemodel", "รุ่น"]);
    const nameIndex = findColumn(table.headers, ["car", "vehicle", "ชื่อรถ", "รุ่นรถ"]);
    if (referenceIndex < 0) return lookup;
    for (const row of table.rows) {
        const reference = String(row[referenceIndex] ?? "").trim();
        if (!reference) continue;
        const make = makeIndex >= 0 ? String(row[makeIndex] ?? "").trim() : "";
        const model = modelIndex >= 0 ? String(row[modelIndex] ?? "").trim() : "";
        const name = nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : "";
        lookup.set(normalize(reference), [make, model].filter(Boolean).join(" ") || name || reference);
    }
    return lookup;
};

const buildBooking = (row, headers, carLookup) => {
    const bookingNo = cell(row, headers, ["bookingid", "bookingno", "เลขที่จอง", "เลขจอง"]);
    const customerName = cell(row, headers, ["customername", "rentername", "ชื่อลูกค้า", "ผู้เช่า"]);
    const carReference = cell(row, headers, ["carref", "carid", "vehicleid", "ทะเบียน", "รหัสรถ", "รถ"]);
    const pickupDate = cell(row, headers, ["pickupdate", "รับรถวันที่", "วันที่รับรถ"]);
    const returnDate = cell(row, headers, ["returndate", "คืนรถวันที่", "วันที่คืนรถ"]);
    if (!bookingNo || !customerName || !pickupDate || !returnDate) return null;
    const bookingPdf = cell(row, headers, ["booking_pdf", "booking pdf", "pdf file", "ไฟล์ใบจอง"]);
    const directLink = cell(row, headers, ["link", "url", "drive_url", "drive url", "file_url", "file url", "pdf_url", "pdf url"]);
    const notes = cell(row, headers, ["notes", "note", "หมายเหตุ"]);
    const driveUrl = [bookingPdf, directLink, notes].map(driveUrlFrom).find(Boolean) || "";
    return {
        company: "AppSheet",
        bookingNo,
        customerName,
        customerPhone: cell(row, headers, ["tel", "phone", "เบอร์โทร", "โทรศัพท์"]),
        customerEmail: cell(row, headers, ["email", "อีเมล"]),
        pickupDate,
        pickupTime: cell(row, headers, ["pickuptime", "เวลารับรถ", "เวลารับ"]),
        pickupLocation: cell(row, headers, ["pickuplocation", "จุดรับรถ", "สถานที่รับ"]),
        returnDate,
        returnTime: cell(row, headers, ["returntime", "เวลาคืนรถ", "เวลาคืน"]),
        returnLocation: cell(row, headers, ["returnlocation", "จุดคืนรถ", "สถานที่คืน"]),
        car: carLookup.get(normalize(carReference)) || carReference,
        total: cell(row, headers, ["total", "price", "amount", "ยอดรวม", "ราคา"]),
        deposit: cell(row, headers, ["deposit", "มัดจำ"]),
        source: cell(row, headers, ["bookingsource", "source", "ช่องทาง"]) || "AppSheet",
        driveUrl,
        fileReference: fileReferenceFrom(bookingPdf),
        fileName: driveUrl ? `Booking-${bookingNo}.pdf` : ""
    };
};

async function syncAppSheetBookings({ auth, spreadsheetId, bookingSheetTitle = "Bookings", carSheetTitle = "Car_Master" }) {
    if (!auth || !spreadsheetId) return { skipped: true, reason: "missing_configuration" };
    const sheets = google.sheets({ version: "v4", auth });
    const [bookingTable, carTable] = await Promise.all([
        readTable(sheets, spreadsheetId, bookingSheetTitle),
        readTable(sheets, spreadsheetId, carSheetTitle).catch(() => ({ headers: [], rows: [] }))
    ]);
    const drive = google.drive({ version: "v3", auth });
    const carLookup = createCarLookup(carTable);
    const results = { scanned: bookingTable.rows.length, imported: 0, duplicates: 0, skipped: 0, resolvedFiles: 0, unavailableFiles: 0 };
    const fileCache = new Map();
    for (const row of bookingTable.rows) {
        const booking = buildBooking(row, bookingTable.headers, carLookup);
        if (!booking) {
            results.skipped += 1;
            continue;
        }
        if (!booking.driveUrl && booking.fileReference) {
            const resolved = await resolveAppSheetDriveUrl(drive, booking.fileReference, fileCache);
            if (resolved) {
                booking.driveUrl = resolved;
                booking.fileName = `Booking-${booking.bookingNo}.pdf`;
                results.resolvedFiles += 1;
            } else {
                results.unavailableFiles += 1;
            }
        }
        const fileHash = crypto.createHash("sha256")
            .update(`appsheet:${spreadsheetId}:${booking.bookingNo}`)
            .digest("hex");
        const saved = await savePartnerUpload({
            booking,
            fileName: booking.fileName,
            fileHash,
            driveUrl: booking.driveUrl,
            source: "AppSheet",
            sourceLabel: "AppSheet / CarRental_System"
        });
        if (saved?.duplicate) results.duplicates += 1;
        else if (saved?.skipped) results.skipped += 1;
        else results.imported += 1;
    }
    return results;
}

module.exports = { buildBooking, driveUrlFrom, fileReferenceFrom, driveFileName, resolveAppSheetDriveUrl, syncAppSheetBookings };
